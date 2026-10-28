"""Parameterized stored-index retrieval and real recording/activity time arithmetic."""

import base64
import binascii
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID

from psycopg.types.json import Jsonb

from . import contracts as c
from . import index_models as m
from . import index_store, store
from .agent_models import RuntimeNavigationAction, RuntimeRecordingTarget
from .db import Problem
from .index_provider import IndexProvider
from .media_client import safe_file
from .meta import ModelFailure


def window(start, end):
    end = end or datetime.now(timezone.utc)
    start = start or end - timedelta(hours=24)
    if start >= end or end - start > timedelta(hours=24):
        raise Problem(422, "INVALID_TIME_RANGE", "Use an ordered time window of at most 24 hours.")
    return start, end


def navigation(recording_id, offset_ms, segment_id):
    return RuntimeNavigationAction(
        label="Play matching footage",
        target=RuntimeRecordingTarget(
            recording_id=recording_id, offset_ms=offset_ms, segment_id=segment_id
        ),
    )


def union_ms(intervals, start, end):
    ranges = sorted((max(a, start), min(b, end)) for a, b in intervals if a < end and b > start)
    total, previous = 0, None
    for a, b in ranges:
        if previous is None:
            previous = (a, b)
        elif a <= previous[1]:
            previous = (previous[0], max(previous[1], b))
        else:
            total += round((previous[1] - previous[0]).total_seconds() * 1000)
            previous = (a, b)
    if previous:
        total += round((previous[1] - previous[0]).total_seconds() * 1000)
    return total


def available_segments(db, settings, camera_ids, start, end, curated_only=False):
    rows = db.execute(
        """SELECT s.*,r.camera_id,c.name AS camera_name FROM segments s
        JOIN recordings r ON r.id=s.recording_id JOIN cameras c ON c.id=r.camera_id
        WHERE c.deleted_at IS NULL AND s.status='ready' AND r.status IN ('ready','recording')
        AND (%s::uuid[] IS NULL OR r.camera_id=ANY(%s)) AND s.started_at<%s
        AND s.started_at+s.duration_ms*interval '1 millisecond'>%s
        AND (NOT %s OR r.source_media->>'kind'='prerecorded')
        ORDER BY s.started_at,s.id LIMIT 10001""",
        (camera_ids or None, camera_ids or None, end, start, curated_only),
    ).fetchall()
    if len(rows) > 10000:
        raise Problem(422, "SEARCH_WINDOW_TOO_LARGE", "Narrow the camera or time range.")
    ready = []
    for row in rows:
        try:
            path = safe_file(settings.recordings_root, row["storage_key"])
            stat = path.stat()
            row["_source_stat"] = (stat.st_size, stat.st_mtime_ns)
            ready.append(row)
        except Problem:
            continue
    return ready


def unchanged_indexes(indexes, segments):
    by_id = {s["id"]: s for s in segments}
    return [
        item
        for item in indexes
        if item["segment_id"] in by_id
        and (item["provenance"].get("source_size_bytes"), item["provenance"].get("source_mtime_ns"))
        == by_id[item["segment_id"]]["_source_stat"]
    ]


def constraints_for(db, body, intent):
    if intent.unsupported_reason:
        raise Problem(
            422,
            "UNSUPPORTED_SEARCH_CONSTRAINT",
            "This request includes an unsupported or ambiguous search condition.",
        )
    explicit = set(body.camera_ids)
    for camera_id in explicit:
        store.get_camera(db, camera_id)
    inferred = set()
    cameras = store.list_cameras(db)
    for name in intent.camera_names:
        exact = [
            row
            for row in cameras
            if name.casefold().strip()
            in {
                (row.get(key) or "").casefold().strip()
                for key in ("name", "location", "group_name")
            }
        ]
        if not exact:
            raise Problem(422, "CAMERA_NOT_FOUND", "No camera matches the requested location.")
        if len(exact) > 1:
            raise Problem(422, "CAMERA_AMBIGUOUS", "Choose a unique camera name for this search.")
        inferred.add(exact[0]["id"])
    selected = explicit & inferred if explicit and inferred else explicit or inferred
    if explicit and inferred and not selected:
        raise Problem(422, "CAMERA_FILTER_CONFLICT", "Query and explicit camera filters conflict.")
    starts = [value for value in (body.start, intent.start) if value]
    ends = [value for value in (body.end, intent.end) if value]
    start, end = window(max(starts) if starts else None, min(ends) if ends else None)
    return m.StructuredSearch(
        **intent.model_dump(exclude={"start", "end"}),
        start=start,
        end=end,
        camera_ids=sorted(selected, key=str),
        limit=body.limit,
        curated_only=body.curated_only,
    )


class SearchService:
    def __init__(self, settings, database, provider_factory=None):
        self.settings, self.database = settings, database
        self.provider_factory = provider_factory or (lambda: IndexProvider(settings, database))

    def search(self, body):
        started = time.monotonic()
        # Validate explicit inputs before any billed call.
        if body.start and body.end:
            window(body.start, body.end)
        with self.database.connect() as db:
            for camera_id in body.camera_ids:
                store.get_camera(db, camera_id)
            cameras = [
                {
                    key: str(row[key]) if key == "id" else row[key]
                    for key in ("id", "name", "location", "group_name")
                }
                for row in store.list_cameras(db)
            ]
        provider = None
        try:
            provider = self.provider_factory()
            intent = provider.parse_search(body, cameras)
        except ModelFailure as exc:
            raise Problem(
                503,
                exc.code,
                "Muse could not parse this search. No media was analyzed.",
                exc.retryable,
            ) from None
        finally:
            if provider:
                provider.close()
        with self.database.connect() as db:
            constraints = constraints_for(db, body, intent)
            response = retrieve(db, self.settings, constraints, body.query)
        response.latency_ms = round((time.monotonic() - started) * 1000)
        return response


def retrieve(db, settings, constraints, query="Structured video search"):
    started = time.monotonic()
    if constraints.unsupported_reason:
        raise Problem(422, "UNSUPPORTED_SEARCH_CONSTRAINT", "This search condition is unsupported.")
    start, end = window(constraints.start, constraints.end)
    constraints = constraints.model_copy(update={"start": start, "end": end})
    for camera_id in constraints.camera_ids:
        store.get_camera(db, camera_id)
    # Tool callers may use camera names; resolve through the same REST constraints service.
    if constraints.camera_names:
        body = m.SearchRequest(
            query=query,
            curated_only=constraints.curated_only,
            camera_ids=constraints.camera_ids,
            start=start,
            end=end,
            limit=constraints.limit,
        )
        constraints = constraints_for(
            db,
            body,
            m.SearchIntent.model_validate(
                constraints.model_dump(exclude={"camera_ids", "limit", "curated_only"})
            ),
        )
    segments = available_segments(
        db, settings, constraints.camera_ids, start, end, constraints.curated_only
    )
    by_id = {row["id"]: row for row in segments}
    ids = list(by_id)
    coverage = db.execute(
        """SELECT i.*,s.started_at,s.duration_ms FROM segment_indexes i
        JOIN segments s ON s.id=i.segment_id WHERE i.segment_id=ANY(%s)
        AND i.pipeline_version=%s AND i.state='succeeded'""",
        (ids, index_store.version(settings)),
    ).fetchall()
    coverage = unchanged_indexes(coverage, segments)
    indexed_ids = [item["segment_id"] for item in coverage]
    available_ms = analyzed_ms = 0
    for camera_id in {s["camera_id"] for s in segments}:
        available_ms += union_ms(
            [
                (s["started_at"], s["started_at"] + timedelta(milliseconds=s["duration_ms"]))
                for s in segments
                if s["camera_id"] == camera_id
            ],
            start,
            end,
        )
        analyzed_ms += union_ms(
            [
                (
                    i["started_at"] + timedelta(milliseconds=i["analyzed_start_ms"]),
                    i["started_at"] + timedelta(milliseconds=i["analyzed_end_ms"]),
                )
                for i in coverage
                if by_id[i["segment_id"]]["camera_id"] == camera_id
            ],
            start,
            end,
        )
    clauses = [
        "v.segment_id=ANY(%s)",
        "v.processing_state='succeeded'",
        "v.provenance->>'pipeline_version'=%s",
        "s.started_at+v.observation_start_ms*interval '1 millisecond'<%s",
        "s.started_at+v.observation_end_ms*interval '1 millisecond'>%s",
    ]
    parameters = [indexed_ids, index_store.version(settings), end, start]
    for obj in constraints.objects:
        clauses.append("v.objects @> %s")
        parameters.append(Jsonb([obj.model_dump()]))
    if constraints.event_types:
        clauses.append("v.event_types @> %s::text[]")
        parameters.append(constraints.event_types)
    if constraints.keywords:
        clauses.append("v.search_document @@ plainto_tsquery('simple',%s)")
        parameters.append(" ".join(constraints.keywords))
    if constraints.motion_only:
        clauses.append("""EXISTS (SELECT 1 FROM motion_samples ms WHERE ms.segment_id=s.id
            AND ms.pipeline_version=%s AND ms.active AND ms.start_ms<v.observation_end_ms
            AND ms.end_ms>v.observation_start_ms)""")
        parameters.append(index_store.version(settings))
    where = " AND ".join(clauses)  # Only server-authored clauses; values are bound parameters.
    rank = (
        "ts_rank_cd(v.search_document,plainto_tsquery('simple',%s))"
        if constraints.keywords
        else "0"
    )
    rank_parameters = [" ".join(constraints.keywords)] if constraints.keywords else []
    rows = (
        db.execute(
            "SELECT v.*,"
            + rank
            + " AS score FROM video_metadata v JOIN segments s ON s.id=v.segment_id "
            + """
        WHERE """
            + where
            + " ORDER BY score DESC,s.started_at DESC,v.observation_start_ms,v.id LIMIT %s",
            (*rank_parameters, *parameters, constraints.limit),
        ).fetchall()
        if ids
        else []
    )
    hits = []
    for row in rows:
        segment = by_id[row["segment_id"]]
        observation_start = segment["started_at"] + timedelta(
            milliseconds=row["observation_start_ms"]
        )
        observation_end = segment["started_at"] + timedelta(milliseconds=row["observation_end_ms"])
        hit_start, hit_end = max(start, observation_start), min(end, observation_end)
        offset = segment["offset_ms"] + round(
            (hit_start - segment["started_at"]).total_seconds() * 1000
        )
        hits.append(
            m.SearchHit(
                segment_id=segment["id"],
                camera_id=segment["camera_id"],
                camera_name=segment["camera_name"],
                recording_id=segment["recording_id"],
                start=hit_start,
                end=hit_end,
                offset_ms=offset,
                summary=row["summary"],
                evidence_text=row["evidence_text"],
                model_id=row["model_id"],
                indexed_at=row["indexed_at"],
                relevance=float(row["score"]) / float(rows[0]["score"]) if rows[0]["score"] else 1,
                action=navigation(segment["recording_id"], offset, segment["id"]),
                metadata_id=row["id"],
                objects=row["objects"],
                event_types=row["event_types"],
                uncertainty=row["uncertainty"],
                uncertainty_notes=row["uncertainty_notes"],
                prompt_version=row["prompt_version"],
                schema_version=row["schema_version"],
                provenance=row["provenance"],
                evidence=m.Evidence(
                    metadata_id=row["id"],
                    recording_id=segment["recording_id"],
                    segment_id=segment["id"],
                    start_offset_ms=offset,
                    end_offset_ms=offset + round((hit_end - hit_start).total_seconds() * 1000),
                ),
                playback_request=m.PlaybackRequest(
                    recording_id=segment["recording_id"],
                    segment_id=segment["id"],
                    offset_ms=offset,
                    duration_ms=10000,
                ),
            )
        )
    # A pure motion search can be grounded in measured pixel change even without Muse objects.
    if constraints.motion_only and not (
        constraints.objects or constraints.event_types or constraints.keywords
    ):
        hits = motion_hits(
            db,
            settings,
            [s for s in segments if s["id"] in indexed_ids],
            start,
            end,
            constraints.limit,
        )
    coverage_state = (
        "none" if analyzed_ms == 0 else "complete" if analyzed_ms == available_ms else "partial"
    )
    explanation = (
        f"Found {len(hits)} indexed intervals. "
        if hits
        else "No matching indexed intervals were found. "
    )
    explanation += (
        f"Analyzed {analyzed_ms} of {available_ms} available milliseconds. "
        "Sampled analysis can miss events; this does not prove absence of activity."
    )
    return m.SearchResponse(
        query=query,
        coverage=coverage_state,
        items=hits,
        explanation=explanation,
        constraints=constraints,
        available_ms=available_ms,
        analyzed_ms=analyzed_ms,
        latency_ms=round((time.monotonic() - started) * 1000),
    )


def motion_hits(db, settings, segments, start, end, limit):
    by_id = {s["id"]: s for s in segments}
    rows = db.execute(
        """SELECT e.*,i.provenance AS source_provenance,i.updated_at FROM events e
        JOIN segment_indexes i ON i.segment_id=e.segment_id WHERE e.segment_id=ANY(%s)
        AND e.provenance='ffmpeg_motion' AND i.pipeline_version=%s
        AND e.pipeline_version=i.pipeline_version AND i.state='succeeded'
        AND e.started_at<%s AND e.ended_at>%s ORDER BY e.started_at DESC,e.id LIMIT %s""",
        (list(by_id), index_store.version(settings), end, start, limit),
    ).fetchall()
    hits = []
    for row in rows:
        segment = by_id[row["segment_id"]]
        a, b = max(start, row["started_at"]), min(end, row["ended_at"])
        offset = segment["offset_ms"] + round((a - segment["started_at"]).total_seconds() * 1000)
        hits.append(
            m.SearchHit(
                segment_id=segment["id"],
                camera_id=segment["camera_id"],
                camera_name=segment["camera_name"],
                recording_id=segment["recording_id"],
                start=a,
                end=b,
                offset_ms=offset,
                summary=row["summary"],
                evidence_text=row["summary"],
                model_id="ffmpeg_gray_v1",
                indexed_at=row["updated_at"],
                relevance=1,
                action=navigation(segment["recording_id"], offset, segment["id"]),
                metadata_id=None,
                objects=[],
                event_types=[],
                uncertainty="high",
                uncertainty_notes=(
                    "Pixel changes may be lighting or camera motion; no object motion is inferred."
                ),
                prompt_version="not_applicable",
                schema_version="motion-1",
                provenance=row["source_provenance"],
                evidence=m.Evidence(
                    metadata_id=None,
                    event_id=row["id"],
                    recording_id=segment["recording_id"],
                    segment_id=segment["id"],
                    start_offset_ms=offset,
                    end_offset_ms=offset + round((b - a).total_seconds() * 1000),
                    boundary_accuracy="sampled_pixel_change",
                ),
                playback_request=m.PlaybackRequest(
                    recording_id=segment["recording_id"],
                    segment_id=segment["id"],
                    offset_ms=offset,
                    duration_ms=10000,
                ),
            )
        )
    return hits


def activity(db, settings, camera_id, start, end, bucket_seconds):
    store.get_camera(db, camera_id)
    start, end = window(start, end)
    count = (end - start).total_seconds() / bucket_seconds
    if count > 1440:
        raise Problem(422, "TOO_MANY_BUCKETS", "Choose at most 1440 timeline bins.")
    segments = available_segments(db, settings, [camera_id], start, end)
    ids = [s["id"] for s in segments]
    by_id = {s["id"]: s for s in segments}
    indexes = db.execute(
        """SELECT * FROM segment_indexes WHERE segment_id=ANY(%s)
        AND pipeline_version=%s AND state='succeeded'""",
        (ids, index_store.version(settings)),
    ).fetchall()
    indexes = unchanged_indexes(indexes, segments)
    indexed_ids = [item["segment_id"] for item in indexes]
    motion = db.execute(
        """SELECT * FROM motion_samples WHERE segment_id=ANY(%s)
        AND pipeline_version=%s""",
        (indexed_ids, index_store.version(settings)),
    ).fetchall()
    events = db.execute(
        """SELECT e.* FROM events e JOIN video_metadata v ON v.id=e.metadata_id
        WHERE e.segment_id=ANY(%s) AND e.provenance='muse' AND e.started_at>=%s
        AND e.started_at<%s AND v.processing_state='succeeded'
        AND v.provenance->>'pipeline_version'=%s""",
        (indexed_ids, start, end, index_store.version(settings)),
    ).fetchall()
    spans = [
        (s["started_at"], s["started_at"] + timedelta(milliseconds=s["duration_ms"]))
        for s in segments
    ]
    analyzed = [
        (
            by_id[i["segment_id"]]["started_at"] + timedelta(milliseconds=i["analyzed_start_ms"]),
            by_id[i["segment_id"]]["started_at"] + timedelta(milliseconds=i["analyzed_end_ms"]),
        )
        for i in indexes
    ]
    motion_spans = [
        (
            by_id[i["segment_id"]]["started_at"] + timedelta(milliseconds=i["start_ms"]),
            by_id[i["segment_id"]]["started_at"] + timedelta(milliseconds=i["end_ms"]),
            i["active"],
        )
        for i in motion
    ]
    buckets, a = [], start
    while a < end:
        b = min(end, a + timedelta(seconds=bucket_seconds))
        occurrences = sum(a <= event["started_at"] < b for event in events)
        playback = []
        for s in segments:
            if (
                s["started_at"] < b
                and s["started_at"] + timedelta(milliseconds=s["duration_ms"]) > a
            ):
                offset = s["offset_ms"] + max(
                    0, round((a - s["started_at"]).total_seconds() * 1000)
                )
                playback.append(navigation(s["recording_id"], offset, s["id"]))
                break
        buckets.append(
            m.ActivityBucket(
                start=a,
                end=b,
                event_count=occurrences,
                coverage_ms=union_ms(spans, a, b),
                analyzed_ms=union_ms(analyzed, a, b),
                motion_ms=union_ms([(x, y) for x, y, active in motion_spans if active], a, b),
                motion_sampled_ms=union_ms([(x, y) for x, y, _ in motion_spans], a, b),
                event_density_per_minute=occurrences * 60 / (b - a).total_seconds(),
                playback=playback,
            )
        )
        a = b
    return m.ActivityHistogram(camera_id=camera_id, buckets=buckets)


def list_events(db, settings, camera_id, start, end, cursor, limit, kind=None, curated_only=False):
    value = None
    if cursor:
        try:
            value = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            if value["v"] != 2:
                raise ValueError
            start = start or datetime.fromisoformat(value["start"])
            end = end or datetime.fromisoformat(value["end"])
        except (ValueError, TypeError, KeyError, binascii.Error, UnicodeError):
            raise Problem(422, "INVALID_CURSOR", "The event cursor is invalid.") from None
    start, end = window(start, end)
    scope = hashlib.sha256(
        json.dumps(
            [
                str(camera_id),
                start.isoformat(),
                end.isoformat(),
                kind,
                curated_only,
                index_store.version(settings),
            ]
        ).encode()
    ).hexdigest()[:24]
    previous_time, previous_id = end, UUID(int=2**128 - 1)
    if value is not None:
        try:
            previous_time, previous_id = datetime.fromisoformat(value["at"]), UUID(value["id"])
            if (
                value["scope"] != scope
                or previous_time.tzinfo is None
                or not start <= previous_time < end
            ):
                raise ValueError
        except (ValueError, TypeError, KeyError):
            raise Problem(
                422, "INVALID_CURSOR", "The event cursor does not match these filters."
            ) from None
    if camera_id:
        store.get_camera(db, camera_id)
    segments = available_segments(
        db, settings, [camera_id] if camera_id else [], start, end, curated_only
    )
    indexes = db.execute(
        """SELECT * FROM segment_indexes WHERE segment_id=ANY(%s)
        AND pipeline_version=%s AND state='succeeded'""",
        ([s["id"] for s in segments], index_store.version(settings)),
    ).fetchall()
    indexed_ids = [i["segment_id"] for i in unchanged_indexes(indexes, segments)]
    rows = db.execute(
        """SELECT e.* FROM events e LEFT JOIN video_metadata v ON v.id=e.metadata_id
        WHERE e.segment_id=ANY(%s) AND e.started_at>=%s AND e.started_at<%s
        AND (e.started_at,e.id)<(%s,%s) AND (v.id IS NULL OR v.processing_state='succeeded')
        AND e.pipeline_version=%s AND (%s::text IS NULL OR e.kind=%s)
        ORDER BY e.started_at DESC,e.id DESC LIMIT %s""",
        (
            indexed_ids,
            start,
            end,
            previous_time,
            previous_id,
            index_store.version(settings),
            kind,
            kind,
            limit + 1,
        ),
    ).fetchall()
    next_cursor = None
    if len(rows) > limit:
        row = rows[limit - 1]
        next_cursor = base64.urlsafe_b64encode(
            json.dumps(
                {
                    "v": 2,
                    "at": row["started_at"].isoformat(),
                    "id": str(row["id"]),
                    "scope": scope,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                }
            ).encode()
        ).decode()
    return c.EventList(
        items=[c.Event(**{key: row[key] for key in c.Event.model_fields}) for row in rows[:limit]],
        next_cursor=next_cursor,
    )
