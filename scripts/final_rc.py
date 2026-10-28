"""Start a keyless RC using a fresh copy of the curated dataset. Ctrl-C stops owned services.

The original demo DB/files, old web builds, and old processes are never changed. Media is copied
with APFS copy-on-write on this native host (preserving the exact source stat used by indexes).
No indexing worker is started. Optional :3701 uses explicitly scripted provider HTTP for QA;
the normal :3700 RC never installs a scripted provider.
"""

import argparse
import json
import signal
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg
from vms_native import PYTHON, ROOT, NativeStack, wait_for


class ReleaseStack(NativeStack):
    restored = False

    def start_api(self):
        if not self.restored:
            admin = self.env["DATABASE_URL"].rsplit("/", 1)[0] + "/postgres"
            with psycopg.connect(admin, autocommit=True) as db:
                db.execute("CREATE DATABASE veyra_final_qa")
            self.env["DATABASE_URL"] = (
                self.env["DATABASE_URL"].rsplit("/", 1)[0] + "/veyra_final_qa"
            )
            subprocess.run(
                [
                    "pg_restore",
                    "--exit-on-error",
                    "--no-owner",
                    "--no-privileges",
                    "-d",
                    self.env["DATABASE_URL"],
                    str(self.snapshot),
                ],
                check=True,
                capture_output=True,
                timeout=120,
            )
            self.restored = True
        super().start_api()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mediamtx", default="/tmp/veyra-mediamtx/mediamtx")
    parser.add_argument("--port", type=int, default=3700)
    parser.add_argument("--qa-provider", action="store_true")
    parser.add_argument(
        "--live-muse-requests",
        type=int,
        default=0,
        help="Enable the real provider key on this disposable copy with a hard cap of N "
        "admitted model requests (0.05 USD reservation each). Never combined with --qa-provider.",
    )
    parser.add_argument(
        "--snapshot",
        type=Path,
        default=ROOT / "runtime/backups/final-redesign02-checkpoint/demo.dump",
    )
    args = parser.parse_args()
    if args.live_muse_requests and (args.qa_provider or not 1 <= args.live_muse_requests <= 4):
        raise SystemExit("Live Muse needs 1-4 requests and cannot share a run with --qa-provider")
    if not args.snapshot.is_file():
        raise SystemExit("First create the read-only snapshot with final_runtime_inspect.py")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    runtime = Path("/tmp") / ("veyra-rc-" + stamp)
    runtime.mkdir(mode=0o700)  # refuse to reuse or erase an existing run
    subprocess.run(
        ["cp", "-cRp", str(ROOT / "runtime/demo/recordings"), str(runtime / "recordings")],
        check=True,
        capture_output=True,
        timeout=180,
    )
    library = ROOT / "runtime/video-library/library.json"
    assets = json.loads(library.read_text())["assets"]
    stack = ReleaseStack(
        args.mediamtx,
        runtime,
        publisher_paths=[a["media_path"] for a in assets],
        record_paths=(),
        preserve_recordings=True,
    )
    stack.snapshot = args.snapshot
    stack.env.update(
        MODEL_API_KEY="",
        MODEL_DAILY_BUDGET_USD="0",
        MODEL_REQUEST_RESERVE_USD="0",
        DEMO_LIBRARY_PATH=str(library),
        DEMO_ASSETS_ROOT=str(library.parent),
        DEMO_CURATED_ONLY="true",
        VEYRA_DIST_DIR=".next-rc",
    )
    if args.live_muse_requests:
        # The key is read from the private .env and never printed. The ledger of this fresh
        # database copy starts empty for the current UTC day, so the cap is absolute here.
        key = next(
            (
                line.split("=", 1)[1].strip()
                for line in (ROOT / ".env").read_text().splitlines()
                if line.startswith("MODEL_API_KEY=")
            ),
            "",
        )
        if not key:
            raise SystemExit("MODEL_API_KEY is not configured in .env")
        stack.env.update(
            MODEL_API_KEY=key,
            MODEL_DAILY_REQUESTS=str(args.live_muse_requests),
            MODEL_REQUEST_RESERVE_USD="0.05",
            MODEL_DAILY_BUDGET_USD=f"{0.05 * args.live_muse_requests:.2f}",
        )
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, stop)
    with stack:
        for asset in assets:
            stack.spawn(
                "replay-" + asset["asset_id"],
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "warning",
                    "-re",
                    "-stream_loop",
                    "-1",
                    "-i",
                    str(library.parent / asset["file"]),
                    "-map",
                    "0:v:0",
                    "-an",
                    "-c:v",
                    "copy",
                    "-f",
                    "rtsp",
                    "-rtsp_transport",
                    "tcp",
                    f"rtsp://127.0.0.1:{stack.ports['rtsp']}/{asset['media_path']}",
                ],
            )
        env = dict(
            stack.env, API_INTERNAL_URL=stack.api_url, WEB_ORIGIN=f"http://127.0.0.1:{args.port}"
        )
        stack.spawn(
            "web-rc",
            [
                "node",
                "node_modules/next/dist/bin/next",
                "start",
                "apps/web",
                "--hostname",
                "127.0.0.1",
                "--port",
                str(args.port),
            ],
            env,
        )
        descriptor = {
            "runtime": str(runtime),
            "web_url": env["WEB_ORIGIN"],
            "paid_calls_enabled": bool(args.live_muse_requests),
            "live_request_cap": args.live_muse_requests,
            "api_url": stack.api_url,
            "revision_at_start": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
            ).strip(),
            "build_id": (ROOT / "apps/web/.next-rc/BUILD_ID").read_text().strip(),
        }
        if args.qa_provider:
            from vms_native import free_port

            fixture_port = free_port()
            fixture_env = dict(stack.env, VEYRA_FINAL_TEST_DB="1", MEDIA_WORKER_ENABLED="false")
            fixture_env["PYTHONPATH"] = str(ROOT / "apps/api")
            stack.spawn(
                "api-scripted",
                [
                    str(PYTHON),
                    "-E",
                    "-m",
                    "uvicorn",
                    "final_fixture_api:app",
                    "--app-dir",
                    "scripts",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(fixture_port),
                ],
                fixture_env,
            )
            # Python -E ignores PYTHONPATH; the wrapper imports the API explicitly below.
            fixture_api = f"http://127.0.0.1:{fixture_port}"
            wait_for(
                lambda: httpx.get(fixture_api + "/health/ready", trust_env=False).status_code == 200
            )
            fixture_web = f"http://127.0.0.1:{args.port + 1}"
            stack.spawn(
                "web-scripted",
                [
                    "node",
                    "node_modules/next/dist/bin/next",
                    "start",
                    "apps/web",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    str(args.port + 1),
                ],
                dict(stack.env, API_INTERNAL_URL=fixture_api, WEB_ORIGIN=fixture_web),
            )
            descriptor.update(
                scripted_web_url=fixture_web,
                scripted_api_url=fixture_api,
                provider_scope="3701 only: scripted HTTP, not live Muse",
            )
        wait_for(lambda: httpx.get(env["WEB_ORIGIN"], trust_env=False).status_code == 200)
        private = ROOT / "runtime/final-rc.json"
        private.write_text(json.dumps(descriptor, indent=2) + "\n")
        private.chmod(0o600)
        print(json.dumps(descriptor, indent=2), flush=True)
        while not stopped:
            time.sleep(0.5)


if __name__ == "__main__":
    main()
