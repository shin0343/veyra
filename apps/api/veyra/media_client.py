import json
import re
import subprocess
from pathlib import Path

import httpx

from .db import Problem


class MediaClient:
    def __init__(self, settings):
        self.settings = settings
        self.http = httpx.Client(
            timeout=httpx.Timeout(10, connect=2), follow_redirects=False, trust_env=False
        )

    def api(self, method, path, body=None):
        try:
            response = self.http.request(method, self.settings.mediamtx_api_url + path, json=body)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json() if response.content else {}
        except (httpx.HTTPError, ValueError):
            raise Problem(
                503, "MEDIA_UNAVAILABLE", "The media service is unavailable.", True
            ) from None

    def paths(self):
        return {
            item["name"]: item
            for item in self.api("GET", "/v3/paths/list?itemsPerPage=100").get("items", [])
        }

    def configure(self, path, source, registry):
        current = self.api("GET", f"/v3/config/paths/get/{path}")
        config = {"source": "publisher", "record": source.get("record", True)}
        if source["mode"] == "pull":
            if not registry.pull_guarded():
                raise Problem(
                    403,
                    "EGRESS_GUARD_REQUIRED",
                    "A camera egress policy must be installed before RTSP pull.",
                )
            config.update(source=source["url"], rtspTransport="tcp", rtspAnyPort=False)
        if current is None:
            self.api("POST", f"/v3/config/paths/add/{path}", config)
        elif any(current.get(key) != value for key, value in config.items()):
            self.api("PATCH", f"/v3/config/paths/patch/{path}", config)

    def remove(self, path):
        self.api("DELETE", f"/v3/config/paths/delete/{path}")

    def hls(self, path, resource):
        secret = self.settings.mediamtx_hls_secret.get_secret_value()
        if not secret:
            raise Problem(503, "MEDIA_UNAVAILABLE", "The internal HLS service is not configured.")
        try:
            result = self.http.get(
                f"{self.settings.mediamtx_hls_url}/{path}/{resource}",
                headers={"Authorization": f"Bearer {secret}"},
            )
            if result.status_code != 200:
                raise Problem(503, "STREAM_UNAVAILABLE", "This stream is not available.", True)
            if len(result.content) > self.settings.media_clip_max_bytes:
                raise Problem(503, "MEDIA_CAPACITY", "The stream fragment is too large.")
            return result.content, result.headers.get("content-type", "application/octet-stream")
        except httpx.HTTPError:
            raise Problem(
                503, "STREAM_UNAVAILABLE", "This stream is not available.", True
            ) from None

    def export(self, media_path, started_at, duration, destination: Path):
        size = 0
        try:
            with self.http.stream(
                "GET",
                self.settings.mediamtx_playback_url + "/get",
                params={
                    "path": media_path,
                    "start": started_at.isoformat(),
                    "duration": duration,
                    "format": "mp4",
                },
            ) as response:
                if response.status_code != 200:
                    raise Problem(404, "RECORDING_UNAVAILABLE", "Recorded video is unavailable.")
                with destination.open("xb") as output:
                    for chunk in response.iter_bytes(65536):
                        size += len(chunk)
                        if size > self.settings.media_clip_max_bytes:
                            raise Problem(
                                503, "MEDIA_CAPACITY", "The playback window is too large."
                            )
                        output.write(chunk)
        except httpx.HTTPError:
            raise Problem(
                503, "MEDIA_UNAVAILABLE", "Playback could not be prepared.", True
            ) from None
        return size

    def close(self):
        self.http.close()


def probe(path):
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        data = json.loads(result.stdout)
        streams = data["streams"]
        duration_ms = round(float(data["format"]["duration"]) * 1000)
        if duration_ms <= 0:
            raise ValueError
        return duration_ms, [stream["codec_name"].lower() for stream in streams]
    except (subprocess.SubprocessError, OSError, ValueError, KeyError):
        raise Problem(503, "INVALID_MEDIA", "Recorded video could not be verified.") from None


def safe_file(root: Path, key: str):
    root = root.resolve()
    if not key or "\\" in key or Path(key).is_absolute() or ".." in Path(key).parts:
        raise Problem(404, "RECORDING_UNAVAILABLE", "Recorded video is unavailable.")
    path = root / key
    if any(parent.is_symlink() for parent in [path, *path.parents] if parent != root.parent):
        raise Problem(404, "RECORDING_UNAVAILABLE", "Recorded video is unavailable.")
    resolved = path.resolve()
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise Problem(404, "RECORDING_UNAVAILABLE", "Recorded video is unavailable.")
    return resolved


def validate_range(value, size):
    if value is None:
        return
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    valid = False
    if match:
        start, end = match.groups()
        valid = (bool(start) and int(start) < size and (not end or int(end) >= int(start))) or (
            not start and bool(end) and int(end) > 0
        )
    if not valid:
        raise Problem(416, "INVALID_RANGE", "The requested byte range is not available.")
