"""Real licensed MP4 + FFmpeg + PostgreSQL. Provider HTTP is explicitly scripted here."""

import json
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import psycopg
import pytest
from pydantic import ValidationError
from test_agent_integration import agent_env, postgres_url  # noqa: F401
from test_meta_agent import completion, tool_call
from veyra import index_media, index_store, retrieval
from veyra import index_models as m
from veyra.agent import Agent
from veyra.config import Settings
from veyra.contracts import AnalysisJobCreate
from veyra.db import Problem
from veyra.index_provider import IndexProvider, UsageMeter, output_json
from veyra.index_worker import Worker
from veyra.meta import MetaClient, ModelFailure

FIXTURES = Path(__file__).parent / "fixtures/video"
OPERATOR = {"Authorization": "Bearer agent-test-operator"}
VIEWER = {"Authorization": "Bearer agent-test-viewer"}
ORIGIN = datetime(2026, 10, 25, 19, 59, 55, tzinfo=timezone.utc)
LIVE_SETTINGS = Settings()


def intent(**changes):
    return {
        "camera_names": [],
        "start": None,
        "end": None,
        "objects": [],
        "event_types": [],
        "motion_only": False,
        "keywords": [],
        "unsupported_reason": None,
        **changes,
    }


def structured(**changes):
    values = {
        "start": ORIGIN.isoformat(),
        "end": (ORIGIN + timedelta(seconds=30)).isoformat(),
        **changes,
    }
    return m.StructuredSearch.model_validate_json(json.dumps(intent(**values), default=str))


def observation(index):
    objects = (
        []
        if index == 0
        else [
            {"category": "bicycle", "attributes": [], "evidence": "Two wheels and bicycle frame."},
            {
                "category": "person",
                "attributes": [] if index == 2 else ["helmet"],
                "apparel": [
                    {"kind": "shirt", "colors": ["green"]},
                    {"kind": "pants", "colors": ["blue"]},
                ]
                if index == 2
                else [],
                "evidence": "Visible person riding a bicycle.",
            },
        ]
    )
    return {
        "observations": [
            {
                "start_ms": 250,
                "end_ms": 2750 if index == 0 else 3750,
                "caption": "Grass and trees."
                if index == 0
                else "A person cycles on a bicycle near trees.",
                "evidence": "Reviewed fixture labels; scripted provider output for testing.",
                "objects": objects,
                "event_types": [] if index == 0 else ["cycling"],
                "uncertainty": "medium",
                "uncertainty_notes": "Clip-level labels; estimated time boundaries.",
            }
        ]
    }


def response(value):
    return {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": json.dumps(value)}],
            }
        ],
        "usage": {"input_tokens": 100, "output_tokens": 50},
    }


class Scripted:
    def __init__(self):
        self.calls, self.uploads, self.deletes, self.analyzed = [], 0, 0, 0
        self.search_intent = intent(objects=[{"category": "bicycle", "attributes": []}])
        self.results = [observation(i) for i in range(3)]
        self.failure = None
        self.after_upload = None

    def handle(self, request):
        self.calls.append((request.method, request.url.path))
        assert request.url.host == "api.meta.ai"
        if request.method == "DELETE":
            self.deletes += 1
            return httpx.Response(200, json={"deleted": True})
        if request.url.path == "/v1/files":
            assert b"ftyp" in request.content and b"clip.mp4" in request.content
            assert b"created_at" in request.content and b"3600" in request.content
            self.uploads += 1
            if self.after_upload:
                self.after_upload()
            return httpx.Response(200, json={"id": f"file-test-{self.uploads}"})
        payload = json.loads(request.content)
        assert payload["store"] is False and payload["text"]["format"]["strict"] is True
        content = payload["input"][0]["content"]
        if content[0]["type"] == "input_file":
            if self.failure:
                failure, self.failure = self.failure, None
                return failure
            value = self.results[self.analyzed]
            self.analyzed += 1
        else:
            value = self.search_intent
        return httpx.Response(200, json=response(value))


@pytest.fixture
def indexed_env(agent_env, tmp_path):  # noqa: F811
    client, database, cameras = agent_env
    settings = client.app.state.settings.model_copy(
        update={
            "recordings_root": tmp_path / "recordings",
            "playback_cache_root": tmp_path / "cache",
            "model_api_key": Settings(
                _env_file=None, model_api_key="scripted-not-live"
            ).model_api_key,
            "model_daily_budget_usd": 2.0,
            "model_request_reserve_usd": 0.01,
            "model_input_usd_per_million": 1.0,
            "model_output_usd_per_million": 2.0,
            "indexing_motion_threshold": 0.01,
        }
    )
    settings.recordings_root.mkdir()
    client.app.state.settings = settings
    client.app.state.sessions.settings = settings
    client.app.state.pipeline.settings = settings
    client.app.state.agent = Agent(settings, database)
    script = Scripted()

    def factory():
        return IndexProvider(settings, database, transport=httpx.MockTransport(script.handle))

    client.app.state.search = retrieval.SearchService(settings, database, factory)
    recording_id, segment_ids = uuid4(), []
    manifest = json.loads((FIXTURES / "dataset.json").read_text())
    with database.connect() as db:
        db.execute(
            "UPDATE cameras SET cloud_analysis_allowed=true WHERE id=%s", (cameras[0]["id"],)
        )
        db.execute(
            """INSERT INTO recordings(id,camera_id,started_at,ended_at,status,
            available_duration_ms) VALUES (%s,%s,%s,%s,'ready',11011)""",
            (recording_id, cameras[0]["id"], ORIGIN, ORIGIN + timedelta(milliseconds=11011)),
        )
        offset = 0
        for clip in manifest["clips"]:
            segment_id = uuid4()
            target = settings.recordings_root / clip["file"]
            shutil.copyfile(FIXTURES / clip["file"], target)
            assert index_media.checksum(target) == clip["sha256"]
            duration = index_media.media_info(target)["duration_ms"]
            assert duration == clip["duration_ms"]
            db.execute(
                """INSERT INTO segments(id,recording_id,storage_key,started_at,
                duration_ms,offset_ms,status) VALUES (%s,%s,%s,%s,%s,%s,'ready')""",
                (
                    segment_id,
                    recording_id,
                    clip["file"],
                    ORIGIN + timedelta(milliseconds=offset),
                    duration,
                    offset,
                ),
            )
            segment_ids.append(segment_id)
            offset += duration
        index_store.register_segments(db, settings)
    return client, database, cameras, settings, recording_id, segment_ids, script, factory


def enqueue(env, key=None):
    client, _, _, _, recording_id, *_ = env
    result = client.post(
        "/api/v1/analysis-jobs",
        headers={**OPERATOR, "Idempotency-Key": key or str(uuid4())},
        json={"recording_id": str(recording_id), "allow_cloud_upload": True},
    )
    assert result.status_code == 202, result.text
    return result.json()


def run_index(env):
    job = enqueue(env)
    _, database, _, settings, _, _, _, factory = env
    started = time.monotonic()
    assert Worker(settings, database, factory).once()
    with database.connect() as db:
        result = index_store.get_job(db, UUID(job["id"]))
    assert result.state == "succeeded", result.model_dump()
    return result, time.monotonic() - started


def retrieve(env, **changes):
    _, database, _, settings, *_ = env
    with database.connect() as db:
        return retrieval.retrieve(db, settings, structured(**changes))


def test_real_media_pipeline_search_filters_and_histogram(indexed_env):
    env = indexed_env
    client, database, cameras, settings, recording_id, segment_ids, script, _ = env
    before = client.get(f"/api/v1/recordings/{recording_id}/index", headers=OPERATOR).json()
    assert [item["state"] for item in before["items"]] == ["waiting"] * 3
    initial = enqueue(env, key="index-duplicate-key")
    replay = enqueue(env, key="index-duplicate-key")
    duplicate = enqueue(env)
    assert initial == replay and duplicate["id"] == initial["id"]
    job, elapsed = run_index(env)
    assert job.progress == 1 and job.attempts == 1 and len(job.segments) == 3
    assert job.selected_duration_ms == 11011 and job.usage.requests == 3
    assert job.usage.estimated_usd == pytest.approx(
        0.0006
    )  # Scripted token fixture, not a real bill.
    assert job.usage.billing == "unknown"
    assert script.uploads == script.deletes == 3
    result = client.post(
        "/api/v1/search",
        headers=OPERATOR,
        json={
            "query": "Find footage with a bicycle near Entrance.",
            "camera_ids": [cameras[0]["id"]],
            "start": ORIGIN.isoformat(),
            "end": (ORIGIN + timedelta(seconds=30)).isoformat(),
        },
    )
    assert result.status_code == 200, result.text
    search = result.json()
    assert len(search["items"]) == 2 and search["coverage"] == "complete"
    assert script.uploads == 3, "Search must not upload/reanalyze recordings."
    for hit in search["items"]:
        assert hit["segment_id"] in [str(s) for s in segment_ids]
        assert hit["camera_id"] == cameras[0]["id"] and hit["recording_id"] == str(recording_id)
        assert hit["action"]["target"]["offset_ms"] == hit["offset_ms"]
        assert datetime.fromisoformat(hit["start"]) == ORIGIN + timedelta(
            milliseconds=hit["offset_ms"]
        )
        assert hit["provenance"]["source_sha256"]
    bike = [{"category": "bicycle", "attributes": []}]
    assert len(retrieve(env, objects=bike).items) == 2
    assert not retrieve(env, camera_ids=[UUID(cameras[1]["id"])], objects=bike).items
    assert not retrieve(env, objects=[{"category": "dog", "attributes": []}]).items
    assert not retrieve(
        env,
        objects=[
            {
                "category": "person",
                "attributes": [],
                "apparel": [{"kind": "jacket", "colors": ["red"]}],
            }
        ],
    ).items
    green = retrieve(
        env,
        objects=[
            {
                "category": "person",
                "attributes": [],
                "apparel": [{"kind": "shirt", "colors": ["green"]}],
            }
        ],
    )
    assert len(green.items) == 1 and green.items[0].segment_id == segment_ids[2]
    assert not retrieve(
        env,
        objects=[
            {
                "category": "person",
                "attributes": [],
                "apparel": [{"kind": "pants", "colors": ["green"]}],
            }
        ],
    ).items
    assert not retrieve(
        env, objects=[{"category": "bicycle", "attributes": ["green", "shirt"]}]
    ).items
    assert len(retrieve(env, event_types=["cycling"]).items) == 2
    assert len(retrieve(env, keywords=["grass"]).items) == 1
    clipped = retrieve(env, start="2026-10-25T20:00:00Z", objects=bike)
    assert all(
        hit.start >= datetime(2026, 10, 25, 20, tzinfo=timezone.utc) for hit in clipped.items
    )
    assert any(hit.offset_ms == 5000 for hit in clipped.items)
    no_match = retrieve(env, keywords=["unicorn"])
    assert not no_match.items and "No matching indexed" in no_match.explanation
    with database.connect() as db:
        histogram = retrieval.activity(
            db, settings, UUID(cameras[0]["id"]), ORIGIN, ORIGIN + timedelta(seconds=20), 10
        )
    assert [b.coverage_ms for b in histogram.buckets] == [10000, 1011]
    assert sum(b.analyzed_ms for b in histogram.buckets) == 11011
    assert sum(b.event_count for b in histogram.buckets) == 2
    assert all(b.motion_ms <= b.motion_sampled_ms <= b.coverage_ms for b in histogram.buckets)
    assert all(b.playback for b in histogram.buckets)
    artifact = {
        "scope": "real MP4/FFmpeg/PostgreSQL; explicitly scripted Meta HTTP",
        "indexing_wall_seconds": elapsed,
        "job": job.model_dump(mode="json"),
        "search": search,
        "histogram": histogram.model_dump(mode="json"),
        "genuine_model_quality": None,
        "actual_model_cost_usd": None,
    }
    if os.environ.get("VEYRA_INDEX_EVIDENCE"):
        Path(os.environ["VEYRA_INDEX_EVIDENCE"]).mkdir(parents=True, exist_ok=True)
        (Path(os.environ["VEYRA_INDEX_EVIDENCE"]) / "scripted-index.json").write_text(
            json.dumps(artifact, indent=2)
        )


def test_missing_media_excludes_hits_and_availability(indexed_env):
    env = indexed_env
    run_index(env)
    settings = env[3]
    (settings.recordings_root / "cycling.mp4").unlink()
    result = retrieve(env, objects=[{"category": "bicycle", "attributes": []}])
    assert len(result.items) == 1 and result.available_ms == 7007


def test_search_intent_filters_cannot_widen_explicit_filters(indexed_env):
    env = indexed_env
    client, _, cameras, _, _, _, script, _ = env
    script.search_intent = intent(camera_names=["Garage"])
    result = client.post(
        "/api/v1/search",
        headers=OPERATOR,
        json={"query": "garage", "camera_ids": [cameras[0]["id"]]},
    )
    assert result.status_code == 422 and result.json()["error"]["code"] == "CAMERA_FILTER_CONFLICT"
    script.search_intent = intent(unsupported_reason="identity")
    result = client.post("/api/v1/search", headers=OPERATOR, json={"query": "Identify the person"})
    assert result.status_code == 422


def test_job_permissions_consent_and_budget(indexed_env):
    env = indexed_env
    client, database, cameras, settings, recording_id, *_ = env
    payload = {"recording_id": str(recording_id), "allow_cloud_upload": True}
    assert (
        client.post(
            "/api/v1/analysis-jobs",
            headers={**VIEWER, "Idempotency-Key": str(uuid4())},
            json=payload,
        ).status_code
        == 403
    )
    with database.connect() as db:
        db.execute(
            "UPDATE cameras SET cloud_analysis_allowed=false WHERE id=%s", (cameras[0]["id"],)
        )
    result = client.post(
        "/api/v1/analysis-jobs", headers={**OPERATOR, "Idempotency-Key": str(uuid4())}, json=payload
    )
    assert result.status_code == 403 and result.json()["error"]["code"] == "CONSENT_REQUIRED"
    meter = UsageMeter(settings.model_copy(update={"model_daily_requests": 1}), database)
    meter.reserve("search_intent")
    with pytest.raises(Problem) as exc:
        meter.reserve("search_intent")
    assert exc.value.code == "MODEL_BUDGET_EXHAUSTED"


def test_concurrent_queue_and_claim_have_one_owner(indexed_env):
    env = indexed_env
    _, database, _, settings, recording_id, *_ = env

    def queue(_):
        with database.connect() as db:
            return index_store.enqueue(
                db, AnalysisJobCreate(recording_id=recording_id, allow_cloud_upload=True), settings
            )[2]

    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = list(pool.map(queue, range(2)))
    assert jobs[0] == jobs[1]
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(
            pool.map(lambda _: index_store.claim(database, index_store.version(settings)), range(2))
        )
    assert sum(bool(c) for c in claims) == 1


@pytest.mark.parametrize("bad", ["out_of_clip", "refusal", "unsafe", "invalid_json"])
def test_model_failures_never_publish_metadata_and_delete_upload(indexed_env, bad):
    env = indexed_env
    _, database, _, settings, _, _, script, factory = env
    job = enqueue(env)
    if bad == "out_of_clip":
        script.results[0]["observations"][0]["end_ms"] = 999999
    elif bad == "unsafe":
        script.results[0]["observations"][0]["caption"] = "A suspicious criminal."
    else:
        value = response(script.results[0])
        value["output"][0]["content"][0] = (
            {"type": "refusal", "refusal": "No"}
            if bad == "refusal"
            else {"type": "output_text", "text": "not JSON"}
        )
        script.failure = httpx.Response(200, json=value)
    worker = Worker(settings, database, factory)
    if bad == "unsafe":
        # Rejected observations may retry, but never publish, within the existing job budget.
        for _ in range(3):
            script.failure = httpx.Response(200, json=response(script.results[0]))
            assert worker.once()
            with database.connect() as db:
                db.execute("UPDATE analysis_jobs SET next_attempt_at=now()")
    else:
        assert worker.once()
    with database.connect() as db:
        result = index_store.get_job(db, UUID(job["id"]))
        assert result.state == "failed"
        assert db.execute("SELECT count(*) AS n FROM video_metadata").fetchone()["n"] == 0
    assert script.uploads == script.deletes == (3 if bad == "unsafe" else 1)


def test_retry_recovers_checkpoints_and_stops_at_three_attempts(indexed_env):
    env = indexed_env
    _, database, _, settings, _, _, script, factory = env
    job = enqueue(env)
    script.failure = httpx.Response(429, json={"error": "scripted failure"})
    worker = Worker(settings, database, factory)
    assert worker.once()
    with database.connect() as db:
        first = index_store.get_job(db, UUID(job["id"]))
        assert first.state == "queued" and first.attempts == 1
        db.execute("UPDATE analysis_jobs SET next_attempt_at=now()")
    assert worker.once()
    with database.connect() as db:
        result = index_store.get_job(db, UUID(job["id"]))
        assert result.state == "succeeded" and result.attempts == 2
        assert db.execute("SELECT count(*) AS n FROM video_metadata").fetchone()["n"] == 3
    assert script.uploads == script.deletes == 4


def test_expired_worker_is_fenced_and_final_attempt_is_terminal(indexed_env):
    env = indexed_env
    _, database, _, settings, *_ = env
    enqueue(env)
    old = index_store.claim(database, index_store.version(settings))
    with database.connect() as db:
        db.execute("UPDATE analysis_jobs SET lease_expires_at=now()-interval '1 second'")
    replacement = index_store.claim(database, index_store.version(settings))
    assert replacement["attempts"] == 2 and replacement["lease_token"] != old["lease_token"]
    with pytest.raises(Problem) as exc:
        with database.connect() as db:
            index_store.fence(db, old)
    assert exc.value.code == "WORKER_LEASE_LOST"
    with database.connect() as db:
        db.execute("UPDATE analysis_jobs SET attempts=3,lease_expires_at=now()-interval '1 second'")
    assert index_store.claim(database, index_store.version(settings)) is None
    with database.connect() as db:
        assert db.execute("SELECT state FROM analysis_jobs").fetchone()["state"] == "failed"


def test_consent_revoked_after_upload_cancels_inference_and_cleans_file(indexed_env):
    env = indexed_env
    _, database, cameras, settings, _, _, script, factory = env
    job = enqueue(env)

    def revoke():
        with database.connect() as db:
            db.execute(
                "UPDATE cameras SET cloud_analysis_allowed=false WHERE id=%s", (cameras[0]["id"],)
            )

    script.after_upload = revoke
    Worker(settings, database, factory).once()
    with database.connect() as db:
        result = index_store.get_job(db, UUID(job["id"]))
        assert result.state == "cancelled" and result.error.code == "CONSENT_REVOKED"
    assert script.analyzed == 0 and script.deletes == 1


def test_muse_registry_returns_grounded_video_navigation(indexed_env):
    env = indexed_env
    client, _, _, settings, *_ = env
    run_index(env)
    args = structured(objects=[{"category": "bicycle", "attributes": []}]).model_dump(mode="json")
    queue = [
        completion(content=None, calls=[tool_call("video.search", json.dumps(args))]),
        completion(),
    ]
    client.app.state.agent.provider_factory = lambda: MetaClient(
        settings, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=queue.pop(0)))
    )
    result = client.post(
        "/api/v1/agent/messages",
        headers={**OPERATOR, "Idempotency-Key": str(uuid4())},
        json={"message": "Find bicycle footage"},
    )
    assert result.status_code == 200, result.text
    value = result.json()
    assert value["status"] == "completed" and value["actions"][0]["status"] == "succeeded"
    assert value["actions"][0]["navigation"]["target"]["kind"] == "recording"


@pytest.mark.parametrize(
    "changes",
    [
        {"start_ms": -1},
        {"end_ms": 0},
        {"end_ms": 100},
        {"caption": "A woman."},
        {"objects": [{"category": "person", "attributes": ["young"], "evidence": "x"}]},
    ],
)
def test_strict_observation_rejects_unbounded_and_sensitive_fields(changes):
    value = observation(1)
    value["observations"][0].update(changes)
    with pytest.raises((ValidationError, ModelFailure)):
        output_json(response(value), m.VideoAnalysis)


def test_histogram_union_does_not_double_count_overlaps():
    assert (
        retrieval.union_ms(
            [
                (ORIGIN, ORIGIN + timedelta(seconds=5)),
                (ORIGIN + timedelta(seconds=3), ORIGIN + timedelta(seconds=8)),
            ],
            ORIGIN,
            ORIGIN + timedelta(seconds=10),
        )
        == 8000
    )


def test_exact_segment_playback_disambiguates_overlapping_clocks(indexed_env):
    client, database, _, _, recording_id, segment_ids, *_ = indexed_env
    with database.connect() as db:
        db.execute(
            "UPDATE segments SET offset_ms=2000,started_at=%s WHERE id=%s",
            (ORIGIN + timedelta(seconds=2), segment_ids[1]),
        )
    payload = {
        "recording_id": str(recording_id),
        "segment_id": str(segment_ids[1]),
        "offset_ms": 2250,
        "duration_ms": 1000,
    }
    result = client.post("/api/v1/playback-sessions", headers=OPERATOR, json=payload)
    assert result.status_code == 200, result.text
    session = result.json()
    assert session["actual_start_offset_ms"] == 2000 and session["seek_offset_ms"] == 250
    media = client.get(session["url"], headers={**OPERATOR, "Range": "bytes=0-99"})
    assert media.status_code == 206 and len(media.content) == 100
    assert client.get(session["url"], headers=VIEWER).status_code == 404
    payload["segment_id"] = str(segment_ids[2])
    assert (
        client.post("/api/v1/playback-sessions", headers=OPERATOR, json=payload).status_code == 409
    )


def test_changed_source_invalidates_retrieval_without_reanalysis(indexed_env):
    env = indexed_env
    run_index(env)
    path = env[3].recordings_root / "cycling.mp4"
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
    result = retrieve(env, objects=[{"category": "bicycle", "attributes": []}])
    assert len(result.items) == 1 and result.coverage == "partial"
    assert result.available_ms == 11011 and result.analyzed_ms == 7007


def test_retry_does_not_reanalyze_successful_checkpoint(indexed_env):
    env = indexed_env
    _, database, _, settings, _, _, script, _ = env
    enqueue(env)
    original, failed = script.handle, False

    def handler(request):
        nonlocal failed
        if request.url.path == "/v1/responses" and script.analyzed == 1 and not failed:
            failed = True
            return httpx.Response(503, json={"error": "scripted second-segment outage"})
        return original(request)

    def factory():
        return IndexProvider(settings, database, transport=httpx.MockTransport(handler))

    worker = Worker(settings, database, factory)
    worker.once()
    with database.connect() as db:
        assert db.execute("SELECT count(*) AS n FROM video_metadata").fetchone()["n"] == 1
        assert db.execute("SELECT progress FROM analysis_jobs").fetchone()[
            "progress"
        ] == pytest.approx(1 / 3)
        db.execute("UPDATE analysis_jobs SET next_attempt_at=now()")
    worker.once()
    with database.connect() as db:
        assert db.execute("SELECT state FROM analysis_jobs").fetchone()["state"] == "succeeded"
        assert db.execute("SELECT count(*) AS n FROM video_metadata").fetchone()["n"] == 3
    assert script.analyzed == 3 and script.uploads == 4 and script.deletes == 4


def test_grounding_is_also_enforced_by_postgresql(indexed_env):
    env = indexed_env
    run_index(env)
    with pytest.raises(psycopg.errors.CheckViolation):
        with env[1].connect() as db:
            db.execute("UPDATE video_metadata SET observation_end_ms=999999")
    with pytest.raises(psycopg.errors.CheckViolation):
        with env[1].connect() as db:
            db.execute("UPDATE events SET ended_at=ended_at+interval '1 day'")


def test_event_pagination_and_motion_search_use_actual_indexes(indexed_env):
    env = indexed_env
    client, _, cameras, *_ = env
    run_index(env)
    params = {
        "start": ORIGIN.isoformat(),
        "end": (ORIGIN + timedelta(seconds=30)).isoformat(),
        "camera_id": cameras[0]["id"],
        "limit": 1,
    }
    seen = []
    for _ in range(30):
        page = client.get("/api/v1/events", headers=OPERATOR, params=params)
        assert page.status_code == 200, page.text
        value = page.json()
        seen.extend(item["id"] for item in value["items"])
        if not value["next_cursor"]:
            break
        params["cursor"] = value["next_cursor"]
    assert len(seen) == len(set(seen)) and len(seen) >= 2
    motion = retrieve(env, motion_only=True)
    assert motion.items and all(hit.model_id == "ffmpeg_gray_v1" for hit in motion.items)
    assert all(hit.evidence.event_id for hit in motion.items)
    bad = client.get("/api/v1/events", headers=OPERATOR, params={**params, "cursor": "not-valid"})
    assert bad.status_code == 422
    histogram = client.get(
        f"/api/v1/cameras/{cameras[0]['id']}/activity",
        headers=OPERATOR,
        params={k: v for k, v in params.items() if k in {"start", "end"}},
    )
    assert histogram.status_code == 200


def test_cloud_inference_daily_and_concurrency_guards_are_durable(indexed_env):
    env = indexed_env
    settings, database = env[3], env[1]
    meter = UsageMeter(settings, database)
    first = meter.reserve("search_intent")
    second = meter.reserve("video_analysis")
    with pytest.raises(Problem) as exc:
        meter.reserve("search_intent")
    assert exc.value.code == "MODEL_BUSY"
    meter.finish(first, {}, 1, "MODEL_UNAVAILABLE")
    meter.finish(second, {}, 1, "MODEL_UNAVAILABLE")
    constrained = UsageMeter(settings.model_copy(update={"model_daily_budget_usd": 0.02}), database)
    with pytest.raises(Problem) as exc:
        constrained.reserve("search_intent")
    assert exc.value.code == "MODEL_BUDGET_EXHAUSTED"


def test_unindexed_window_and_missing_provider_have_distinct_results(indexed_env):
    env = indexed_env
    result = retrieve(env, objects=[{"category": "bicycle", "attributes": []}])
    assert result.coverage == "none" and not result.items
    assert result.available_ms == 11011 and result.analyzed_ms == 0
    client, database, _, settings, *_ = env
    missing = settings.model_copy(update={"model_api_key": Settings(_env_file=None).model_api_key})
    client.app.state.search = retrieval.SearchService(missing, database)
    response = client.post("/api/v1/search", headers=OPERATOR, json={"query": "bicycle"})
    assert response.status_code == 503 and "items" not in response.json()


def test_frame_sampling_budget_preserves_partial_coverage_and_actual_offsets(indexed_env):
    env = list(indexed_env)
    client, database, _, settings, _, _, script, _ = env
    settings = settings.model_copy(update={"indexing_clip_ms": 1000})
    client.app.state.settings = settings
    env[3] = settings
    for result in script.results:
        result["observations"][0]["end_ms"] = 750

    def factory():
        return IndexProvider(settings, database, transport=httpx.MockTransport(script.handle))

    env[7] = factory
    job, _ = run_index(env)
    assert all(s.analyzed_end_ms - s.analyzed_start_ms == 1000 for s in job.segments)
    result = retrieve(env, objects=[{"category": "bicycle", "attributes": []}])
    assert result.coverage == "partial" and result.analyzed_ms == 3000
    assert result.available_ms == 11011 and result.items
    for hit in result.items:
        assert hit.evidence.start_offset_ms == hit.offset_ms
        assert hit.provenance["clip_end_ms"] - hit.provenance["clip_start_ms"] == 1000


def test_full_text_query_remains_data_not_sql(indexed_env):
    env = indexed_env
    run_index(env)
    assert not retrieve(env, keywords=["'; DROP TABLE cameras; --"]).items
    with env[1].connect() as db:
        assert db.execute("SELECT count(*) AS n FROM cameras").fetchone()["n"] == 4


def test_sampling_configuration_change_retires_unstarted_jobs_and_keeps_history(indexed_env):
    env = indexed_env
    client, database, _, settings, _, _, _, _ = env
    previous = enqueue(env)
    changed = settings.model_copy(update={"indexing_clip_ms": 2000})
    client.app.state.settings = changed
    replacement = enqueue(env)
    assert replacement["id"] != previous["id"]
    with database.connect() as db:
        old = index_store.get_job(db, UUID(previous["id"]))
        assert old.state == "cancelled" and old.error.code == "INDEX_VERSION_CHANGED"
        assert (
            db.execute(
                "SELECT count(*) AS n FROM vms_audit WHERE operation='analysis.version_cancelled'"
            ).fetchone()["n"]
            == 1
        )


@pytest.mark.live_meta
@pytest.mark.skipif(
    os.environ.get("VEYRA_RUN_LIVE_INDEX") != "1",
    reason="Genuine video evaluation requires explicit live acceptance command",
)
def test_genuine_muse_video_evaluation(indexed_env):
    if (
        not LIVE_SETTINGS.model_api_key.get_secret_value()
        or LIVE_SETTINGS.model_daily_budget_usd <= 0
        or LIVE_SETTINGS.model_request_reserve_usd <= 0
    ):
        pytest.skip("MODEL_API_KEY and positive daily/per-request model budgets are required")
    client, database, cameras, settings, recording_id, segment_ids, _, _ = indexed_env
    settings = settings.model_copy(
        update={
            key: getattr(LIVE_SETTINGS, key)
            for key in (
                "model_api_key",
                "meta_model",
                "model_daily_budget_usd",
                "model_request_reserve_usd",
                "model_daily_requests",
                "model_input_usd_per_million",
                "model_output_usd_per_million",
            )
        }
    )
    client.app.state.settings = settings
    client.app.state.search = retrieval.SearchService(settings, database)
    started = time.monotonic()
    job = enqueue(indexed_env)
    worker = Worker(settings, database)
    for _ in range(3):
        worker.once()
        with database.connect() as db:
            result = index_store.get_job(db, UUID(job["id"]))
        if result.state != "queued":
            break
        time.sleep(8)
    measured = {
        "provider": "genuine Meta Muse",
        "recording_id": str(recording_id),
        "indexing_wall_seconds": time.monotonic() - started,
        "job": result.model_dump(mode="json"),
        "queries": [],
        "actual_api_cost_usd": None,
        "labels": "independently reviewed clip-level labels",
    }
    if result.state == "succeeded":
        cases = [
            ("Find footage with a bicycle.", {}, set(segment_ids[1:])),
            ("Show a person wearing a green shirt.", {}, {segment_ids[2]}),
            ("Find cycling events.", {}, set(segment_ids[1:])),
            ("Show a person wearing a red jacket.", {}, set()),
            ("Find footage with a bicycle.", {"camera_ids": [cameras[1]["id"]]}, set()),
            (
                "Find footage with a bicycle.",
                {
                    "start": (ORIGIN + timedelta(minutes=2)).isoformat(),
                    "end": (ORIGIN + timedelta(minutes=3)).isoformat(),
                },
                set(),
            ),
        ]
        for query, filters, expected in cases:
            payload = {
                "query": query,
                "start": ORIGIN.isoformat(),
                "end": (ORIGIN + timedelta(seconds=30)).isoformat(),
                **filters,
            }
            response = client.post("/api/v1/search", headers=OPERATOR, json=payload)
            actual = {UUID(item["segment_id"]) for item in response.json().get("items", [])}
            measured["queries"].append(
                {
                    "query": query,
                    "filters": filters,
                    "expected_segments": sorted(map(str, expected)),
                    "actual_segments": sorted(map(str, actual)),
                    "correct": response.status_code == 200 and actual == expected,
                    "response": response.json(),
                }
            )
    with database.connect() as db:
        measured["usage"] = index_store.usage(db).model_dump(mode="json")
    if os.environ.get("VEYRA_INDEX_EVIDENCE"):
        (Path(os.environ["VEYRA_INDEX_EVIDENCE"]) / "live-evaluation.json").write_text(
            json.dumps(measured, indent=2)
        )
    assert result.state == "succeeded", result.model_dump(mode="json")
    assert all(item["correct"] for item in measured["queries"]), measured["queries"]
