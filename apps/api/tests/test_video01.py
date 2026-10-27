"""VIDEO-01 data preservation/budget boundaries; provider HTTP is scripted only here."""

# ruff: noqa: F811 -- imported pytest fixtures share the existing isolated database.
import hashlib
import json
from uuid import UUID, uuid4

import pytest
from psycopg.types.json import Jsonb
from test_agent_integration import agent_env, postgres_url  # noqa: F401
from test_indexing import OPERATOR, indexed_env  # noqa: F401
from veyra import index_store
from veyra.config import Settings, SourceRegistry
from veyra.contracts import AnalysisJobCreate as LegacyAnalysisJobCreate
from veyra.index_worker import Worker
from veyra.media_client import MediaClient

MEDIA = {
    "kind": "prerecorded",
    "asset_id": "licensed-test",
    "title": "Licensed test video",
    "creator": "Test author",
    "license": "CC BY 3.0",
    "changes": "Test fixture only.",
    "source_url": "https://commons.wikimedia.org/wiki/File:Dirt_jump_biking.webm",
    "license_url": "https://creativecommons.org/licenses/by/3.0/",
    "sha256": "a" * 64,
}


def test_old_analysis_idempotency_key_survives_optional_cap_upgrade(indexed_env):
    client, database, _, settings, recording_id, *_ = indexed_env
    body = {"recording_id": str(recording_id), "allow_cloud_upload": True}
    key = str(uuid4())
    legacy = LegacyAnalysisJobCreate.model_validate(body)
    status, snapshot = database.mutate(
        "local-operator",
        "createAnalysisJob",
        key,
        body,
        lambda db: index_store.enqueue(db, legacy, settings),
    )
    response = client.post(
        "/api/v1/analysis-jobs", headers={**OPERATOR, "Idempotency-Key": key}, json=body
    )
    assert response.status_code == status == 202
    assert response.json() == snapshot


def test_small_job_keeps_other_segments_waiting_and_replay_does_not_upload(indexed_env):
    client, database, _, settings, recording_id, _, script, factory = indexed_env
    body = {"recording_id": str(recording_id), "allow_cloud_upload": True, "max_segments": 1}
    headers = {**OPERATOR, "Idempotency-Key": str(uuid4())}
    initial = client.post("/api/v1/analysis-jobs", headers=headers, json=body)
    assert initial.status_code == 202
    job = initial.json()
    assert job["selected_segments"] == 1 and job["selected_duration_ms"] == 3003
    assert Worker(settings, database, factory).once()
    assert script.uploads == script.deletes == 1
    states = client.get(f"/api/v1/recordings/{recording_id}/index", headers=OPERATOR).json()
    assert [item["state"] for item in states["items"]] == ["succeeded", "waiting", "waiting"]
    replay = client.post("/api/v1/analysis-jobs", headers=headers, json=body)
    assert replay.json() == job
    assert not Worker(settings, database, factory).once()
    assert script.uploads == 1


@pytest.mark.parametrize("cap", [0, 31, True, "1"])
def test_invalid_incremental_job_cap_never_queues(indexed_env, cap):
    client, database, _, _, recording_id, _, script, _ = indexed_env
    response = client.post(
        "/api/v1/analysis-jobs",
        headers={**OPERATOR, "Idempotency-Key": str(uuid4())},
        json={"recording_id": str(recording_id), "allow_cloud_upload": True, "max_segments": cap},
    )
    assert response.status_code == 422
    assert script.uploads == 0
    with database.connect() as db:
        assert db.execute("SELECT count(*) AS n FROM analysis_jobs").fetchone()["n"] == 0


def test_reconciler_preserves_historical_provenance_and_stops_replay_recording(indexed_env):
    client, database, cameras, _, recording_id, *_ = indexed_env
    pipeline = client.app.state.pipeline
    source = {
        "mode": "publisher",
        "path": "fixture",
        "source_media": MEDIA,
        "demo_duration_ms": 30000,
    }

    class Registry:
        def get(self, source_id):
            return dict(source)

    class Media:
        def __init__(self):
            self.configurations = []

        def paths(self):
            return {"fixture": {"ready": True, "tracks": ["H264"]}}

        def configure(self, path, config, registry):
            self.configurations.append((path, config["record"]))

    media = Media()
    pipeline.registry, pipeline.media = Registry(), media
    pipeline.once()
    # Binding a new film cannot change the provenance of an existing recording.
    original = client.get(f"/api/v1/recordings/{recording_id}", headers=OPERATOR).json()
    assert original["source_media"] is None
    current = client.get(f"/api/v1/cameras/{cameras[0]['id']}", headers=OPERATOR).json()
    assert current["source_media"] == MEDIA
    with database.connect() as db:
        db.execute(
            "UPDATE recordings SET source_media=%s WHERE id=%s",
            (Jsonb(MEDIA), UUID(str(recording_id))),
        )
    media.configurations.clear()
    pipeline.once()
    assert media.configurations[0][1] is False
    assert (
        client.get(f"/api/v1/recordings/{recording_id}", headers=OPERATOR).json()["status"]
        == "ready"
    )


def test_media_configuration_never_reenables_a_completed_demo_recording():
    client = MediaClient(Settings(_env_file=None))
    calls = []

    def api(method, path, body=None):
        calls.append((method, path, body))
        return {"source": "publisher", "record": False}

    client.api = api
    try:
        client.configure("demo_scene", {"mode": "publisher", "record": False}, None)
        assert len(calls) == 1 and calls[0][0] == "GET"
    finally:
        client.close()


@pytest.mark.parametrize("tamper", ["hash", "path", "duplicate-path"])
def test_demo_asset_admission_rejects_tampered_bytes_paths_and_aliases(tmp_path, tamper):
    (tmp_path / "scene.mp4").write_bytes(b"reviewed-test-video")
    (tmp_path / "poster.jpg").write_bytes(b"reviewed-test-poster")
    media = {**MEDIA, "sha256": hashlib.sha256(b"reviewed-test-video").hexdigest()}
    asset = {
        "source_id": "demo_scene",
        "media_path": "demo_scene",
        "camera_name": "Scene",
        "file": "scene.mp4",
        "poster": "poster.jpg",
        "duration_ms": 30000,
        "poster_sha256": hashlib.sha256(b"reviewed-test-poster").hexdigest(),
        "media": media,
    }
    if tamper == "hash":
        (tmp_path / "scene.mp4").write_bytes(b"different-video")
    elif tamper == "path":
        asset["file"] = "../outside.mp4"
    assets = [asset]
    if tamper == "duplicate-path":
        assets.append({**asset, "source_id": "other_scene"})
    path = tmp_path / "library.json"
    path.write_text(json.dumps({"assets": assets}))
    with pytest.raises(ValueError, match="values are redacted"):
        SourceRegistry(Settings(_env_file=None, demo_library_path=path, demo_assets_root=tmp_path))


def test_thumbnail_missing_and_authorization_are_explicit(agent_env):
    client, _, cameras = agent_env
    path = f"/api/v1/cameras/{cameras[0]['id']}/thumbnail"
    assert client.get(path).status_code == 401
    missing = client.get(path, headers=OPERATOR)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "THUMBNAIL_UNAVAILABLE"
