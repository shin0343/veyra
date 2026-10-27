"""Real loopback-only development stack without Docker; Ctrl-C stops owned processes.

Run with --mediamtx /absolute/path/to/mediamtx. No API credentials are printed.
"""

import argparse
import json
import os
import shlex
import signal
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_urlsafe

import httpx
import yaml

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / ".venv/bin/python"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(test, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            result = test()
            if result:
                return result
        except (httpx.HTTPError, OSError):
            pass
        time.sleep(0.3)
    raise RuntimeError("Local service did not become ready; inspect runtime logs")


class NativeStack:
    def __init__(
        self,
        mediamtx,
        runtime=None,
        publisher_paths=(),
        record_paths=None,
        preserve_recordings=False,
    ):
        self.runtime = (
            Path(runtime)
            if runtime
            else ROOT / "runtime/vms" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        )
        self.runtime = self.runtime.resolve()
        self.runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.mediamtx_binary = str(Path(mediamtx).resolve())
        self.children, self.logs, self.publishers = [], [], []
        self.api_process = None
        self.pg_started = False
        self.publisher_paths = tuple(publisher_paths)
        self.record_paths = record_paths
        self.preserve_recordings = preserve_recordings
        self.ports = {
            k: free_port() for k in ["postgres", "rtsp", "hls", "control", "playback", "api"]
        }
        self.token, self.viewer, self.hls_secret = (token_urlsafe(32) for _ in range(3))
        self.env = dict(os.environ)
        self.env.update(
            DATABASE_URL=f"postgresql://{os.environ['USER']}@127.0.0.1:{self.ports['postgres']}/veyra",
            VEYRA_DEV_TOKEN=self.token,
            VEYRA_VIEWER_TOKEN=self.viewer,
            CAMERA_SOURCES_JSON="{}",
            CAMERA_ALLOWED_CIDRS="",
            ENABLE_SAMPLE_CAMERA="true",
            SAMPLE_CAMERA_COUNT="4",
            RECORDINGS_ROOT=str(self.runtime / "recordings"),
            PLAYBACK_CACHE_ROOT=str(self.runtime / "cache"),
            MEDIAMTX_API_URL=f"http://127.0.0.1:{self.ports['control']}",
            MEDIAMTX_HLS_URL=f"http://127.0.0.1:{self.ports['hls']}",
            MEDIAMTX_PLAYBACK_URL=f"http://127.0.0.1:{self.ports['playback']}",
            MEDIAMTX_HLS_SECRET=self.hls_secret,
            MEDIA_RECONCILE_SECONDS=".5",
            MEDIA_WORKER_ENABLED="true",
            MEDIA_EGRESS_GUARD_FILE="",
            TZ="UTC",
        )
        # Empty optional path is interpreted as '.' by Pydantic: omit it completely.
        self.env.pop("MEDIA_EGRESS_GUARD_FILE", None)
        self.api_url = f"http://127.0.0.1:{self.ports['api']}"
        self.http = httpx.Client(
            base_url=self.api_url,
            timeout=20,
            trust_env=False,
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def command(self, args, **kwargs):
        return subprocess.run(
            args,
            env=self.env,
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
            **kwargs,
        )

    def spawn(self, name, args, env=None):
        log = (self.runtime / f"{name}.log").open("a")
        self.logs.append(log)
        child = subprocess.Popen(args, env=env or self.env, cwd=ROOT, stdout=log, stderr=log)
        self.children.append(child)
        return child

    def start(self):
        data = self.runtime / "postgres"
        if not (data / "PG_VERSION").is_file():
            self.command(["initdb", "-D", str(data), "-A", "trust", "--no-locale", "-E", "UTF8"])
        socket_dir = self.runtime / "socket"
        socket_dir.mkdir(exist_ok=True)
        self.command(
            [
                "pg_ctl",
                "-D",
                str(data),
                "-l",
                str(self.runtime / "postgres.log"),
                "-o",
                shlex.join(
                    ["-h", "127.0.0.1", "-p", str(self.ports["postgres"]), "-k", str(socket_dir)]
                ),
                "-w",
                "start",
            ]
        )
        self.pg_started = True
        import psycopg

        with psycopg.connect(
            self.env["DATABASE_URL"].rsplit("/", 1)[0] + "/postgres", autocommit=True
        ) as db:
            if not db.execute("SELECT 1 FROM pg_database WHERE datname='veyra'").fetchone():
                db.execute("CREATE DATABASE veyra")
        self.command([str(PYTHON), "-E", "scripts/migrate.py"])
        self.command([str(PYTHON), "-E", "scripts/migrate.py"])  # checksum/idempotency gate
        recordings = self.runtime / "recordings"
        recordings.mkdir(exist_ok=True)
        config = yaml.safe_load((ROOT / "infra/mediamtx/mediamtx.yml").read_text())
        config.update(
            apiAddress=f"127.0.0.1:{self.ports['control']}",
            playbackAddress=f"127.0.0.1:{self.ports['playback']}",
            rtspAddress=f"127.0.0.1:{self.ports['rtsp']}",
            hlsAddress=f"127.0.0.1:{self.ports['hls']}",
            hlsCDNSecret=self.hls_secret,
        )
        config["pathDefaults"].update(
            recordPath=str(recordings / "%path/%Y-%m-%d_%H-%M-%S-%f_%z"),
            runOnRecordSegmentComplete=shlex.join(
                [str(PYTHON), "-E", str(ROOT / "services/media/finalize.py")]
            ),
        )
        if self.preserve_recordings:
            config["pathDefaults"]["recordDeleteAfter"] = "0s"
        for media_path in self.publisher_paths:
            config["paths"].setdefault(media_path, {"source": "publisher"})
            config["authInternalUsers"][0]["permissions"].append(
                {"action": "publish", "path": media_path}
            )
        if self.record_paths is not None:
            for media_path, item in config["paths"].items():
                item["record"] = media_path in self.record_paths
        path = self.runtime / "mediamtx.yml"
        path.write_text(yaml.safe_dump(config))
        path.chmod(0o600)
        self.media_process = self.spawn("mediamtx", [self.mediamtx_binary, str(path)])
        wait_for(
            lambda: (
                httpx.get(
                    self.env["MEDIAMTX_API_URL"] + "/v3/paths/list", trust_env=False
                ).status_code
                == 200
            )
        )
        self.start_api()
        private = {
            "api_url": self.api_url,
            "operator_token": self.token,
            "viewer_token": self.viewer,
            "ports": self.ports,
            "database_url": self.env["DATABASE_URL"],
        }
        private_path = self.runtime / "connection.json"
        private_path.write_text(json.dumps(private))
        private_path.chmod(0o600)
        # Useful to start the unchanged frontend against this real backend.
        env_file = self.runtime / "web.env"
        env_file.write_text(
            f"API_INTERNAL_URL={self.api_url}\nVEYRA_DEV_TOKEN={self.token}\n"
            "WEB_ORIGIN=http://localhost:3000\n"
        )
        env_file.chmod(0o600)
        return self

    def start_api(self):
        self.api_process = self.spawn(
            "api",
            [
                str(PYTHON),
                "-E",
                "-m",
                "uvicorn",
                "veyra.main:app",
                "--app-dir",
                "apps/api",
                "--host",
                "127.0.0.1",
                "--port",
                str(self.ports["api"]),
                "--no-access-log",
            ],
        )
        wait_for(lambda: self.http.get("/health/ready").status_code == 200)

    def stop_api(self):
        self.api_process.terminate()
        self.api_process.wait(timeout=20)

    def sample(self, index=0, codec="libx264"):
        suffix = "" if index == 0 else f"_{index + 1}"
        child = self.spawn(
            f"ffmpeg{suffix}",
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-re",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=640x360:rate=15",
                "-an",
                "-c:v",
                codec,
                "-threads",
                "1",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-g",
                "15",
                "-bf",
                "0",
                "-f",
                "rtsp",
                "-rtsp_transport",
                "tcp",
                f"rtsp://127.0.0.1:{self.ports['rtsp']}/fixture{suffix}",
            ],
        )
        self.publishers.append(child)
        return child

    def close(self):
        for child in reversed(self.children):
            if child.poll() is None:
                child.send_signal(signal.SIGINT)
                try:
                    child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        self.http.close()
        if self.pg_started:
            self.command(
                ["pg_ctl", "-D", str(self.runtime / "postgres"), "-m", "fast", "-w", "stop"]
            )
        for log in self.logs:
            log.close()

    def __enter__(self):
        try:
            return self.start()
        except BaseException:
            self.close()
            raise

    def __exit__(self, *args):
        self.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mediamtx", required=True)
    parser.add_argument(
        "--runtime", help="Reuse this private directory to preserve the database/video"
    )
    args = parser.parse_args()
    with NativeStack(args.mediamtx, args.runtime) as stack:
        for index in range(4):
            stack.sample(index)
        print(f"Real API: {stack.api_url}; private connection details: {stack.runtime}", flush=True)
        print("Run scripts/seed_vms.py with --connection <runtime>/connection.json", flush=True)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
