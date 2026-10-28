"""Release regressions using isolated PostgreSQL; all provider responses are scripted."""

# ruff: noqa: F811
import pytest
from psycopg.types.json import Jsonb
from test_agent_integration import (  # noqa: F401
    OPERATOR,
    agent_env,
    call,
    count,
    decide,
    layout_args,
    muse,
    postgres_url,
    propose,
    send,
)
from test_indexing import indexed_env, run_index  # noqa: F401
from test_meta_agent import completion
from test_video01 import MEDIA
from test_video02 import usage, window


def test_unknown_recordings_are_preserved_but_excluded_from_curated_results(indexed_env):
    client, database, _, _, recording_id, *_ = indexed_env
    run_index(indexed_env)
    before = usage(client)
    response = client.post(
        "/api/v1/index-query", headers=OPERATOR, json={**window(), "curated_only": True}
    ).json()
    assert response["items"] == [] and response["available_ms"] == 0
    assert client.get(f"/api/v1/recordings/{recording_id}", headers=OPERATOR).status_code == 200
    # This is explicitly a test provenance fixture, never an attribution repair of real media.
    with database.connect() as db:
        db.execute(
            "UPDATE recordings SET source_media=%s WHERE id=%s", (Jsonb(MEDIA), recording_id)
        )
    response = client.post(
        "/api/v1/index-query", headers=OPERATOR, json={**window(), "curated_only": True}
    ).json()
    assert response["items"] and response["available_ms"] > 0
    coverage = client.get("/api/v1/index-coverage?curated_only=true", headers=OPERATOR).json()
    assert sum(c["observations"] for c in coverage["items"]) == 3
    assert usage(client) == before


def test_events_are_descending_stable_and_cursor_is_filter_bound(indexed_env):
    client, *_ = indexed_env
    run_index(indexed_env)
    cursor, items = None, []
    for _ in range(100):
        params = {**window(), "limit": 1}
        if cursor:
            params["cursor"] = cursor
        response = client.get("/api/v1/events", headers=OPERATOR, params=params)
        assert response.status_code == 200, response.text
        page = response.json()
        items.extend(page["items"])
        cursor = page["next_cursor"]
        if cursor:
            invalid = client.get(
                "/api/v1/events",
                headers=OPERATOR,
                params={**params, "cursor": cursor, "kind": "motion"},
            )
            assert invalid.status_code == 422
        else:
            break
    all_items = client.get(
        "/api/v1/events", headers=OPERATOR, params={**window(), "limit": 100}
    ).json()["items"]
    assert len(items) > 1
    assert [i["id"] for i in items] == [i["id"] for i in all_items]
    keys = [(i["started_at"], i["id"]) for i in items]
    assert keys == sorted(keys, reverse=True)
    assert len(items) == len({i["id"] for i in items})


def test_activity_batch_matches_existing_histograms(indexed_env):
    client, _, cameras, *_ = indexed_env
    run_index(indexed_env)
    ids = [c["id"] for c in cameras[:2]]
    response = client.post(
        "/api/v1/activity-query",
        headers=OPERATOR,
        json={**window(), "camera_ids": ids, "bucket_seconds": 10},
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["items"]) == 2
    for histogram in response.json()["items"]:
        direct = client.get(
            f"/api/v1/cameras/{histogram['camera_id']}/activity",
            headers=OPERATOR,
            params={**window(), "bucket_seconds": 10},
        )
        assert direct.json() == histogram
    assert (
        client.post("/api/v1/activity-query", json={**window(), "camera_ids": ids}).status_code
        == 401
    )


def test_usage_exposes_admission_capacity_without_claiming_billing(indexed_env):
    client, *_ = indexed_env
    run_index(indexed_env)
    summary = client.get("/api/v1/analysis-usage", headers=OPERATOR).json()
    assert summary["billing"] == "unknown" and summary["billing_updated_at"] is None
    assert summary["daily_limit_usd"] == 2.0 and summary["observed_at"]
    assert summary["admission_used_usd"] >= summary["reserved_usd"]
    assert summary["admission_remaining_usd"] == pytest.approx(2 - summary["admission_used_usd"])
    assert (
        0 <= summary["remaining_requests"] <= summary["daily_request_limit"] - summary["requests"]
    )


def test_layout_receipts_have_one_persisted_lifecycle(agent_env):
    client, _, _ = agent_env
    proposal = propose(client)
    assert proposal["interaction_state"] == "awaiting_confirmation"
    assert count(agent_env[1]) == 0
    result = decide(client, proposal).json()
    assert result["interaction_state"] == "completed_verified"
    assert result["confirmation_request"] is None
    assert (
        result["verified_results"][0]["layout"]
        == client.get(
            "/api/v1/layouts/" + result["verified_results"][0]["resource_id"], headers=OPERATOR
        ).json()
    )
    second = propose(client)
    rejected = decide(client, second, False).json()
    assert rejected["interaction_state"] == "rejected"
    assert count(agent_env[1]) == 1


def test_vague_layout_request_explains_next_step_with_actual_choices(agent_env):
    client, database, cameras = agent_env
    muse(client, call("cameras.list"), completion())
    result = send(client, "Create a view with my cameras.").json()
    assert result["interaction_state"] == "clarification_required"
    assert result["clarification"] and "Choose" in result["message"]
    assert [item["id"] for item in result["camera_candidates"]] == [item["id"] for item in cameras]
    assert count(database) == 0 and result["confirmation_request"] is None


def test_provider_cannot_choose_arbitrary_cameras_for_a_vague_request(agent_env):
    client, database, _ = agent_env
    muse(client, call("layouts.create", layout_args()), completion())
    result = send(client, "Create a view with my cameras.").json()
    assert result["interaction_state"] == "failed"
    assert result["errors"][0]["code"] == "CAMERA_SELECTION_REQUIRED"
    assert not result["confirmation_request"] and count(database) == 0


def test_free_refinement_preserves_objects_apparel_and_original_scope(indexed_env):
    client, _, cameras, *_ = indexed_env
    run_index(indexed_env)
    before = usage(client)
    reading = {
        "camera_names": [],
        "camera_ids": [cameras[0]["id"]],
        **window(),
        "objects": [
            {
                "category": "person",
                "attributes": [],
                "apparel": [{"kind": "shirt", "colors": ["green"]}],
            }
        ],
        "event_types": [],
        "keywords": [],
        "motion_only": False,
        "unsupported_reason": None,
        "limit": 20,
    }
    response = client.post(
        "/api/v1/index-query", headers=OPERATOR, json={**window(), "interpretation": reading}
    )
    assert response.status_code == 200, response.text
    assert response.json()["constraints"]["objects"] == reading["objects"]
    assert response.json()["items"]
    for hit in response.json()["items"]:
        assert any(
            obj["category"] == "person" and {"kind": "shirt", "colors": ["green"]} in obj["apparel"]
            for obj in hit["objects"]
        )
    conflict = client.post(
        "/api/v1/index-query",
        headers=OPERATOR,
        json={**window(), "camera_ids": [cameras[1]["id"]], "interpretation": reading},
    )
    assert conflict.status_code == 422
    assert conflict.json()["error"]["code"] == "CAMERA_FILTER_CONFLICT"
    assert usage(client) == before
