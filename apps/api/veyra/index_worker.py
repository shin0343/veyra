"""One sequential, restartable indexing worker backed by PostgreSQL leases."""

import logging
import tempfile
import threading
import time
from pathlib import Path

from . import index_media, index_store
from .db import Problem
from .index_provider import IndexProvider
from .media_client import safe_file
from .meta import ModelFailure

logger = logging.getLogger("veyra")


class Worker:
    def __init__(self, settings, database, provider_factory=None):
        self.settings, self.database = settings, database
        self.provider_factory = provider_factory or (lambda: IndexProvider(settings, database))
        self.stop_event = threading.Event()

    def heartbeat(self, job, done):
        while not done.wait(15):
            try:
                with self.database.connect() as db:
                    db.execute(
                        """UPDATE analysis_jobs SET
                        lease_expires_at=now()+interval '60 seconds',updated_at=now()
                        WHERE id=%s AND lease_token=%s AND state='running'
                        AND lease_expires_at>now()""",
                        (job["id"], job["lease_token"]),
                    )
            except Exception:
                logger.warning('{"event":"index_heartbeat_failed"}')

    def once(self):
        job = index_store.claim(self.database, index_store.version(self.settings))
        if not job:
            return False
        done = threading.Event()
        heartbeat = threading.Thread(target=self.heartbeat, args=(job, done), daemon=True)
        heartbeat.start()
        provider = None
        try:
            provider = self.provider_factory()
            with self.database.connect() as db:
                segments = db.execute(
                    """SELECT s.* FROM segments s JOIN segment_indexes i
                    ON i.segment_id=s.id WHERE i.analysis_job_id=%s AND i.state='queued'
                    ORDER BY s.offset_ms""",
                    (job["id"],),
                ).fetchall()
            for segment in segments:
                if self.stop_event.is_set():
                    raise Problem(503, "WORKER_STOPPING", "The worker is stopping.", True)
                self.process(job, segment, provider)
            with self.database.connect() as db:
                index_store.fence(db, job)
                db.execute(
                    """UPDATE analysis_jobs SET state='succeeded',progress=1,
                    error_code=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=now()
                    WHERE id=%s""",
                    (job["id"],),
                )
                index_store.audit(db, "analysis.succeeded", job["id"])
        except Exception as exc:
            code = exc.code if isinstance(exc, (Problem, ModelFailure)) else "INDEXING_FAILED"
            retryable = getattr(exc, "retryable", False)
            try:
                index_store.fail(self.database, job, code, retryable)
            except Exception:
                logger.warning('{"event":"index_job_failure_uncommitted"}')
            logger.warning('{"event":"index_job_failed","code":"%s"}', code)
        finally:
            done.set()
            heartbeat.join(timeout=5)
            if provider:
                provider.close()
        return True

    def process(self, job, segment, provider):
        started = time.monotonic()

        def consent_check():
            with self.database.connect() as db:
                index_store.fence(db, job)
                index_store.require_consent(db, job, segment["id"])
            safe_file(self.settings.recordings_root, segment["storage_key"])

        consent_check()
        path = safe_file(self.settings.recordings_root, segment["storage_key"])
        info = index_media.media_info(path)
        duration = segment["duration_ms"]
        if (
            duration > self.settings.indexing_max_segment_ms
            or abs(info["duration_ms"] - duration) > 100
        ):
            raise Problem(
                422, "INVALID_MEDIA_TIMESTAMP", "Source duration differs from the recording."
            )
        sha256 = index_media.checksum(path)
        times, samples, clip_start = index_media.sample(path, self.settings, duration)
        with self.database.connect() as db:
            index_store.fence(db, job)
            db.execute(
                """UPDATE segment_indexes SET state='running',updated_at=now()
                WHERE segment_id=%s AND analysis_job_id=%s""",
                (segment["id"], job["id"]),
            )
        with tempfile.TemporaryDirectory(prefix="veyra-index-") as temporary:
            clip = Path(temporary) / "clip.mp4"
            clip_duration = index_media.extract(
                path,
                clip,
                clip_start,
                min(self.settings.indexing_clip_ms, duration - clip_start),
                self.settings,
            )
            clip_sha256 = index_media.checksum(clip)
            analysis = provider.analyze(clip, clip_duration, job["id"], consent_check)
        consent_check()
        if index_media.checksum(path) != sha256:
            raise Problem(409, "SOURCE_CHANGED", "The source changed during indexing.")
        provenance = {
            "source_sha256": sha256,
            "source_size_bytes": path.stat().st_size,
            "source_mtime_ns": path.stat().st_mtime_ns,
            "clip_sha256": clip_sha256,
            "clip_start_ms": clip_start,
            "clip_end_ms": clip_start + clip_duration,
            "sampling_interval_ms": self.settings.indexing_sample_ms,
            "motion_threshold": self.settings.indexing_motion_threshold,
            "motion_method": "ffmpeg_gray_mean_absolute_pixel_difference",
            "pipeline_version": job["pipeline_version"],
            "provider": "meta_standard",
            "model_version": job["model_id"],
            "audio_removed": True,
            "timestamps": "recording_clock_plus_estimated_clip_offsets",
        }
        with self.database.connect() as db:
            safe_file(self.settings.recordings_root, segment["storage_key"])
            index_store.publish(
                db,
                job,
                segment,
                analysis,
                clip_start,
                clip_duration,
                times,
                samples,
                info,
                provenance,
                round((time.monotonic() - started) * 1000),
            )

    def run(self):
        while not self.stop_event.is_set():
            try:
                worked = self.once()
            except Exception:
                worked = False
                logger.warning('{"event":"index_worker_unavailable"}')
            if not worked:
                self.stop_event.wait(self.settings.indexing_poll_seconds)
