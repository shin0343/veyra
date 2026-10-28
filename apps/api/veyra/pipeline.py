"""Media lifecycle reconciler. All indexed files require an actual completion marker."""

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from psycopg.types.json import Jsonb

from .db import Problem
from .index_store import register_segments
from .media_client import probe, safe_file

logger = logging.getLogger("veyra")


class Pipeline:
    def __init__(self, settings, database, registry, media):
        self.settings, self.database = settings, database
        self.registry, self.media = registry, media
        self.stop_event = threading.Event()
        self.wake_event = threading.Event()
        self.thread = None
        self.verified = set()

    def start(self):
        if self.settings.media_worker_enabled:
            self.thread = threading.Thread(target=self.run, daemon=True, name="media-reconciler")
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.wake_event.set()
        if self.thread:
            self.thread.join(timeout=15)

    def wake(self):
        self.wake_event.set()

    def run(self):
        while not self.stop_event.is_set():
            try:
                self.once()
            except Exception as error:
                logger.warning(
                    json.dumps(
                        {"event": "media_reconcile_failed", "error_type": type(error).__name__}
                    )
                )
            self.wake_event.wait(self.settings.media_reconcile_seconds)
            self.wake_event.clear()

    def once(self):
        with self.database.connect() as db:
            # One reconciliation transaction even if a second API instance is started.
            if not db.execute("SELECT pg_try_advisory_xact_lock(9102604) AS held").fetchone()[
                "held"
            ]:
                return
            # Row-lock order shared with store.share_cameras; keep both in sync.
            cameras = db.execute("SELECT * FROM cameras ORDER BY created_at,id").fetchall()
            active_paths = {
                c["media_path"] for c in cameras if c["enabled"] and not c["deleted_at"]
            }
            observed = datetime.now(timezone.utc)
            try:
                paths = self.media.paths()
            except Problem:
                paths = None
            for camera in cameras:
                path, source = camera["media_path"], self.registry.get(camera["source_id"])
                if source and source.get("demo_duration_ms"):
                    source = dict(source)
                    first = db.execute(
                        """SELECT min(started_at) AS origin FROM recordings
                        WHERE camera_id=%s AND source_media->>'sha256'=%s""",
                        (camera["id"], source["source_media"]["sha256"]),
                    ).fetchone()["origin"]
                    source["record"] = first is None or observed < first + timedelta(
                        milliseconds=source["demo_duration_ms"]
                    )
                source_media = source.get("source_media") if source else None
                if camera.get("source_media") != source_media:
                    db.execute(
                        "UPDATE cameras SET source_media=%s WHERE id=%s",
                        (Jsonb(source_media) if source_media else None, camera["id"]),
                    )
                    camera["source_media"] = source_media
                status, code = "unknown", None
                if not camera["enabled"] or camera["deleted_at"]:
                    status = "disabled"
                    if paths is not None and path in paths and path not in active_paths:
                        self.media.remove(path)
                elif source is None:
                    status, code = "error", "SOURCE_NOT_CONFIGURED"
                elif paths is None:
                    code = "MEDIA_UNAVAILABLE"
                else:
                    try:
                        self.media.configure(path, source, self.registry)
                        item = paths.get(path)
                        if not item or not item.get("ready", False):
                            status, code = "offline", "SOURCE_OFFLINE"
                        else:
                            tracks = [str(track).upper() for track in item.get("tracks", [])]
                            if not tracks and item.get("tracks2"):
                                tracks = [
                                    str(t.get("codec", t.get("codecName", ""))).upper()
                                    for t in item["tracks2"]
                                ]
                            if "H264" not in tracks or any(
                                t not in {"H264", "MPEG4AUDIO", "AAC"} for t in tracks
                            ):
                                status, code = "error", "UNSUPPORTED_CODEC"
                            else:
                                status = "online"
                    except Problem as problem:
                        status, code = "error", problem.code
                db.execute(
                    """UPDATE cameras SET status=%s,connection_error_code=%s,
                    last_observed_at=CASE WHEN %s THEN %s ELSE last_observed_at END WHERE id=%s""",
                    (status, code, paths is not None, observed, camera["id"]),
                )
                if not camera["deleted_at"]:
                    self.ingest(db, camera)
                self.refresh_recordings(
                    db,
                    camera["id"],
                    status == "online" and bool(source and source.get("record", True)),
                )
            self.expire_sessions(db)
            register_segments(db, self.settings)

    def ingest(self, db, camera):
        root = self.settings.recordings_root.resolve()
        directory = root / camera["media_path"]
        # A missing or unsafe directory still requires availability reconciliation below.
        markers = (
            sorted(directory.glob("*.done.json"))
            if directory.is_dir() and not directory.is_symlink()
            else []
        )
        for marker in markers:
            identity = str(camera["id"]), marker.name
            if identity in self.verified:
                continue
            try:
                if marker.is_symlink() or marker.stat().st_size > 4096:
                    raise ValueError
                data = json.loads(marker.read_text())
                if data["media_path"] != camera["media_path"]:
                    raise ValueError
                completed = datetime.fromisoformat(data["completed_at"])
                if completed < camera["created_at"]:
                    continue
                path = safe_file(root, data["storage_key"])
                if path.parent != directory:
                    raise ValueError
                if db.execute(
                    "SELECT 1 FROM segments WHERE storage_key=%s", (data["storage_key"],)
                ).fetchone():
                    self.verified.add(identity)
                    continue
                start = datetime.fromisoformat(data["started_at"]).astimezone(timezone.utc)
                duration, codecs = probe(path)
                if "h264" not in codecs:
                    continue  # Unsupported video must never be advertised as playable.
                previous = db.execute(
                    """SELECT r.id,r.started_at,r.source_media,max(s.started_at +
                    s.duration_ms * interval '1 millisecond') AS last_end FROM recordings r
                    JOIN segments s ON s.recording_id=r.id WHERE r.camera_id=%s
                    GROUP BY r.id ORDER BY r.started_at DESC LIMIT 1""",
                    (camera["id"],),
                ).fetchone()
                if (
                    previous
                    and previous["source_media"] == camera.get("source_media")
                    and previous["started_at"]
                    <= start
                    <= previous["last_end"] + timedelta(seconds=2)
                ):
                    recording_id, origin = previous["id"], previous["started_at"]
                else:
                    recording_id = uuid5(NAMESPACE_URL, f"veyra-recording:{camera['id']}:{start}")
                    origin = start
                    db.execute(
                        """INSERT INTO recordings(id,camera_id,started_at,status,source_media)
                        VALUES (%s,%s,%s,'recording',%s) ON CONFLICT DO NOTHING""",
                        (
                            recording_id,
                            camera["id"],
                            start,
                            Jsonb(camera["source_media"]) if camera.get("source_media") else None,
                        ),
                    )
                segment_id = uuid5(
                    NAMESPACE_URL, f"veyra-segment:{camera['id']}:{data['storage_key']}"
                )
                db.execute(
                    """INSERT INTO segments
                    (id,recording_id,storage_key,started_at,duration_ms,offset_ms,status)
                    VALUES (%s,%s,%s,%s,%s,%s,'ready') ON CONFLICT DO NOTHING""",
                    (
                        segment_id,
                        recording_id,
                        data["storage_key"],
                        start,
                        duration,
                        round((start - origin).total_seconds() * 1000),
                    ),
                )
                # Cache only after the transaction commits; a rollback must remain replayable.
                logger.info(
                    json.dumps(
                        {
                            "event": "segment_persisted",
                            "camera_id": str(camera["id"]),
                            "segment_id": str(segment_id),
                            "duration_ms": duration,
                        }
                    )
                )
            except (OSError, ValueError, KeyError, TypeError, Problem):
                logger.warning('{"event":"segment_not_available"}')
        # Reconcile retention/manual file removal; do not keep phantom playback metadata.
        segments = db.execute(
            """SELECT s.id,s.storage_key FROM segments s JOIN recordings r
            ON r.id=s.recording_id WHERE r.camera_id=%s AND s.status='ready'""",
            (camera["id"],),
        ).fetchall()
        for segment in segments:
            try:
                safe_file(root, segment["storage_key"])
            except Problem:
                db.execute("UPDATE segments SET status='deleted' WHERE id=%s", (segment["id"],))

    @staticmethod
    def refresh_recordings(db, camera_id, online):
        rows = db.execute(
            """SELECT r.id,max(s.started_at+s.duration_ms*interval '1 millisecond')
            AS last_end,COALESCE(sum(s.duration_ms) FILTER (WHERE s.status='ready'),0) AS duration
            FROM recordings r LEFT JOIN segments s ON s.recording_id=r.id WHERE r.camera_id=%s
            GROUP BY r.id ORDER BY r.started_at DESC""",
            (camera_id,),
        ).fetchall()
        for index, row in enumerate(rows):
            active = (
                online
                and index == 0
                and row["last_end"] is not None
                and datetime.now(timezone.utc) - row["last_end"] < timedelta(seconds=20)
            )
            state = "recording" if active else "ready" if row["duration"] else "deleted"
            db.execute(
                """UPDATE recordings SET status=%s,ended_at=%s,available_duration_ms=%s
                WHERE id=%s""",
                (state, None if active else row["last_end"], row["duration"], row["id"]),
            )

    def expire_sessions(self, db):
        expired = db.execute("""DELETE FROM media_sessions WHERE expires_at < now()
                             RETURNING cache_key""").fetchall()
        for session in expired:
            if session["cache_key"]:
                try:
                    safe_file(self.settings.playback_cache_root, session["cache_key"]).unlink()
                except (Problem, OSError):
                    pass
