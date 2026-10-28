"""Model-free evidence browsing: structured index queries, coverage and video-derived frames.

Nothing here calls Muse. Queries read already validated observations through the same
`retrieval.retrieve` used by REST search and the agent tool; frames are decoded from the
exact finalized segment file that the evidence references.
"""

import json
import os
import subprocess
import threading
from typing import Annotated
from uuid import UUID, uuid4

from pydantic import Field, field_validator

from . import contracts as c
from . import index_models as m
from . import index_store, retrieval, store
from .db import Problem
from .media_client import safe_file

Keyword = Annotated[str, Field(min_length=2, max_length=40, pattern=r"^[^\W_][\w'-]*$")]


class IndexQuery(c.WireModel):
    """Deterministic filters over stored observations. No natural-language parsing."""

    camera_ids: list[UUID] = Field(default_factory=list, max_length=16)
    start: c.AwareDatetime | None = None
    end: c.AwareDatetime | None = None
    categories: list[m.Category] = Field(default_factory=list, max_length=4)
    event_types: list[m.EventType] = Field(default_factory=list, max_length=4)
    keywords: list[Keyword] = Field(default_factory=list, max_length=6)
    motion_only: bool = False
    limit: int = Field(default=24, ge=1, le=50)
    # Full validated interpretation for exact free refinement, including apparel and all
    # object/event/keyword constraints. Explicit scopes intersect rather than widen it.
    interpretation: m.StructuredSearch | None = None
    curated_only: bool = False

    @field_validator("interpretation", mode="before")
    @classmethod
    def wire_interpretation(cls, value):
        # FastAPI has decoded JSON already. Strict JSON validation permits ISO instants
        # and UUID strings, while retaining strict booleans, integers and extra-field checks.
        if isinstance(value, dict):
            return m.StructuredSearch.model_validate_json(json.dumps(value), strict=True)
        return value


class CameraCoverage(c.WireModel):
    camera_id: UUID
    camera_name: str
    recordings: int
    first_recorded_at: c.AwareDatetime | None
    last_recorded_at: c.AwareDatetime | None
    available_ms: int
    segments: int
    indexed_segments: int
    analyzed_ms: int
    observations: int
    last_observation_at: c.AwareDatetime | None
    event_types: dict[str, int]
    categories: dict[str, int]


class IndexCoverage(c.WireModel):
    pipeline_version: str
    items: list[CameraCoverage]


class ActivityQuery(c.WireModel):
    camera_ids: list[UUID] = Field(min_length=1, max_length=16)
    start: c.AwareDatetime
    end: c.AwareDatetime
    bucket_seconds: int = Field(default=60, ge=10, le=3600)


class ActivityList(c.WireModel):
    items: list[m.ActivityHistogram]


def activities(db, settings, body):
    start, end = retrieval.window(body.start, body.end)
    ids = list(dict.fromkeys(body.camera_ids))
    if (end - start).total_seconds() / body.bucket_seconds * len(ids) > 2880:
        raise Problem(422, "TOO_MANY_BUCKETS", "Use a larger activity bucket or fewer cameras.")
    return ActivityList(
        items=[
            retrieval.activity(db, settings, camera_id, start, end, body.bucket_seconds)
            for camera_id in ids
        ]
    )


def query(db, settings, body: IndexQuery) -> m.SearchResponse:
    if body.interpretation is not None:
        parsed = body.interpretation
        intent = m.SearchIntent.model_validate(
            parsed.model_dump(exclude={"camera_ids", "limit", "curated_only"})
        )
        requested = set(body.camera_ids)
        original = set(parsed.camera_ids)
        if requested and original and not requested.intersection(original):
            raise Problem(
                422, "CAMERA_FILTER_CONFLICT", "The camera filter conflicts with Muse's reading."
            )
        constraints = retrieval.constraints_for(
            db,
            m.SearchRequest(
                query="Stored interpretation",
                camera_ids=sorted(
                    requested & original if requested and original else requested or original,
                    key=str,
                ),
                curated_only=body.curated_only,
                start=body.start,
                end=body.end,
                limit=body.limit,
            ),
            intent,
        )
        return retrieval.retrieve(db, settings, constraints, "Stored Muse interpretation")
    constraints = m.StructuredSearch(
        camera_names=[],
        start=body.start,
        end=body.end,
        objects=[m.ObjectConstraint(category=item, attributes=[]) for item in body.categories],
        event_types=body.event_types,
        motion_only=body.motion_only,
        keywords=body.keywords,
        unsupported_reason=None,
        camera_ids=body.camera_ids,
        limit=body.limit,
        curated_only=body.curated_only,
    )
    label = " · ".join([*body.categories, *body.event_types, *body.keywords]) or "All observations"
    return retrieval.retrieve(db, settings, constraints, f"Index filter: {label}")


def coverage(db, settings, curated_only=False) -> IndexCoverage:
    version = index_store.version(settings)
    cameras = {
        row["id"]: row
        for row in db.execute(
            """SELECT c.id,c.name,count(r.id) AS recordings,
            coalesce(sum(r.available_duration_ms),0) AS available_ms
            FROM cameras c LEFT JOIN recordings r ON r.camera_id=c.id AND r.status!='deleted'
            AND (NOT %s OR r.source_media->>'kind'='prerecorded')
            WHERE c.deleted_at IS NULL GROUP BY c.id,c.name ORDER BY c.name""",
            (curated_only,),
        ).fetchall()
    }
    segments = {
        row["camera_id"]: row
        for row in db.execute(
            """SELECT r.camera_id,count(s.id) AS segments,min(s.started_at) AS first_at,
            max(s.started_at+s.duration_ms*interval '1 millisecond') AS last_at,
            count(i.segment_id) AS indexed,
            coalesce(sum(i.analyzed_end_ms-i.analyzed_start_ms),0) AS analyzed_ms
            FROM segments s JOIN recordings r ON r.id=s.recording_id
            LEFT JOIN segment_indexes i ON i.segment_id=s.id AND i.pipeline_version=%s
              AND i.state='succeeded'
            WHERE s.status='ready' AND r.status!='deleted'
            AND (NOT %s OR r.source_media->>'kind'='prerecorded') GROUP BY r.camera_id""",
            (version, curated_only),
        ).fetchall()
    }
    observations: dict = {}
    for row in db.execute(
        """SELECT r.camera_id,v.event_types,v.objects,
        s.started_at+v.observation_start_ms*interval '1 millisecond' AS at
        FROM video_metadata v JOIN segments s ON s.id=v.segment_id
        JOIN recordings r ON r.id=s.recording_id
        WHERE v.processing_state='succeeded' AND v.provenance->>'pipeline_version'=%s
        AND (NOT %s OR r.source_media->>'kind'='prerecorded')""",
        (version, curated_only),
    ).fetchall():
        item = observations.setdefault(
            row["camera_id"], {"count": 0, "last": None, "types": {}, "categories": {}}
        )
        item["count"] += 1
        item["last"] = max(filter(None, [item["last"], row["at"]]))
        for kind in row["event_types"]:
            item["types"][kind] = item["types"].get(kind, 0) + 1
        # Count each category once per observation, however many instances it lists.
        for category in {obj.get("category") for obj in row["objects"]} - {None}:
            item["categories"][category] = item["categories"].get(category, 0) + 1
    items = []
    for camera_id, camera in cameras.items():
        seg = segments.get(camera_id, {})
        obs = observations.get(camera_id, {"count": 0, "last": None, "types": {}, "categories": {}})
        items.append(
            CameraCoverage(
                camera_id=camera_id,
                camera_name=camera["name"],
                recordings=camera["recordings"],
                first_recorded_at=seg.get("first_at"),
                last_recorded_at=seg.get("last_at"),
                available_ms=camera["available_ms"],
                segments=seg.get("segments", 0),
                indexed_segments=seg.get("indexed", 0),
                analyzed_ms=seg.get("analyzed_ms", 0),
                observations=obs["count"],
                last_observation_at=obs["last"],
                event_types=dict(sorted(obs["types"].items())),
                categories=dict(sorted(obs["categories"].items())),
            )
        )
    return IndexCoverage(pipeline_version=version, items=items)


FRAME_WIDTH = 480
FRAME_STEP_MS = 250
FRAME_CACHE_MAX_BYTES = 64 * 1024 * 1024
_frame_slots = threading.BoundedSemaphore(2)


def _evict(directory, limit):
    files = sorted(
        (entry.stat().st_mtime_ns, entry.stat().st_size, entry.path)
        for entry in os.scandir(directory)
        if entry.is_file() and entry.name.endswith(".jpg")
    )
    total = sum(size for _, size, _ in files)
    for _, size, path in files:
        if total <= limit:
            break
        try:
            os.unlink(path)
            total -= size
        except OSError:
            continue


def frame(db, settings, recording_id: UUID, offset_ms: int, segment_id: UUID | None):
    """Return a cached JPEG path decoded from the finalized segment covering the offset."""
    recording = store.get_recording(db, recording_id)
    store.get_camera(db, recording["camera_id"])
    rows = db.execute(
        """SELECT id,storage_key,offset_ms,duration_ms FROM segments
        WHERE recording_id=%s AND status='ready' AND offset_ms<=%s
        AND offset_ms+duration_ms>%s AND (%s::uuid IS NULL OR id=%s)
        ORDER BY offset_ms DESC LIMIT 1""",
        (recording_id, offset_ms, offset_ms, segment_id, segment_id),
    ).fetchall()
    if not rows:
        raise Problem(409, "MEDIA_GAP", "There is no available video at this offset.")
    segment = rows[0]
    source = safe_file(settings.recordings_root, segment["storage_key"])
    stat = source.stat()
    # Quantized positions keep the cache small; a frame is a preview, not frame-exact evidence.
    position = min(offset_ms - segment["offset_ms"], max(segment["duration_ms"] - 200, 0))
    position -= position % FRAME_STEP_MS
    cache = settings.playback_cache_root / "frames"
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = cache / f"{segment['id'].hex}-{stat.st_mtime_ns}-{position}.jpg"
    if target.is_file():
        return target
    if not _frame_slots.acquire(timeout=10):
        raise Problem(503, "MEDIA_BUSY", "Preview frames are still being prepared.", True)
    partial = cache / f".{uuid4().hex}.jpg"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{position / 1000:.3f}",
                "-i",
                str(source),
                "-frames:v",
                "1",
                "-vf",
                f"scale={FRAME_WIDTH}:-2",
                "-q:v",
                "5",
                "-f",
                "image2",
                "-y",
                str(partial),
            ],
            check=True,
            capture_output=True,
            timeout=15,
        )
        if not partial.is_file() or partial.stat().st_size == 0:
            raise OSError
        os.replace(partial, target)
    except (subprocess.SubprocessError, OSError):
        raise Problem(503, "INVALID_MEDIA", "A preview frame could not be decoded.") from None
    finally:
        partial.unlink(missing_ok=True)
        _frame_slots.release()
    _evict(cache, FRAME_CACHE_MAX_BYTES)
    return target
