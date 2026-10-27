"""Real RTSP pull -> HLS -> recording -> playback probe, using owned synthetic video.

Run: .venv/bin/python scripts/media_smoke.py --mediamtx /path/to/mediamtx
Creates only ignored runtime evidence; shuts down all children it starts.
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runtime/feasibility/media"


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read()


def poll(url: str, seconds=25) -> bytes:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            return fetch(url)
        except (OSError, TimeoutError):
            time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for local probe endpoint {url}")


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mediamtx", required=True)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    recording_root = OUT / "recordings" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    # The same product config is used, with loopback listeners and a separate recording root.
    env = dict(
        os.environ,
        MTX_APIADDRESS="127.0.0.1:19997",
        MTX_PLAYBACKADDRESS="127.0.0.1:19996",
        MTX_RTSPADDRESS="127.0.0.1:18554",
        MTX_HLSADDRESS="127.0.0.1:18888",
        MTX_PATHDEFAULTS_RECORDPATH=str(recording_root / "%path/%Y-%m-%d_%H-%M-%S-%f_%z"),
    )
    report = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "fixture": "FFmpeg lavfi testsrc2; no human footage",
        "status": "failed",
    }
    children = []
    try:
        with (OUT / "mediamtx.log").open("w") as log:
            server = subprocess.Popen(
                [args.mediamtx, str(ROOT / "infra/mediamtx/mediamtx.yml")],
                env=env,
                cwd=ROOT,
                stdout=log,
                stderr=log,
            )
            children.append(server)
            poll("http://127.0.0.1:19997/v3/paths/list", 10)
            # Publish to the simulated camera; then make MediaMTX pull that camera over RTSP.
            with (OUT / "ffmpeg.log").open("w") as ff_log:
                publisher = subprocess.Popen(
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
                        "libx264",
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
                        "rtsp://127.0.0.1:18554/fixture",
                    ],
                    stdout=ff_log,
                    stderr=ff_log,
                )
                children.append(publisher)
                # Local-only loopback pull is confined to this probe, outside source admission.
                # Product source_policy still forbids loopback camera URLs.
                request = urllib.request.Request(
                    "http://127.0.0.1:19997/v3/config/paths/add/pull-probe",
                    data=json.dumps(
                        {"source": "rtsp://127.0.0.1:18554/fixture", "rtspTransport": "tcp"}
                    ).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=5):
                    pass
                manifest = poll("http://127.0.0.1:18888/pull-probe/index.m3u8").decode()
                if "#EXTM3U" not in manifest:
                    raise RuntimeError("HLS manifest invalid")
                (OUT / "live-index.m3u8").write_text(manifest)
                report["hls_manifest"] = True
                report["rtsp_pull"] = True
                # Browser probe optional at install time, but required for a full browser claim.
                browser = subprocess.run(
                    ["node", str(ROOT / "scripts/media_browser_smoke.mjs"), "live"],
                    cwd=ROOT,
                    timeout=45,
                    capture_output=True,
                    text=True,
                )
                report["live_browser"] = browser.returncode == 0
                (OUT / "browser-live.log").write_text(browser.stdout + browser.stderr)
                time.sleep(12)  # finalize at least one real 10-second segment
                publisher.send_signal(signal.SIGINT)
                publisher.wait(timeout=10)
            spans = json.loads(poll("http://127.0.0.1:19996/list?path=pull-probe"))
            (OUT / "timespans.json").write_text(json.dumps(spans, indent=2))
            if not spans or spans[0]["duration"] <= 0:
                raise RuntimeError("No finalized recording timespan")
            params = urllib.parse.urlencode(
                {
                    "path": "pull-probe",
                    "start": spans[0]["start"],
                    "duration": min(6, spans[0]["duration"]),
                    "format": "mp4",
                }
            )
            playback_url = "http://127.0.0.1:19996/get?" + params
            recording = OUT / "playback.mp4"
            recording.write_bytes(fetch(playback_url))
            metadata = probe(recording)
            (OUT / "ffprobe.json").write_text(json.dumps(metadata, indent=2))
            if not any(s["codec_name"] == "h264" for s in metadata["streams"]):
                raise RuntimeError("Recorded media is not H264")
            report["recorded_duration_seconds"] = float(metadata["format"]["duration"])
            # Evidence from the initial direct-browser probe showed a zero-length seekable
            # range. The chosen approach materializes this bounded MP4 and serves FileResponse.
            with (OUT / "playback-server.log").open("w") as playback_log:
                cache_server = subprocess.Popen(
                    [
                        sys.executable,
                        "-E",
                        str(ROOT / "scripts/playback_fixture_server.py"),
                        "--file",
                        str(recording),
                    ],
                    cwd=ROOT,
                    stdout=playback_log,
                    stderr=playback_log,
                )
                children.append(cache_server)
            poll("http://127.0.0.1:19995/", 10)
            range_request = urllib.request.Request(
                "http://127.0.0.1:19995/media.mp4", headers={"Range": "bytes=0-127"}
            )
            with urllib.request.urlopen(range_request, timeout=5) as response:
                if response.status != 206 or len(response.read()) != 128:
                    raise RuntimeError("Cached MP4 server did not honor bounded Range")
                report["cached_mp4_range_206"] = True
            browser = subprocess.run(
                ["node", str(ROOT / "scripts/media_browser_smoke.mjs"), "playback", playback_url],
                cwd=ROOT,
                timeout=45,
                capture_output=True,
                text=True,
            )
            report["playback_browser"] = browser.returncode == 0
            (OUT / "browser-playback.log").write_text(browser.stdout + browser.stderr)
            report["status"] = (
                "passed" if report["live_browser"] and report["playback_browser"] else "partial"
            )
    except Exception as exc:
        report["error"] = str(exc)
        raise
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
