"""Durable analysis admission, segment checkpoints and bounded job leases."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from psycopg.types.json import Jsonb

from . import contracts as c
from . import index_models as m
from . import store
from .db import Problem


def version(settings):
    configuration = [
        settings.meta_model,
        settings.indexing_clip_ms,
        settings.indexing_sample_ms,
        settings.indexing_motion_threshold,
        m.PROMPT_VERSION,
        m.SCHEMA_VERSION,
    ]
    return (
        m.PIPELINE_VERSION
        + "-"
        + hashlib.sha256(json.dumps(configuration).encode()).hexdigest()[:12]
    )


def audit(db, operation, resource_id):
    db.execute(
        """INSERT INTO vms_audit(id,principal_id,operation,resource_id)
        VALUES (%s,'index-worker',%s,%s)""",
        (uuid4(), operation, resource_id),
    )


def retire_obsolete(db, pipeline_version, recording_id=None):
    rows = db.execute(
        """UPDATE analysis_jobs SET state='cancelled',error_code='INDEX_VERSION_CHANGED',
        lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE pipeline_version<>%s
        AND (%s::uuid IS NULL OR recording_id=%s) AND (state='queued' OR
        (state='running' AND lease_expires_at<now())) RETURNING id""",
        (pipeline_version, recording_id, recording_id),
    ).fetchall()
    for row in rows:
        db.execute(
            """UPDATE segment_indexes SET state='cancelled',error_code='INDEX_VERSION_CHANGED',
            updated_at=now() WHERE analysis_job_id=%s AND state IN ('queued','running')""",
            (row["id"],),
        )
        audit(db, "analysis.version_cancelled", row["id"])


def register_segments(db, settings, recording_id=None):
    db.execute(
        """INSERT INTO segment_indexes(segment_id,pipeline_version)
        SELECT s.id,%s FROM segments s JOIN recordings r ON r.id=s.recording_id
        JOIN cameras c ON c.id=r.camera_id WHERE s.status='ready' AND c.deleted_at IS NULL
        AND (%s::uuid IS NULL OR s.recording_id=%s) ON CONFLICT DO NOTHING""",
        (version(settings), recording_id, recording_id),
    )


def usage(db, job_id=None, settings=None):
    row = db.execute(
        """SELECT count(*) FILTER
        (WHERE operation IN ('video_analysis','search_intent','agent_turn')) AS requests,
        sum(input_tokens) AS input_tokens,sum(output_tokens) AS output_tokens,
        COALESCE(sum(bytes_uploaded),0) AS bytes_uploaded,
        COALESCE(sum(reserved_usd),0) AS reserved_usd,
        CASE WHEN count(*) FILTER (
             WHERE operation IN ('video_analysis','search_intent','agent_turn')
             AND estimated_usd IS NULL)=0 THEN sum(estimated_usd) END AS estimated_usd
        FROM model_usage WHERE (%s::uuid IS NULL OR analysis_job_id=%s)
        AND (%s::uuid IS NOT NULL OR created_at>=
            (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))""",
        (job_id, job_id, job_id),
    ).fetchone()
    if settings is not None and job_id is None:
        admission = db.execute("""SELECT
            COALESCE(sum(GREATEST(reserved_usd,COALESCE(estimated_usd,0))),0) AS used,
            max(created_at) AS latest FROM model_usage
            WHERE created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
            AND operation IN ('video_analysis','search_intent','agent_turn')""").fetchone()
        remaining = max(0.0, settings.model_daily_budget_usd - float(admission["used"]))
        enabled = settings.model_daily_budget_usd > 0 and settings.model_request_reserve_usd > 0
        row.update(
            daily_request_limit=settings.model_daily_requests,
            daily_limit_usd=settings.model_daily_budget_usd,
            admission_used_usd=float(admission["used"]),
            admission_remaining_usd=remaining,
            remaining_requests=min(
                max(0, settings.model_daily_requests - row["requests"]),
                int((remaining + 1e-8) / settings.model_request_reserve_usd),
            )
            if enabled
            else 0,
            admission_enabled=enabled,
            observed_at=datetime.now(timezone.utc),
            latest_usage_at=admission["latest"],
        )
    return m.Usage(**row)


def index_rows(db, recording_id, pipeline_version=None, job_id=None):
    return db.execute(
        """SELECT i.* FROM segment_indexes i JOIN segments s ON s.id=i.segment_id
        WHERE s.recording_id=%s AND (%s::text IS NULL OR i.pipeline_version=%s)
        AND (%s::uuid IS NULL OR i.analysis_job_id=%s) ORDER BY s.offset_ms LIMIT 10000""",
        (recording_id, pipeline_version, pipeline_version, job_id, job_id),
    ).fetchall()


def job_model(db, row):
    return m.AnalysisJob(
        **{
            key: row[key]
            for key in (
                "id",
                "recording_id",
                "state",
                "progress",
                "attempts",
                "created_at",
                "updated_at",
                "pipeline_version",
                "selected_segments",
                "selected_duration_ms",
                "processing_ms",
            )
        },
        error=c.ErrorDetail(
            code=row["error_code"],
            message="Analysis could not complete.",
            retryable=row["state"] == "queued",
        )
        if row["error_code"]
        else None,
        segments=[
            m.SegmentIndex(**{key: item[key] for key in m.SegmentIndex.model_fields})
            for item in index_rows(db, row["recording_id"], job_id=row["id"])
        ],
        usage=usage(db, row["id"]),
    )


def get_job(db, job_id):
    row = db.execute("SELECT * FROM analysis_jobs WHERE id=%s", (job_id,)).fetchone()
    if not row:
        raise Problem(404, "NOT_FOUND", "No analysis job is available.")
    recording = store.get_recording(db, row["recording_id"])
    store.get_camera(db, recording["camera_id"])
    return job_model(db, row)


def enqueue(db, body, settings):
    recording = store.get_recording(db, body.recording_id)
    camera = store.get_camera(db, recording["camera_id"])
    # Same lock order as camera updates; duplicate recording requests serialize below.
    camera = db.execute("SELECT * FROM cameras WHERE id=%s FOR SHARE", (camera["id"],)).fetchone()
    if not camera["cloud_analysis_allowed"]:
        raise Problem(403, "CONSENT_REQUIRED", "This camera has not consented to cloud analysis.")
    if not settings.model_api_key.get_secret_value():
        raise Problem(503, "MODEL_UNAVAILABLE", "Meta Muse credentials are not configured.")
    if settings.model_daily_budget_usd <= 0 or settings.model_request_reserve_usd <= 0:
        raise Problem(
            503,
            "MODEL_BUDGET_NOT_CONFIGURED",
            "Set daily and per-request model cost reservations before analysis.",
        )
    db.execute("SELECT id FROM recordings WHERE id=%s FOR UPDATE", (body.recording_id,))
    retire_obsolete(db, version(settings), body.recording_id)
    active = db.execute(
        """SELECT * FROM analysis_jobs WHERE recording_id=%s
        AND state IN ('queued','running')""",
        (body.recording_id,),
    ).fetchone()
    if active:
        if active["pipeline_version"] != version(settings):
            raise Problem(
                409,
                "INDEX_VERSION_IN_PROGRESS",
                "An earlier indexing configuration is still processing this recording.",
            )
        return 202, job_model(db, active).model_dump(mode="json"), active["id"]
    register_segments(db, settings, body.recording_id)
    candidates = db.execute(
        """SELECT s.* FROM segment_indexes i JOIN segments s
        ON s.id=i.segment_id WHERE s.recording_id=%s AND s.status='ready'
        AND i.pipeline_version=%s AND i.state='waiting' ORDER BY s.offset_ms LIMIT 31""",
        (body.recording_id, version(settings)),
    ).fetchall()
    if not candidates:
        previous = db.execute(
            """SELECT * FROM analysis_jobs WHERE recording_id=%s
            AND pipeline_version=%s ORDER BY created_at DESC LIMIT 1""",
            (body.recording_id, version(settings)),
        ).fetchone()
        if previous:
            return 202, job_model(db, previous).model_dump(mode="json"), previous["id"]
        raise Problem(409, "NO_AVAILABLE_SEGMENTS", "No finalized segments can be indexed.")
    selected, duration = [], 0
    for item in candidates:
        if (
            len(selected) >= getattr(body, "max_segments", 30)
            or duration + item["duration_ms"] > 300000
        ):
            break
        if item["duration_ms"] > settings.indexing_max_segment_ms:
            raise Problem(422, "SEGMENT_TOO_LONG", "The segment exceeds the analysis limit.")
        selected.append(item["id"])
        duration += item["duration_ms"]
    if not selected:
        raise Problem(422, "ANALYSIS_BUDGET", "The available segment exceeds the job budget.")
    job_id = uuid4()
    row = db.execute(
        """INSERT INTO analysis_jobs
        (id,recording_id,state,model_id,prompt_version,pipeline_version,
        selected_segments,selected_duration_ms) VALUES (%s,%s,'queued',%s,%s,%s,%s,%s)
        RETURNING *""",
        (
            job_id,
            body.recording_id,
            settings.meta_model,
            m.PROMPT_VERSION,
            version(settings),
            len(selected),
            duration,
        ),
    ).fetchone()
    db.execute(
        """UPDATE segment_indexes SET analysis_job_id=%s,state='queued',updated_at=now()
        WHERE segment_id=ANY(%s) AND pipeline_version=%s AND state='waiting'""",
        (job_id, selected, version(settings)),
    )
    return 202, job_model(db, row).model_dump(mode="json"), job_id


def claim(database, pipeline_version):
    with database.connect() as db:
        retire_obsolete(db, pipeline_version)
        # Abandoned final attempts become terminal rather than sitting in running forever.
        exhausted = db.execute("""UPDATE analysis_jobs SET state='failed',
            error_code='WORKER_LEASE_EXPIRED',updated_at=now() WHERE state='running'
            AND lease_expires_at<now() AND attempts>=3 RETURNING id""").fetchall()
        for item in exhausted:
            audit(db, "analysis.lease_failed", item["id"])
            db.execute(
                """UPDATE segment_indexes SET
                state=CASE WHEN state='running' THEN 'failed' ELSE 'waiting' END,
                error_code=CASE WHEN state='running' THEN 'WORKER_LEASE_EXPIRED' ELSE NULL END
                WHERE analysis_job_id=%s AND state IN ('queued','running')""",
                (item["id"],),
            )
        row = db.execute(
            """SELECT * FROM analysis_jobs WHERE pipeline_version=%s
            AND attempts<3 AND ((state='queued' AND next_attempt_at<=now()) OR
            (state='running' AND lease_expires_at<now())) ORDER BY created_at
            FOR UPDATE SKIP LOCKED LIMIT 1""",
            (pipeline_version,),
        ).fetchone()
        if not row:
            return None
        token = uuid4()
        row = db.execute(
            """UPDATE analysis_jobs SET state='running',attempts=attempts+1,
            lease_token=%s,lease_expires_at=now()+interval '60 seconds',updated_at=now()
            WHERE id=%s RETURNING *""",
            (token, row["id"]),
        ).fetchone()
        db.execute(
            """UPDATE segment_indexes SET state='queued' WHERE analysis_job_id=%s
            AND state='running'""",
            (row["id"],),
        )
        audit(db, "analysis.claimed", row["id"])
        return row


def fence(db, job):
    row = db.execute(
        """SELECT * FROM analysis_jobs WHERE id=%s AND state='running'
        AND lease_token=%s AND lease_expires_at>now() FOR UPDATE""",
        (job["id"], job["lease_token"]),
    ).fetchone()
    if not row:
        raise Problem(409, "WORKER_LEASE_LOST", "This worker no longer owns the analysis job.")
    return row


def require_consent(db, job, segment_id):
    camera = db.execute(
        """SELECT c.* FROM cameras c JOIN recordings r ON r.camera_id=c.id
        JOIN segments s ON s.recording_id=r.id WHERE s.id=%s AND r.id=%s
        AND s.status='ready' FOR SHARE OF c,s""",
        (segment_id, job["recording_id"]),
    ).fetchone()
    if not camera or camera["deleted_at"]:
        raise Problem(404, "RECORDING_UNAVAILABLE", "The recording is no longer available.")
    if not camera["cloud_analysis_allowed"]:
        raise Problem(403, "CONSENT_REVOKED", "Camera cloud-analysis consent has been revoked.")


def fail(database, job, code, retryable):
    with database.connect() as db:
        fence(db, job)
        retry = retryable and job["attempts"] < 3
        state = "queued" if retry else "cancelled" if code == "CONSENT_REVOKED" else "failed"
        db.execute(
            """UPDATE analysis_jobs SET state=%s,error_code=%s,lease_token=NULL,
            lease_expires_at=NULL,next_attempt_at=%s,updated_at=now() WHERE id=%s""",
            (
                state,
                code,
                datetime.now(timezone.utc) + timedelta(seconds=2 ** job["attempts"]),
                job["id"],
            ),
        )
        db.execute(
            """UPDATE segment_indexes SET
            error_code=CASE WHEN state='running' OR %s='cancelled' THEN %s ELSE NULL END,
            state=CASE WHEN %s THEN 'queued' WHEN state='running' OR %s='cancelled'
                       THEN %s ELSE 'waiting' END,updated_at=now()
            WHERE analysis_job_id=%s AND state IN ('running','queued')""",
            (state, code, retry, state, state, job["id"]),
        )
        audit(db, "analysis." + state, job["id"])


def publish(
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
    elapsed_ms,
):
    fence(db, job)
    require_consent(db, job, segment["id"])
    for observation in analysis.observations:
        if observation.end_ms > clip_duration:
            raise Problem(
                422,
                "INVALID_MODEL_TIMESTAMP",
                "An observation falls outside the verified analyzed clip.",
            )
    # Publish all observations, events and checkpoint atomically; retries cannot duplicate them.
    for observation in analysis.observations:
        start, end = clip_start + observation.start_ms, clip_start + observation.end_ms
        metadata_id = uuid4()
        db.execute(
            """INSERT INTO video_metadata
            (id,segment_id,analysis_job_id,summary,evidence_text,observation_start_ms,
            observation_end_ms,model_id,prompt_version,schema_version,sampled_offsets_ms,
            raw_output,objects,event_types,uncertainty,uncertainty_notes,provenance)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                metadata_id,
                segment["id"],
                job["id"],
                observation.caption,
                observation.evidence,
                start,
                end,
                job["model_id"],
                m.PROMPT_VERSION,
                m.SCHEMA_VERSION,
                Jsonb(times),
                Jsonb(observation.model_dump(mode="json")),
                Jsonb([o.model_dump() for o in observation.objects]),
                observation.event_types,
                observation.uncertainty,
                observation.uncertainty_notes,
                Jsonb(provenance),
            ),
        )
        if observation.event_types:
            db.execute(
                """INSERT INTO events (id,camera_id,recording_id,segment_id,metadata_id,
                kind,started_at,ended_at,summary,provenance,model_id,evidence_offset_ms,pipeline_version)
                SELECT %s,r.camera_id,r.id,%s,%s,'observation',%s,%s,%s,'muse',%s,%s,%s
                FROM recordings r WHERE r.id=%s""",
                (
                    uuid4(),
                    segment["id"],
                    metadata_id,
                    segment["started_at"] + timedelta(milliseconds=start),
                    segment["started_at"] + timedelta(milliseconds=end),
                    observation.caption,
                    job["model_id"],
                    segment["offset_ms"] + start,
                    job["pipeline_version"],
                    job["recording_id"],
                ),
            )
    for item in samples:
        db.execute(
            """INSERT INTO motion_samples
            (segment_id,pipeline_version,start_ms,end_ms,score,active)
            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (
                segment["id"],
                job["pipeline_version"],
                item["start_ms"],
                item["end_ms"],
                item["score"],
                item["active"],
            ),
        )
    motion_intervals = []
    for item in samples:
        if item["active"]:
            if motion_intervals and motion_intervals[-1][1] == item["start_ms"]:
                motion_intervals[-1][1] = item["end_ms"]
            else:
                motion_intervals.append([item["start_ms"], item["end_ms"]])
    for start, end in motion_intervals:
        db.execute(
            """INSERT INTO events (id,camera_id,recording_id,segment_id,kind,
            started_at,ended_at,summary,provenance,evidence_offset_ms,pipeline_version)
            SELECT %s,r.camera_id,r.id,%s,'motion',%s,%s,%s,'ffmpeg_motion',%s,%s
            FROM recordings r WHERE r.id=%s""",
            (
                uuid4(),
                segment["id"],
                segment["started_at"] + timedelta(milliseconds=start),
                segment["started_at"] + timedelta(milliseconds=end),
                "Measured low-resolution frame changes.",
                segment["offset_ms"] + start,
                job["pipeline_version"],
                job["recording_id"],
            ),
        )
    db.execute(
        """UPDATE segment_indexes SET state='succeeded',error_code=NULL,
        analyzed_start_ms=%s,analyzed_end_ms=%s,media_info=%s,provenance=%s,
        processing_ms=%s,updated_at=now() WHERE segment_id=%s AND pipeline_version=%s""",
        (
            clip_start,
            clip_start + clip_duration,
            Jsonb(info),
            Jsonb(provenance),
            elapsed_ms,
            segment["id"],
            job["pipeline_version"],
        ),
    )
    db.execute(
        """UPDATE analysis_jobs SET progress=(SELECT count(*)::float
        FROM segment_indexes WHERE analysis_job_id=%s AND state='succeeded')/selected_segments,
        processing_ms=processing_ms+%s,updated_at=now() WHERE id=%s""",
        (job["id"], elapsed_ms, job["id"]),
    )
