"""Server-only configuration. Camera URLs never enter wire schemas or database rows."""

import hashlib
import ipaddress
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr

from .db import Problem
from .index_media import media_info
from .models import SourceMedia
from .settings import Settings as BaseSettings
from .source_policy import validate_rtsp_source


class Settings(BaseSettings):
    camera_sources_json: str = Field(default="{}", repr=False)
    veyra_viewer_token: SecretStr = SecretStr("")
    mediamtx_api_url: str = "http://127.0.0.1:9997"
    mediamtx_hls_url: str = "http://127.0.0.1:8888"
    mediamtx_playback_url: str = "http://127.0.0.1:9996"
    mediamtx_hls_secret: SecretStr = SecretStr("")
    recordings_root: Path = Path("runtime/recordings")
    playback_cache_root: Path = Path("runtime/playback-cache")
    media_egress_guard_file: Path | None = None
    camera_allowed_ports: str = "554,8554"
    enable_sample_camera: bool = False
    sample_camera_count: int = Field(default=1, ge=1, le=4)
    media_reconcile_seconds: float = Field(default=2, ge=0.2, le=30)
    media_session_seconds: int = Field(default=300, ge=2, le=3600)
    media_cache_max_bytes: int = 256 * 1024 * 1024
    media_clip_max_bytes: int = 64 * 1024 * 1024
    media_worker_enabled: bool = True
    indexing_poll_seconds: float = Field(default=2, ge=0.2, le=30)
    indexing_sample_ms: int = Field(default=500, ge=250, le=5000)
    indexing_clip_ms: int = Field(default=10000, ge=1000, le=10000)
    indexing_motion_threshold: float = Field(default=0.035, gt=0, le=1)
    indexing_max_segment_ms: int = Field(default=60000, ge=1000, le=300000)
    indexing_max_upload_bytes: int = Field(default=20 * 1024 * 1024, ge=1024, le=20 * 1024 * 1024)
    model_daily_requests: int = Field(default=100, ge=1, le=1000)
    model_daily_budget_usd: float = Field(default=0, ge=0, le=100)
    model_request_reserve_usd: float = Field(default=0, ge=0, le=10)
    model_input_usd_per_million: float | None = Field(default=None, ge=0)
    model_output_usd_per_million: float | None = Field(default=None, ge=0)
    demo_library_path: Path | None = None
    demo_assets_root: Path = Path("runtime/video-library")
    demo_curated_only: bool = False


class SourceRegistry:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.sources = {}
        try:
            sources = json.loads(settings.camera_sources_json)
            if not isinstance(sources, dict):
                raise ValueError
            for source_id, source in sources.items():
                if not re.fullmatch(r"[a-z0-9_-]{1,64}", source_id):
                    raise ValueError
                if not isinstance(source, dict) or source.get("mode") != "pull":
                    raise ValueError
                uri = source.get("url", "")
                validate_rtsp_source(
                    uri,
                    settings.camera_allowed_cidrs.split(",")
                    if settings.camera_allowed_cidrs
                    else [],
                )
                endpoint = urlsplit(uri)
                if (endpoint.port or 554) not in self.allowed_ports:
                    raise ValueError
                self.sources[source_id] = {"mode": "pull", "url": uri}
            if settings.enable_sample_camera:
                if "sample" in self.sources:
                    raise ValueError
                for index in range(settings.sample_camera_count):
                    suffix = "" if index == 0 else f"_{index + 1}"
                    if f"sample{suffix}" in self.sources:
                        raise ValueError
                    self.sources[f"sample{suffix}"] = {
                        "mode": "publisher",
                        "path": f"fixture{suffix}",
                        "label": "Development test pattern",
                        "source_media": SourceMedia(
                            kind="synthetic",
                            asset_id=f"test-pattern{suffix}",
                            title="FFmpeg test pattern",
                            creator="Veyra",
                            license="Project-generated technical fixture",
                            changes="Synthetic transport fixture; no real scene evidence.",
                        ).model_dump(mode="json"),
                    }
            self.load_demo_library()
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Invalid camera source configuration; values are redacted") from None

    def load_demo_library(self):
        """Operator-only fixed file publishers; never admit a new RTSP pull destination."""
        if not self.settings.demo_library_path:
            return
        path = self.settings.demo_library_path
        if path.stat().st_size > 128 * 1024:
            raise ValueError
        document = json.loads(path.read_text())
        assets = document["assets"]
        if not isinstance(assets, list) or not 1 <= len(assets) <= 8:
            raise ValueError
        seen = set()
        for asset in assets:
            source_id, media_path = asset["source_id"], asset["media_path"]
            if not re.fullmatch(r"[a-z0-9_-]{1,64}", source_id):
                raise ValueError
            if not re.fullmatch(r"[a-z0-9_-]{1,64}", media_path):
                raise ValueError
            if source_id in seen:
                raise ValueError
            seen.add(source_id)
            previous = self.sources.get(source_id)
            if previous and (previous["mode"] != "publisher" or previous["path"] != media_path):
                raise ValueError
            if any(
                s["path"] == media_path
                for key, s in self.sources.items()
                if key != source_id and s["mode"] == "publisher"
            ):
                raise ValueError
            media = SourceMedia.model_validate(asset["media"])
            if media.kind != "prerecorded" or not media.sha256:
                raise ValueError
            video = self.demo_file(asset["file"])
            poster = self.demo_file(asset["poster"])
            if hashlib.sha256(video.read_bytes()).hexdigest() != media.sha256:
                raise ValueError
            if hashlib.sha256(poster.read_bytes()).hexdigest() != asset["poster_sha256"]:
                raise ValueError
            try:
                inspected = media_info(video)
                dimensions = {
                    "video_width": inspected["width"],
                    "video_height": inspected["height"],
                }
            except Problem:
                dimensions = {}
            self.sources[source_id] = {
                "mode": "publisher",
                "path": media_path,
                "label": asset["camera_name"] + " · Prerecorded demo",
                "source_media": media.model_dump(mode="json"),
                "poster": poster,
                "demo_duration_ms": asset["duration_ms"],
                "video_dimensions": dimensions,
            }

    def demo_file(self, name):
        root = self.settings.demo_assets_root.resolve()
        candidate = root / name
        if candidate.is_symlink() or not candidate.resolve().is_relative_to(root):
            raise ValueError
        if not candidate.is_file():
            raise ValueError
        return candidate.resolve()

    @property
    def allowed_ports(self):
        return {int(port) for port in self.settings.camera_allowed_ports.split(",") if port}

    def targets(self):
        return sorted(
            {
                (
                    str(ipaddress.ip_address(urlsplit(source["url"]).hostname)),
                    urlsplit(source["url"]).port or 554,
                )
                for source in self.sources.values()
                if source["mode"] == "pull"
            }
        )

    def pull_guarded(self):
        path = self.settings.media_egress_guard_file
        if not path or not path.is_file():
            return False
        try:
            guard = json.loads(path.read_text())
            return guard.get("policy") == "deny-other-new-connections" and guard.get("targets") == [
                list(pair) for pair in self.targets()
            ]
        except (OSError, ValueError):
            return False

    def get(self, source_id):
        return self.sources.get(source_id)

    def public(self):
        return [
            {
                "id": key,
                "mode": source["mode"],
                **({"label": source["label"]} if source.get("label") else {}),
                **({"source_media": source["source_media"]} if source.get("source_media") else {}),
            }
            for key, source in self.sources.items()
        ]
