"""Failure/security boundaries; real service integration is scripts/vms_acceptance.py."""

import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from veyra.config import Settings, SourceRegistry
from veyra.db import Problem
from veyra.main import app
from veyra.media_client import safe_file, validate_range
from veyra.models import CameraCreate, CameraUpdate
from veyra.sessions import Sessions
from veyra.store import camera_model

ROOT = Path(__file__).resolve().parents[3]


def load_media_module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "services/media" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("VEYRA_DEV_TOKEN", "test-operator-12345")
    monkeypatch.setenv("VEYRA_VIEWER_TOKEN", "test-viewer-12345")
    monkeypatch.setenv("MEDIA_WORKER_ENABLED", "false")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost:1/unavailable")
    monkeypatch.setenv("CAMERA_SOURCES_JSON", "{}")
    with TestClient(app) as client:
        yield client


def test_readonly_principal_cannot_mutate_without_touching_database(client):
    response = client.post(
        "/api/v1/cameras",
        headers={"Authorization": "Bearer test-viewer-12345", "Idempotency-Key": "readonly-test-1"},
        json={"name": "Camera", "source_id": "sample"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_database_failure_is_typed_and_does_not_expose_connection(client):
    response = client.get(
        "/api/v1/cameras", headers={"Authorization": "Bearer test-operator-12345"}
    )
    assert response.status_code == 503
    assert response.json()["error"]["retryable"] is True
    assert "localhost" not in response.text and "postgresql" not in response.text
    assert response.headers["x-request-id"] == response.json()["request_id"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"enabled": None},
        {"name": "  "},
        {"name": None},
        {"location": " "},
        {"source_id": "other"},
    ],
)
def test_empty_null_and_unsupported_camera_updates_rejected(payload):
    with pytest.raises(ValidationError):
        CameraUpdate(**payload)


def test_camera_names_are_normalized_and_location_can_be_cleared():
    assert CameraCreate(name="  Entrance  ", source_id="a").name == "Entrance"
    assert CameraUpdate(location=None).model_dump(exclude_unset=True) == {"location": None}


@pytest.mark.parametrize(
    "uri",
    [
        "rtsp://127.0.0.1/live",
        "rtsp://169.254.169.254/live",
        "rtsp://example.com/live",
        "rtsp://192.168.1.5:80/live",
    ],
)
def test_registry_blocks_forbidden_destinations_and_ports(uri):
    with pytest.raises(ValueError, match="values are redacted"):
        SourceRegistry(
            Settings(
                _env_file=None,
                camera_sources_json=json.dumps({"entry": {"mode": "pull", "url": uri}}),
                camera_allowed_cidrs="192.168.1.5/32",
            )
        )


def test_source_credentials_never_appear_in_public_registry_and_pull_requires_guard(tmp_path):
    registry = SourceRegistry(
        Settings(
            _env_file=None,
            camera_sources_json=json.dumps(
                {
                    "entry": {
                        "mode": "pull",
                        "url": "rtsp://user:private-camera-password@192.168.1.5/live",
                    }
                }
            ),
            camera_allowed_cidrs="192.168.1.5/32",
            media_egress_guard_file=tmp_path / "policy.json",
        )
    )
    assert registry.public() == [{"id": "entry", "mode": "pull"}]
    assert not registry.pull_guarded()
    (tmp_path / "policy.json").write_text(
        json.dumps({"policy": "deny-other-new-connections", "targets": [["192.168.1.6", 554]]})
    )
    assert not registry.pull_guarded()
    (tmp_path / "policy.json").write_text(
        json.dumps({"policy": "deny-other-new-connections", "targets": [["192.168.1.5", 554]]})
    )
    assert registry.pull_guarded()


@pytest.mark.parametrize(
    "uri",
    [
        "http://evil.test/clip.mp4",
        "//evil.test/a.mp4",
        "../a.mp4",
        "a.mp4?redirect=x",
        "a.mp4#fragment",
        "/a.mp4",
        "file:///a.mp4",
    ],
)
def test_manifest_cannot_escape_fixed_media_origin(uri):
    with pytest.raises(Problem) as error:
        Sessions.rewrite_manifest(f"#EXTM3U\n{uri}\n".encode(), uuid4(), {})
    assert error.value.code == "INVALID_MEDIA"


def test_manifest_rewrites_leaf_and_quoted_uri_to_opaque_session_paths():
    session = uuid4()
    resources = {"index.m3u8": "index.m3u8"}
    manifest = b'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1\nsegment.mp4\n'
    result = Sessions.rewrite_manifest(manifest, session, resources).decode()
    assert "init.mp4" not in result and "segment.mp4" not in result
    assert result.count(f"/api/v1/media/sessions/{session}/") == 2
    assert set(resources.values()) == {"index.m3u8", "init.mp4", "segment.mp4"}


@pytest.mark.parametrize(
    "header",
    [
        "bytes=100-",
        "bytes=9-2",
        "bytes=-0",
        "bytes=-",
        "bytes=0-1,4-5",
        "other=0-5",
        "bytes=word-5",
    ],
)
def test_invalid_range_rejected_before_file_response(header):
    with pytest.raises(Problem) as error:
        validate_range(header, 100)
    assert error.value.status == 416


@pytest.mark.parametrize("header", [None, "bytes=0-99", "bytes=0-", "bytes=-10", "bytes=90-999"])
def test_valid_range_and_suffix_are_supported(header):
    validate_range(header, 100)


def test_file_traversal_and_symlink_are_rejected(tmp_path):
    root = tmp_path / "recordings"
    root.mkdir()
    outside = tmp_path / "private.mp4"
    outside.write_bytes(b"private")
    (root / "linked.mp4").symlink_to(outside)
    for key in ["../private.mp4", str(outside), "linked.mp4", "absent.mp4"]:
        with pytest.raises(Problem):
            safe_file(root, key)
    (root / "okay.mp4").write_bytes(b"video")
    assert safe_file(root, "okay.mp4") == root / "okay.mp4"


def test_stale_observation_cannot_claim_online():
    row = dict(
        id=uuid4(),
        name="Camera",
        source_id="sample",
        enabled=True,
        cloud_analysis_allowed=False,
        status="online",
        connection_error_code=None,
        last_observed_at=datetime.now(timezone.utc) - timedelta(seconds=30),
        created_at=datetime.now(timezone.utc),
        group_name=None,
        location=None,
    )
    assert camera_model(row).status == "unknown"


def test_completion_hook_writes_actual_utc_marker_and_rejects_escape(tmp_path, monkeypatch):
    module = load_media_module("finalize")
    root = tmp_path / "recordings"
    directory = root / "fixture"
    directory.mkdir(parents=True)
    filename = "2026-10-26_12-00-00-123456_+0000.mp4"
    video = directory / filename
    video.write_bytes(b"fixture for path validation, not playback")
    monkeypatch.setenv("RECORDINGS_ROOT", str(root))
    monkeypatch.setenv("MTX_SEGMENT_PATH", str(video))
    monkeypatch.setenv("MTX_PATH", "fixture")
    module.finalize()
    marker = json.loads(video.with_suffix(".done.json").read_text())
    assert marker["started_at"] == "2026-10-26T12:00:00.123456+00:00"
    assert marker["storage_key"] == f"fixture/{filename}"
    outside = tmp_path / filename
    outside.write_bytes(b"private")
    monkeypatch.setenv("MTX_SEGMENT_PATH", str(outside))
    with pytest.raises(ValueError):
        module.finalize()


def test_egress_rules_deny_new_connections_except_exact_approved_targets():
    module = load_media_module("egress_guard")
    commands = []
    module.install([("192.168.1.5", 554)], run=lambda args, **kwargs: commands.append(args))
    assert commands[0] == ["iptables", "-w", "-P", "OUTPUT", "DROP"]
    assert ["ip6tables", "-w", "-P", "OUTPUT", "DROP"] in commands
    allowed = [c for c in commands if "--dport" in c]
    assert len(allowed) == 1
    assert allowed[0][allowed[0].index("-d") + 1] == "192.168.1.5"
    assert allowed[0][allowed[0].index("--dport") + 1] == "554"
    # This verifies command generation only; it does not claim a Linux firewall ran on macOS.
