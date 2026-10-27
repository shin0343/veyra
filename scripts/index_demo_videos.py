"""Explicit, incremental genuine analysis of one finalized clip per named demo source.

Uses normal REST consent/job admission and the existing worker. No fabricated observations,
no full-recording reindex, and stable request keys across interrupted/repeated invocations.
"""

import argparse
import json
import sys
import time
from decimal import Decimal
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.config import Settings  # noqa: E402


def run(args):
    connection = json.loads(args.connection.read_text())
    settings = Settings()
    report = {
        "provider": "Genuine Meta Muse; standard production ingestion pipeline",
        "max_segments_per_job": 1,
        "jobs": [],
    }
    with httpx.Client(
        base_url=connection["api_url"],
        trust_env=False,
        timeout=60,
        headers={"Authorization": f"Bearer {connection['operator_token']}"},
    ) as client:

        def call(method, path, **kwargs):
            response = client.request(method, "/api/v1" + path, **kwargs)
            response.raise_for_status()
            return response.json()

        usage = call("GET", "/analysis-usage")
        report["usage_before"] = usage
        report["configured_limits"] = {
            "daily_requests": settings.model_daily_requests,
            "daily_budget_usd": settings.model_daily_budget_usd,
            "reserve_per_request_usd": settings.model_request_reserve_usd,
        }
        # Three lease attempts are the existing worst-case application retry allowance.
        worst_case = 3 * len(args.source_id) + 5
        reserve = Decimal(str(settings.model_request_reserve_usd))
        if usage["requests"] + worst_case > settings.model_daily_requests or Decimal(
            str(usage["reserved_usd"])
        ) + reserve * worst_case > Decimal(str(settings.model_daily_budget_usd)):
            raise RuntimeError("Insufficient configured headroom; no jobs queued")
        cameras = call("GET", "/cameras")["items"]
        recordings = call("GET", "/recordings?limit=100")["items"]
        selected = []
        for source_id in dict.fromkeys(args.source_id):
            camera = next((c for c in cameras if c["source_id"] == source_id), None)
            if not camera or not camera["enabled"] or not camera.get("source_media"):
                raise RuntimeError("Choose an enabled, licensed demo camera")
            recording = next(
                (
                    r
                    for r in recordings
                    if r["camera_id"] == camera["id"]
                    and r.get("source_media")
                    and r["source_media"]["sha256"] == camera["source_media"]["sha256"]
                    and r["available_duration_ms"] >= 1000
                ),
                None,
            )
            if not recording:
                raise RuntimeError("No finalized film recording; no jobs queued")
            selected.append((camera, recording))
        for camera, recording in selected:
            if not camera["cloud_analysis_allowed"]:
                call(
                    "PATCH",
                    f"/cameras/{camera['id']}",
                    headers={"Idempotency-Key": f"video01-consent-{camera['id']}"},
                    json={"cloud_analysis_allowed": True},
                )
            job = call(
                "POST",
                "/analysis-jobs",
                headers={"Idempotency-Key": f"video01-index-{recording['id']}-first-v1"},
                json={
                    "recording_id": recording["id"],
                    "allow_cloud_upload": True,
                    "max_segments": 1,
                },
            )
            if job["selected_segments"] != 1:
                raise RuntimeError("Unexpected analysis selection; inspect the existing job")
            report["jobs"].append(
                {
                    "source_id": camera["source_id"],
                    "camera_id": camera["id"],
                    "recording_id": recording["id"],
                    "job": job,
                }
            )
            print(
                json.dumps(
                    {"source_id": camera["source_id"], "job_id": job["id"], "selected_segments": 1}
                ),
                flush=True,
            )
        deadline = time.monotonic() + 900
        while True:
            for item in report["jobs"]:
                item["job"] = call("GET", f"/analysis-jobs/{item['job']['id']}")
            report["usage_after"] = call("GET", "/analysis-usage")
            args.report.parent.mkdir(exist_ok=True, parents=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")
            if all(item["job"]["state"] not in {"queued", "running"} for item in report["jobs"]):
                break
            if time.monotonic() > deadline:
                raise TimeoutError("Analysis still pending; report retains real job IDs")
            time.sleep(2)
        report["status"] = (
            "passed"
            if all(item["job"]["state"] == "succeeded" for item in report["jobs"])
            else "failed"
        )
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"status": report["status"], "usage_after": report["usage_after"]}))
        if report["status"] != "passed":
            raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection", type=Path, default=ROOT / "runtime/demo/connection.json")
    parser.add_argument("--source-id", action="append", required=True)
    parser.add_argument("--report", type=Path, default=ROOT / "docs/qa/video01/analysis.json")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
