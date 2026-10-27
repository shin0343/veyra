"""VIDEO-02 model-free evidence browsing: index filters, coverage and video-derived frames."""

# ruff: noqa: F811 -- imported pytest fixtures share the existing isolated database.
from datetime import timedelta

from test_agent_integration import agent_env, postgres_url  # noqa: F401
from test_indexing import OPERATOR, ORIGIN, VIEWER, indexed_env, run_index  # noqa: F401


def usage(client):
    return client.get("/api/v1/analysis-usage", headers=OPERATOR).json()["requests"]


def window(**extra):
    return {
        "start": ORIGIN.isoformat(),
        "end": (ORIGIN + timedelta(seconds=30)).isoformat(),
        **extra,
    }


def test_index_query_filters_stored_observations_without_model_calls(indexed_env):
    client, _, cameras, _, recording_id, segment_ids, script, _ = indexed_env
    run_index(indexed_env)
    requests, uploads = usage(client), script.uploads
    bikes = client.post(
        "/api/v1/index-query", headers=VIEWER, json=window(categories=["bicycle"])
    ).json()
    assert len(bikes["items"]) == 2 and bikes["coverage"] == "complete"
    for hit in bikes["items"]:
        assert hit["recording_id"] == str(recording_id)
        assert hit["segment_id"] in [str(s) for s in segment_ids]
        assert any(obj["category"] == "bicycle" for obj in hit["objects"])
        assert hit["action"]["target"]["segment_id"] == hit["segment_id"]
    everything = client.post("/api/v1/index-query", headers=VIEWER, json=window()).json()
    assert len(everything["items"]) >= len(bikes["items"])
    none = client.post(
        "/api/v1/index-query", headers=VIEWER, json=window(categories=["dog"])
    ).json()
    assert none["items"] == [] and none["coverage"] == "complete"
    other = client.post(
        "/api/v1/index-query",
        headers=VIEWER,
        json=window(categories=["bicycle"], camera_ids=[cameras[1]["id"]]),
    ).json()
    assert other["items"] == [] and other["coverage"] == "none"
    assert usage(client) == requests and script.uploads == uploads, "No model call or upload."


def test_index_query_rejects_unbounded_or_free_text_input(indexed_env):
    client, *_ = indexed_env
    for body in (
        {"query": "bicycle"},
        {"keywords": ["bike; DROP TABLE"]},
        {"categories": ["unicorn"]},
        {"limit": 51},
        window(start=(ORIGIN - timedelta(days=2)).isoformat()),
    ):
        response = client.post("/api/v1/index-query", headers=OPERATOR, json=body)
        assert response.status_code == 422, body
    assert client.post("/api/v1/index-query", json={}).status_code == 401


def test_index_coverage_reports_actual_indexed_segments(indexed_env):
    client, _, cameras, *_ = indexed_env
    before = client.get("/api/v1/index-coverage", headers=VIEWER).json()
    first = next(i for i in before["items"] if i["camera_id"] == cameras[0]["id"])
    assert first["segments"] == 3 and first["indexed_segments"] == 0
    assert first["observations"] == 0 and first["available_ms"] == 11011
    run_index(indexed_env)
    requests = usage(client)
    after = client.get("/api/v1/index-coverage", headers=VIEWER).json()
    first = next(i for i in after["items"] if i["camera_id"] == cameras[0]["id"])
    assert first["indexed_segments"] == 3 and first["observations"] > 0
    assert first["analyzed_ms"] > 0 and first["last_observation_at"]
    assert sum(first["event_types"].values()) >= first["observations"] - 1
    assert first["categories"].get("bicycle") == 2
    assert usage(client) == requests


def test_frame_is_decoded_from_the_referenced_segment_and_cached(indexed_env):
    client, _, _, settings, recording_id, segment_ids, *_ = indexed_env
    path = f"/api/v1/recordings/{recording_id}/frame"
    response = client.get(path, headers=VIEWER, params={"offset_ms": 1200})
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content[:3] == b"\xff\xd8\xff"
    cache = settings.playback_cache_root / "frames"
    files = sorted(cache.glob("*.jpg"))
    assert len(files) == 1
    # Quantized repeat reuses the decoded frame instead of running FFmpeg again.
    assert client.get(path, headers=VIEWER, params={"offset_ms": 1100}).status_code == 200
    assert sorted(cache.glob("*.jpg")) == files
    exact = client.get(
        path, headers=VIEWER, params={"offset_ms": 1200, "segment_id": str(segment_ids[0])}
    )
    assert exact.status_code == 200
    wrong = client.get(
        path, headers=VIEWER, params={"offset_ms": 1200, "segment_id": str(segment_ids[2])}
    )
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "MEDIA_GAP"
    gap = client.get(path, headers=VIEWER, params={"offset_ms": 999_999})
    assert gap.status_code == 409
    assert client.get(path, params={"offset_ms": 0}).status_code == 401
    missing = client.get(
        "/api/v1/recordings/00000000-0000-4000-8000-000000000000/frame",
        headers=VIEWER,
        params={"offset_ms": 0},
    )
    assert missing.status_code == 404
    assert all(".." not in p.name and p.parent == cache for p in cache.iterdir())
