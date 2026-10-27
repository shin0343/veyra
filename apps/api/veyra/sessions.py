"""Principal-bound media resources. Neither URLs nor filesystem keys come from clients."""

import re
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi.responses import FileResponse, Response
from psycopg.types.json import Jsonb

from .contracts import MediaSession
from .db import Problem
from .media_client import probe, safe_file, validate_range
from .store import camera_model, get_camera, get_recording


class Sessions:
    def __init__(self, settings, database, media):
        self.settings, self.database, self.media = settings, database, media
        self.export_lock = threading.Lock()

    def insert(
        self,
        db,
        principal,
        kind,
        camera_id,
        media_path,
        *,
        recording_id=None,
        resources=None,
        cache_key=None,
        actual=0,
        seek=0,
    ):
        session_id = uuid4()
        expires = datetime.now(timezone.utc) + timedelta(
            seconds=self.settings.media_session_seconds
        )
        db.execute(
            """INSERT INTO media_sessions(id,principal_id,kind,camera_id,recording_id,
            media_path,resources,cache_key,actual_start_offset_ms,seek_offset_ms,expires_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                session_id,
                principal,
                kind,
                camera_id,
                recording_id,
                media_path,
                Jsonb(resources or {}),
                cache_key,
                actual,
                seek,
                expires,
            ),
        )
        leaf = "index.m3u8" if kind == "live" else "clip.mp4"
        return MediaSession(
            id=session_id,
            transport="hls" if kind == "live" else "mp4",
            url=f"/api/v1/media/sessions/{session_id}/{leaf}",
            expires_at=expires,
            actual_start_offset_ms=actual,
            seek_offset_ms=seek,
        )

    def live(self, principal, camera_id):
        with self.database.connect() as db:
            camera = get_camera(db, camera_id)
            observed = camera_model(camera)
            if not camera["enabled"]:
                raise Problem(
                    409, "CAMERA_DISABLED", "Enable this camera before opening live view."
                )
            if observed.status != "online":
                code = (
                    observed.connection_error.code
                    if observed.connection_error
                    else "STREAM_OFFLINE"
                )
                raise Problem(503, code, "A compatible live stream is not available.", True)
            # Verify real upstream readiness before allocating a session.
            self.media.hls(camera["media_path"], "index.m3u8")
            return self.insert(
                db,
                principal,
                "live",
                camera_id,
                camera["media_path"],
                resources={"index.m3u8": "index.m3u8"},
            )

    def playback(self, principal, body):
        # Serial exports keep disk usage bounded, including in-progress exports.
        if not self.export_lock.acquire(blocking=False):
            raise Problem(503, "MEDIA_BUSY", "Another playback window is being prepared.", True)
        destination = None
        try:
            with self.database.connect() as db:
                recording = get_recording(db, body.recording_id)
                get_camera(db, recording["camera_id"])
                segments = db.execute(
                    """SELECT * FROM segments WHERE recording_id=%s
                    AND status='ready' ORDER BY offset_ms""",
                    (body.recording_id,),
                ).fetchall()
                selected = next(
                    (
                        i
                        for i, s in enumerate(segments)
                        if s["offset_ms"] <= body.offset_ms < s["offset_ms"] + s["duration_ms"]
                        and (
                            getattr(body, "segment_id", None) is None or s["id"] == body.segment_id
                        )
                    ),
                    None,
                )
                if selected is None:
                    raise Problem(409, "MEDIA_GAP", "There is no available video at this offset.")
                first = segments[selected]
                end = first["offset_ms"] + first["duration_ms"]
                safe_file(self.settings.recordings_root, first["storage_key"])
                for segment in (
                    [] if getattr(body, "segment_id", None) else segments[selected + 1 :]
                ):
                    if segment["offset_ms"] > end + 100:
                        break
                    safe_file(self.settings.recordings_root, segment["storage_key"])
                    end = max(end, segment["offset_ms"] + segment["duration_ms"])
                    if end >= body.offset_ms + body.duration_ms:
                        break
                end = min(end, body.offset_ms + body.duration_ms)
                duration = (end - first["offset_ms"]) / 1000
                cache = self.settings.playback_cache_root
                cache.mkdir(parents=True, exist_ok=True, mode=0o700)
                used = sum(p.stat().st_size for p in cache.glob("*.mp4") if p.is_file())
                if used + self.settings.media_clip_max_bytes > self.settings.media_cache_max_bytes:
                    raise Problem(
                        503, "MEDIA_CAPACITY", "Playback storage is full. Try again later.", True
                    )
                key = f"{uuid4().hex}.mp4"
                destination = cache / key
                if getattr(body, "segment_id", None):
                    # Exact evidence file selection avoids ambiguous overlapping capture clocks.
                    source = safe_file(self.settings.recordings_root, first["storage_key"])
                    try:
                        subprocess.run(
                            [
                                "ffmpeg",
                                "-hide_banner",
                                "-loglevel",
                                "error",
                                "-i",
                                str(source),
                                "-t",
                                str(duration),
                                "-map",
                                "0:v:0",
                                "-an",
                                "-c:v",
                                "copy",
                                "-movflags",
                                "+faststart",
                                "-fs",
                                str(self.settings.media_clip_max_bytes),
                                "-f",
                                "mp4",
                                str(destination),
                            ],
                            check=True,
                            capture_output=True,
                            timeout=30,
                        )
                        if destination.stat().st_size >= self.settings.media_clip_max_bytes:
                            raise Problem(503, "MEDIA_CAPACITY", "The evidence clip is too large.")
                    except (subprocess.SubprocessError, OSError):
                        raise Problem(
                            503, "INVALID_MEDIA", "Evidence playback could not be prepared."
                        ) from None
                else:
                    self.media.export(
                        recording["media_path"], first["started_at"], duration, destination
                    )
                measured, codecs = probe(destination)
                seek = body.offset_ms - first["offset_ms"]
                if "h264" not in codecs or measured <= seek:
                    raise Problem(
                        503, "INVALID_MEDIA", "The requested playback window is unavailable."
                    )
                result = self.insert(
                    db,
                    principal,
                    "playback",
                    recording["camera_id"],
                    recording["media_path"],
                    recording_id=body.recording_id,
                    cache_key=key,
                    actual=first["offset_ms"],
                    seek=seek,
                )
            destination = None  # Committed session owns the cache file now.
            return result
        finally:
            if destination is not None:
                destination.unlink(missing_ok=True)
            self.export_lock.release()

    @staticmethod
    def rewrite_manifest(content, session_id, resources):
        def resource_uri(uri):
            parsed = urlsplit(uri)
            # Only a leaf on the fixed MediaMTX path, with no host or redirect target.
            if (
                parsed.scheme
                or parsed.netloc
                or parsed.query
                or parsed.fragment
                or not re.fullmatch(r"[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)", parsed.path)
            ):
                raise Problem(503, "INVALID_MEDIA", "The stream manifest is not supported.")
            opaque = next((key for key, value in resources.items() if value == uri), None)
            if opaque is None:
                opaque = uuid4().hex + "." + uri.rsplit(".", 1)[1]
                resources[opaque] = uri
            return f"/api/v1/media/sessions/{session_id}/{opaque}"

        try:
            lines = content.decode("utf-8").splitlines()
        except UnicodeDecodeError:
            raise Problem(503, "INVALID_MEDIA", "The stream manifest is not supported.") from None
        output = []
        for line in lines:
            if line.startswith("#"):
                line = re.sub(r'URI="([^"]+)"', lambda m: f'URI="{resource_uri(m[1])}"', line)
            elif line.strip():
                line = resource_uri(line.strip())
            output.append(line)
        if len(resources) > 4096:
            raise Problem(503, "SESSION_CAPACITY", "Reopen live view to continue.", True)
        return ("\n".join(output) + "\n").encode()

    def read(self, principal, session_id, resource, range_header, request):
        with self.database.connect() as db:
            session = db.execute(
                """SELECT * FROM media_sessions WHERE id=%s AND principal_id=%s
                AND expires_at>now() FOR UPDATE""",
                (session_id, principal),
            ).fetchone()
            if not session:
                raise Problem(404, "NOT_FOUND", "This media session is not available.")
            if session["kind"] == "playback":
                if resource != "clip.mp4":
                    raise Problem(404, "NOT_FOUND", "This media resource is not available.")
                path = safe_file(self.settings.playback_cache_root, session["cache_key"])
                validate_range(range_header, path.stat().st_size)
                return FileResponse(
                    path,
                    media_type="video/mp4",
                    headers={
                        "Cache-Control": "private, no-store",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
            camera = camera_model(get_camera(db, session["camera_id"]))
            if not camera.enabled or camera.status != "online":
                raise Problem(503, "STREAM_OFFLINE", "This stream is not available.", True)
            remote = session["resources"].get(resource)
            if remote is None:
                raise Problem(404, "NOT_FOUND", "This media resource is not available.")
            content, content_type = self.media.hls(session["media_path"], remote)
            if resource.endswith(".m3u8"):
                content = self.rewrite_manifest(content, session_id, session["resources"])
                db.execute(
                    "UPDATE media_sessions SET resources=%s WHERE id=%s",
                    (Jsonb(session["resources"]), session_id),
                )
                content_type = "application/vnd.apple.mpegurl"
            return Response(
                content, media_type=content_type, headers={"X-Content-Type-Options": "nosniff"}
            )
