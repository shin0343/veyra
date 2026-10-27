from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from veyra.contracts import LayoutCreate, SearchRequest
from veyra.main import app
from veyra.source_policy import validate_rtsp_source


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "")
    monkeypatch.setenv("VEYRA_DEV_TOKEN", "test-local-token-12345")
    monkeypatch.setenv("VEYRA_VIEWER_TOKEN", "test-viewer-token-12345")
    monkeypatch.setenv("MEDIA_WORKER_ENABLED", "false")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost:1/unavailable")
    monkeypatch.setenv("CAMERA_SOURCES_JSON", "{}")
    with TestClient(app) as client:
        yield client


def test_authentication_does_not_trust_client_identity(client):
    response = client.get("/api/v1/agent/capabilities", headers={"X-User-ID": "admin"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    response = client.get(
        "/api/v1/agent/capabilities", headers={"Authorization": "Bearer test-local-token-12345"}
    )
    assert response.status_code == 200
    assert all(
        "url" not in c["input_schema"].get("properties", {}) for c in response.json()["items"]
    )


def test_unavailable_agent_storage_never_claims_success(client):
    response = client.post(
        "/api/v1/agent/messages",
        headers={
            "Authorization": "Bearer test-local-token-12345",
            "Idempotency-Key": "test-layout-1",
        },
        json={"message": "Create a layout"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "id" not in response.json()


def test_validation_does_not_echo_secret_input(client):
    response = client.post(
        "/api/v1/cameras",
        headers={
            "Authorization": "Bearer test-local-token-12345",
            "Idempotency-Key": "test-camera-1",
        },
        json={"name": "x", "source_id": "rtsp://user:secret@127.0.0.1/"},
    )
    assert response.status_code == 422
    assert "secret" not in response.text


@pytest.mark.parametrize(
    "source",
    [
        "http://192.168.1.10/",
        "file:///etc/passwd",
        "rtsp://localhost/stream",
        "rtsp://example.com/stream",
        "rtsp://127.0.0.1/stream",
        "rtsp://169.254.169.254/metadata",
        "rtsp://100.100.100.200/metadata",
        "rtsp://168.63.129.16/metadata",
        "rtsp://[::1]/stream",
        "rtsp://[::ffff:192.168.1.10]/stream",
        "rtsp://224.0.0.1/stream",
        "rtsp://0.0.0.0/stream",
        "rtsp://192.168.1.11/stream",
        "rtsp://192.168.1.10/stream?next=http://evil.test",
        "rtsp://192.168.1.10/stream\n",
    ],
)
def test_camera_source_admission_is_fail_closed(source):
    with pytest.raises(ValueError):
        validate_rtsp_source(source, ["192.168.1.10/32"])


def test_explicit_lan_source_is_accepted_without_dns():
    source = "rtsp://192.168.1.10:554/stream"
    assert validate_rtsp_source(source, ["192.168.1.10/32"]) == source
    with pytest.raises(ValueError):
        validate_rtsp_source(source, [])


def test_duplicate_layout_cells_are_rejected():
    camera = str(uuid4())
    with pytest.raises(ValidationError):
        LayoutCreate(
            name="Bad",
            columns=2,
            cells=[{"position": 0, "camera_id": camera}, {"position": 1, "camera_id": camera}],
        )


def test_search_requires_aware_ordered_times():
    with pytest.raises(ValidationError):
        SearchRequest(query="door", start="2026-10-26T12:00:00")
    with pytest.raises(ValidationError):
        SearchRequest(query="door", start="2026-10-26T13:00:00Z", end="2026-10-26T12:00:00Z")
