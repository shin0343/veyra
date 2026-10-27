"""Run migrations, PostgreSQL constraints, API, and Next against an isolated temporary DB.

Requires local PostgreSQL binaries and a completed `npm run build`.
Does not connect to an existing database or alter operator data.
"""

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runtime/feasibility/foundation"


def run(command, env=None):
    return subprocess.run(
        command, cwd=ROOT, env=env, check=True, capture_output=True, text=True, timeout=45
    )


def fetch(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=5) as r:
        return r.read()


def wait_for(url):
    for _ in range(40):
        try:
            return fetch(url)
        except (OSError, TimeoutError):
            time.sleep(0.25)
    raise RuntimeError(f"Service did not become ready: {url}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"observed_at": datetime.now(timezone.utc).isoformat(), "status": "failed"}
    processes = []
    with tempfile.TemporaryDirectory(prefix="veyra-pg-") as temporary:
        data = Path(temporary) / "data"
        sockets = Path(temporary) / "socket"
        sockets.mkdir()
        started = False
        try:
            run(
                [
                    "initdb",
                    "-D",
                    str(data),
                    "-A",
                    "trust",
                    "-U",
                    "veyra",
                    "--no-locale",
                    "--encoding=UTF8",
                ]
            )
            run(
                [
                    "pg_ctl",
                    "-D",
                    str(data),
                    "-l",
                    str(OUT / "postgres.log"),
                    "-o",
                    f"-h 127.0.0.1 -p 15439 -k {sockets}",
                    "-w",
                    "start",
                ]
            )
            started = True
            db_url = "postgresql://veyra@127.0.0.1:15439/postgres"
            env = dict(
                os.environ,
                DATABASE_URL=db_url,
                VEYRA_DEV_TOKEN="foundation-probe-token",
                API_INTERNAL_URL="http://127.0.0.1:18000",
                WEB_ORIGIN="http://127.0.0.1:13000",
                MEDIA_WORKER_ENABLED="false",
                CAMERA_SOURCES_JSON="{}",
                NEXT_TELEMETRY_DISABLED="1",
            )
            first = run([sys.executable, "-E", "scripts/migrate.py"], env)
            second = run([sys.executable, "-E", "scripts/migrate.py"], env)
            (OUT / "migrations.log").write_text(first.stdout + second.stdout)
            report["migration_apply_and_reapply"] = "Already applied" in second.stdout
            with psycopg.connect(db_url) as db:
                report["postgres_version"] = db.execute("SHOW server_version").fetchone()[0]
                camera_id, recording_id, segment_id = uuid4(), uuid4(), uuid4()
                db.execute(
                    "INSERT INTO cameras(id,name,source_id,media_path) VALUES (%s,%s,%s,%s)",
                    (camera_id, "Constraint fixture", "constraint", "constraint"),
                )
                db.execute(
                    """INSERT INTO recordings(id,camera_id,started_at,ended_at,status,
                    available_duration_ms) VALUES (%s,%s,now()-interval '10 seconds',now(),
                    'ready',10000)""",
                    (recording_id, camera_id),
                )
                db.execute(
                    """INSERT INTO segments(id,recording_id,storage_key,started_at,
                    duration_ms,offset_ms,status) VALUES (%s,%s,'fixture.mp4',
                    now()-interval '10 seconds',10000,0,'ready')""",
                    (segment_id, recording_id),
                )
                try:
                    with db.transaction():
                        db.execute(
                            """INSERT INTO layout_cells(layout_id,position,camera_id)
                            VALUES (%s,0,%s)""",
                            (uuid4(), camera_id),
                        )
                except psycopg.errors.ForeignKeyViolation:
                    report["foreign_key_rejection"] = True
                else:
                    raise RuntimeError("Invalid foreign key accepted")
                job_id = uuid4()
                db.execute(
                    """INSERT INTO analysis_jobs(id,recording_id,state,model_id,prompt_version)
                    VALUES (%s,%s,'succeeded','fixture-only','fixture-only')""",
                    (job_id, recording_id),
                )
                # This is an explicit SQL fixture, never presented as an actual model observation.
                db.execute(
                    """INSERT INTO video_metadata(id,segment_id,analysis_job_id,summary,
                    evidence_text,observation_start_ms,observation_end_ms,model_id,prompt_version,
                    schema_version,raw_output) VALUES (%s,%s,%s,'SQL fixture package',
                    'SQL fixture only',0,1000,'fixture-only','fixture-only','0.1.0','{}')""",
                    (uuid4(), segment_id, job_id),
                )
                count = db.execute("""SELECT count(*) FROM video_metadata
                    WHERE search_document @@ plainto_tsquery('simple','package')""").fetchone()[0]
                if count != 1:
                    raise RuntimeError("PostgreSQL FTS fixture query failed")
                report["fts_schema_fixture_query"] = True
            with (OUT / "api.log").open("w") as api_log, (OUT / "web.log").open("w") as web_log:
                api = subprocess.Popen(
                    [
                        sys.executable,
                        "-E",
                        "-m",
                        "uvicorn",
                        "veyra.main:app",
                        "--app-dir",
                        "apps/api",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "18000",
                    ],
                    cwd=ROOT,
                    env=env,
                    stdout=api_log,
                    stderr=api_log,
                )
                processes.append(api)
                readiness = json.loads(wait_for("http://127.0.0.1:18000/health/ready"))
                if readiness["status"] != "ready":
                    raise RuntimeError("Readiness did not verify the migrated database")
                report["api_readiness"] = True
                catalog = json.loads(
                    fetch(
                        "http://127.0.0.1:18000/api/v1/features?query=grid",
                        {"Authorization": "Bearer foundation-probe-token"},
                    )
                )
                if [item["id"] for item in catalog["items"]] != ["layouts"]:
                    raise RuntimeError("Feature catalog query failed")
                report["authenticated_catalog"] = True
                web = subprocess.Popen(
                    [
                        "node",
                        "node_modules/next/dist/bin/next",
                        "start",
                        "apps/web",
                        "--hostname",
                        "127.0.0.1",
                        "--port",
                        "13000",
                    ],
                    cwd=ROOT,
                    env=env,
                    stdout=web_log,
                    stderr=web_log,
                )
                processes.append(web)
                page = wait_for("http://127.0.0.1:13000").decode()
                proxied = json.loads(
                    fetch(
                        "http://127.0.0.1:13000/api/v1/features?query=grid",
                        {"Origin": "http://127.0.0.1:13000"},
                    )
                )
                if [item["id"] for item in proxied["items"]] != ["layouts"]:
                    raise RuntimeError("Next server did not reach the real API")
                if "foundation-probe-token" in page:
                    raise RuntimeError("Server credential appeared in rendered page")
                report["next_server_to_api"] = True
            report["status"] = "passed"
        except Exception as exc:
            report["error_type"] = type(exc).__name__
            raise
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.send_signal(signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            if started:
                run(["pg_ctl", "-D", str(data), "-m", "fast", "-w", "stop"])
            (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
