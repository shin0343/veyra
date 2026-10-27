"""Fresh, isolated Phase 07 demo: real media, PostgreSQL, production Next and Meta.

Requires the existing private MODEL_API_KEY and positive model admission budgets.
The disposable database is separate from the operator workspace. No secret is reported.
"""

import argparse
import json
import os
import shlex
import signal
import subprocess
import sys
from datetime import datetime, timezone
from uuid import uuid4

from vms_native import PYTHON, ROOT, NativeStack, free_port, wait_for

sys.path.insert(0, str(ROOT / "apps/api"))
from veyra import index_store  # noqa: E402
from veyra.config import Settings  # noqa: E402
from veyra.db import Database  # noqa: E402


def run(args, report, output, stamp):
    configured = Settings()
    if not configured.model_api_key.get_secret_value() or not (
        configured.model_daily_budget_usd > 0 and configured.model_request_reserve_usd > 0
    ):
        report.update(status="blocked", reason="Private Meta credentials and budgets required")
        return
    with NativeStack(args.mediamtx, ROOT / "runtime/q7" / stamp[-13:-1]) as stack:
        # Private values stay in process environment and ignored runtime files.
        stack.stop_api()
        stack.env.update(
            MODEL_API_KEY=configured.model_api_key.get_secret_value(),
            MODEL_DAILY_BUDGET_USD=str(configured.model_daily_budget_usd),
            MODEL_REQUEST_RESERVE_USD=str(configured.model_request_reserve_usd),
            MODEL_DAILY_REQUESTS=str(configured.model_daily_requests),
        )
        stack.start_api()
        names = ["Front entrance", "Garden", "Garage", "Trail camera"]
        cameras = []
        for index, name in enumerate(names):
            body = {
                "name": name,
                "source_id": "sample" + (f"_{index + 1}" if index else ""),
                "cloud_analysis_allowed": index == 3,
                "location": "Licensed cycling replay" if index == 3 else "Synthetic FFmpeg fixture",
            }
            headers = {"Idempotency-Key": f"qa-camera-{index}"}
            first = stack.http.post("/api/v1/cameras", headers=headers, json=body)
            assert first.status_code == 201
            replay = stack.http.post("/api/v1/cameras", headers=headers, json=body)
            assert replay.json()["id"] == first.json()["id"]
            cameras.append(first.json())
        report["camera_registration"] = {"status": "passed", "duplicates_saved_once": True}
        for index in range(3):
            stack.sample(index)
        licensed = stack.spawn(
            "licensed-replay",
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-re",
                "-stream_loop",
                "-1",
                "-i",
                str(ROOT / "apps/api/tests/fixtures/video/cycling.mp4"),
                "-an",
                "-c:v",
                "libx264",
                "-threads",
                "1",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-r",
                "15",
                "-g",
                "15",
                "-bf",
                "0",
                "-f",
                "rtsp",
                "-rtsp_transport",
                "tcp",
                f"rtsp://127.0.0.1:{stack.ports['rtsp']}/fixture_4",
            ],
        )
        wait_for(
            lambda: all(
                c["status"] == "online" for c in stack.http.get("/api/v1/cameras").json()["items"]
            ),
            40,
        )
        report["four_rtsp_sources_online"] = True
        print(
            "Four real RTSP publishers online; recording licensed and synthetic fixtures.",
            flush=True,
        )
        wait_for(
            lambda: any(
                r["available_duration_ms"] >= 9000
                for r in stack.http.get(
                    "/api/v1/recordings", params={"camera_id": cameras[3]["id"]}
                ).json()["items"]
            ),
            45,
        )
        # Bound cloud cost: finalize this short replay, leaving three live synthetic sources.
        licensed.send_signal(signal.SIGINT)
        licensed.wait(timeout=15)
        wait_for(
            lambda: any(
                r["status"] == "ready"
                for r in stack.http.get(
                    "/api/v1/recordings", params={"camera_id": cameras[3]["id"]}
                ).json()["items"]
            )
        )
        wait_for(
            lambda: any(
                r["available_duration_ms"] >= 60000
                for r in stack.http.get(
                    "/api/v1/recordings", params={"camera_id": cameras[0]["id"]}
                ).json()["items"]
            ),
            90,
        )
        worker = stack.spawn("index-worker", [str(PYTHON), "-E", "services/worker/main.py"])
        web_port = free_port()
        origin = f"http://127.0.0.1:{web_port}"
        web_env = {**stack.env, "WEB_ORIGIN": origin, "API_INTERNAL_URL": stack.api_url}
        stack.spawn(
            "web",
            [
                "node",
                "node_modules/next/dist/bin/next",
                "start",
                "apps/web",
                "--hostname",
                "127.0.0.1",
                "--port",
                str(web_port),
            ],
            web_env,
        )
        import httpx

        wait_for(lambda: httpx.get(origin, trust_env=False).status_code == 200)
        probe = subprocess.run(
            ["node", "scripts/phase07_browser.mjs", origin, str(output)],
            cwd=ROOT,
            env={**os.environ, "NEXT_TELEMETRY_DISABLED": "1"},
            timeout=600,
        )
        report["browser_exit_code"] = probe.returncode
        browser = json.loads((output / "browser.json").read_text())
        report["browser"] = browser
        worker.send_signal(signal.SIGINT)
        worker.wait(timeout=60)
        database = Database(stack.env["DATABASE_URL"])
        with database.connect() as db:
            snapshot = {
                table: [str(row["id"]) for row in db.execute(f"SELECT id FROM {table} ORDER BY id")]
                for table in ("cameras", "layouts", "recordings", "video_metadata")
            }
            report["usage"] = index_store.usage(db).model_dump(mode="json")
            report["model_calls"] = db.execute(
                """SELECT operation,state,error_code,count(*) AS requests,
                sum(input_tokens) AS input_tokens,sum(output_tokens) AS output_tokens,
                sum(elapsed_ms) AS elapsed_ms FROM model_usage
                GROUP BY operation,state,error_code ORDER BY operation,state"""
            ).fetchall()
            report["indexing_clips"] = db.execute(
                """SELECT state,processing_ms,analyzed_end_ms-analyzed_start_ms AS analyzed_ms,
                error_code FROM segment_indexes WHERE state<>'waiting' ORDER BY segment_id"""
            ).fetchall()
        # Actual database process restart, separately from the API restart in vms-smoke.
        stack.command(["pg_ctl", "-D", str(stack.runtime / "postgres"), "-m", "fast", "-w", "stop"])
        report["database_outage_status"] = stack.http.get("/health/ready").status_code
        assert report["database_outage_status"] == 503
        stack.command(
            [
                "pg_ctl",
                "-D",
                str(stack.runtime / "postgres"),
                "-l",
                str(stack.runtime / "postgres.log"),
                "-o",
                shlex.join(
                    [
                        "-h",
                        "127.0.0.1",
                        "-p",
                        str(stack.ports["postgres"]),
                        "-k",
                        str(stack.runtime / "socket"),
                    ]
                ),
                "-w",
                "start",
            ]
        )
        wait_for(lambda: stack.http.get("/health/ready").status_code == 200)
        with database.connect() as db:
            for table, identifiers in snapshot.items():
                after = {str(row["id"]) for row in db.execute(f"SELECT id FROM {table}")}
                assert set(identifiers) <= after, table
        for layout_id in snapshot["layouts"]:
            assert stack.http.get(f"/api/v1/layouts/{layout_id}").status_code == 200
        report["database_restart_persistence"] = {
            "status": "passed",
            "row_counts": {table: len(ids) for table, ids in snapshot.items()},
        }
        # Tokens are read only for the test and never copied into the report.
        for label, auth in (("missing", None), ("invalid", "Bearer invalid")):
            headers = {"Authorization": auth} if auth else {}
            response = httpx.get(
                stack.api_url + "/api/v1/cameras", headers=headers, trust_env=False
            )
            assert response.status_code == 401
            report[f"{label}_credentials_status"] = response.status_code
        response = stack.http.post(
            "/api/v1/cameras",
            headers={"Authorization": f"Bearer {stack.viewer}", "Idempotency-Key": str(uuid4())},
            json={"name": "Denied", "source_id": "sample"},
        )
        assert response.status_code == 403
        report["viewer_mutation_status"] = response.status_code
        report["status"] = "passed" if probe.returncode == 0 else "failed"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mediamtx", default="/tmp/veyra-mediamtx/mediamtx")
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = ROOT / "docs/qa/evidence" / stamp
    output.mkdir(parents=True)
    report = {
        "status": "failed",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "provider": "genuine Meta Muse; no HTTP/provider mocks",
        "actual_api_cost_usd": None,
    }
    try:
        run(args, report, output, stamp)
    except Exception as exc:
        report["status"] = "failed"
        report["error_type"] = type(exc).__name__
        # Inspect private runtime logs locally; never dump exception bodies/credentials.
    finally:
        (output / "system.json").write_text(json.dumps(report, indent=2, default=str) + "\n")
        print(json.dumps({"status": report["status"], "evidence": str(output.relative_to(ROOT))}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
