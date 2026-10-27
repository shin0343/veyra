"""Real Phase 03 acceptance: PostgreSQL + MediaMTX + FFmpeg + HTTP + Chromium.

No mocked services. Always stops owned processes; retains private local video/log evidence.
"""

import argparse
import json
import signal
import subprocess
from datetime import datetime, timezone
from uuid import uuid4

import psycopg
from seed_vms import seed
from vms_native import ROOT, NativeStack, wait_for


def expect(response, status, code=None):
    assert response.status_code == status, (response.status_code, response.text[:500])
    if code:
        assert response.json()["error"]["code"] == code, response.text
    return (
        response.json()
        if response.content and "json" in response.headers.get("content-type", "")
        else response
    )


def run(stack, report, browser=True):
    client = stack.http
    expect(client.get("/api/v1/cameras", headers={"Authorization": "Bearer invalid"}), 401)
    expect(
        client.post(
            "/api/v1/cameras",
            headers={
                "Authorization": f"Bearer {stack.viewer}",
                "Idempotency-Key": "viewer-mutation-1",
            },
            json={"name": "Forbidden", "source_id": "sample"},
        ),
        403,
        "FORBIDDEN",
    )
    expect(
        client.post(
            "/api/v1/cameras",
            headers={"Idempotency-Key": "unknown-source-1"},
            json={"name": "Unknown", "source_id": "unapproved"},
        ),
        422,
        "SOURCE_NOT_APPROVED",
    )
    cameras = seed(client)
    ids = [camera["id"] for camera in cameras]
    assert len(ids) == 4
    assert [c["id"] for c in seed(client)] == ids
    expect(
        client.post(
            "/api/v1/cameras",
            headers={"Idempotency-Key": "seed-sample-v1"},
            json={"name": "Different", "source_id": "sample"},
        ),
        409,
        "IDEMPOTENCY_CONFLICT",
    )
    offline = wait_for(
        lambda: next(
            (
                c
                for c in client.get("/api/v1/cameras").json()["items"]
                if c["id"] == ids[0] and c["status"] == "offline"
            ),
            None,
        )
    )
    assert offline["connection_error"]["code"] == "SOURCE_OFFLINE"
    expect(client.post(f"/api/v1/cameras/{ids[0]}/live-session"), 503, "SOURCE_OFFLINE")
    report["offline_camera"] = True
    print("PASS camera registration, idempotency, authorization, disconnected stream", flush=True)

    for index in range(4):
        stack.sample(index)
    wait_for(
        lambda: all(c["status"] == "online" for c in client.get("/api/v1/cameras").json()["items"]),
        40,
    )
    report["registered_camera_ids"] = ids
    report["online_cameras"] = 4
    live = expect(client.post(f"/api/v1/cameras/{ids[0]}/live-session"), 200)
    manifest = expect(client.get(live["url"]), 200).text
    assert "#EXTM3U" in manifest and stack.hls_secret not in manifest and "http://" not in manifest
    assert "/api/v1/media/sessions/" in manifest
    expect(client.get(live["url"], headers={"Authorization": f"Bearer {stack.viewer}"}), 404)
    expect(client.get(live["url"], headers={"Authorization": "Bearer invalid"}), 401)
    report["authenticated_hls"] = True

    body = {
        "name": "Actual four-camera view",
        "columns": 2,
        "cells": [{"position": i, "camera_id": camera_id} for i, camera_id in enumerate(ids)],
    }
    headers = {"Idempotency-Key": "acceptance-layout-1"}
    layout = expect(client.post("/api/v1/layouts", headers=headers, json=body), 201)
    assert (
        expect(client.post("/api/v1/layouts", headers=headers, json=body), 201)["id"]
        == layout["id"]
    )
    assert expect(client.get(f"/api/v1/layouts/{layout['id']}"), 200)["cells"] == body["cells"]
    expect(
        client.post(
            "/api/v1/layouts",
            headers={"Idempotency-Key": "missing-camera-1"},
            json={**body, "cells": [{"position": 0, "camera_id": str(uuid4())}]},
        ),
        404,
    )
    expect(
        client.put(
            f"/api/v1/layouts/{layout['id']}",
            headers={"Idempotency-Key": "layout-version-1"},
            json={**body, "expected_version": 999},
        ),
        409,
        "VERSION_CONFLICT",
    )
    expect(
        client.delete(f"/api/v1/cameras/{ids[0]}", headers={"Idempotency-Key": "in-use-camera-1"}),
        409,
        "CAMERA_IN_USE",
    )
    report["layout_id"] = layout["id"]
    report["persisted_2x2_layout"] = True
    print("PASS live HLS authorization and persisted 2×2 layout", flush=True)

    recording = wait_for(
        lambda: next(
            (
                r
                for r in client.get("/api/v1/recordings", params={"camera_id": ids[0]}).json()[
                    "items"
                ]
                if r["available_duration_ms"] >= 60000
            ),
            None,
        ),
        90,
    )
    segments = expect(client.get(f"/api/v1/recordings/{recording['id']}/segments"), 200)["items"]
    assert segments and all(s["status"] == "ready" for s in segments)
    playback_body = {"recording_id": recording["id"], "offset_ms": 52000, "duration_ms": 6000}
    playback = expect(client.post("/api/v1/playback-sessions", json=playback_body), 200)
    assert playback["actual_start_offset_ms"] + playback["seek_offset_ms"] == 52000
    assert playback["actual_start_offset_ms"] > 0
    partial = expect(client.get(playback["url"], headers={"Range": "bytes=0-1023"}), 206)
    assert len(partial.content) == 1024 and partial.headers["content-range"].startswith(
        "bytes 0-1023/"
    )
    expect(
        client.get(playback["url"], headers={"Range": "bytes=999999999999-"}), 416, "INVALID_RANGE"
    )
    expect(client.get(playback["url"], headers={"Range": "bytes=0-1,4-5"}), 416, "INVALID_RANGE")
    video = stack.runtime / "downloaded-playback.mp4"
    video.write_bytes(expect(client.get(playback["url"]), 200).content)
    metadata = json.loads(
        stack.command(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)]
        ).stdout
    )
    assert metadata["streams"][0]["codec_name"] == "h264"
    assert float(metadata["format"]["duration"]) > 2
    expect(
        client.post("/api/v1/playback-sessions", json={**playback_body, "offset_ms": 999999999}),
        409,
        "MEDIA_GAP",
    )
    expect(client.get("/api/v1/recordings", params={"cursor": "bad"}), 422)
    report.update(
        recording_id=recording["id"],
        recording_started_at=recording["started_at"],
        recorded_duration_ms=recording["available_duration_ms"],
        segment_count=len(segments),
        playback_bytes=video.stat().st_size,
        mp4_range=True,
        playback_duration_seconds=float(metadata["format"]["duration"]),
        playback_requested_offset_ms=52000,
        playback_actual_start_ms=playback["actual_start_offset_ms"],
        playback_seek_offset_ms=playback["seek_offset_ms"],
    )
    print(
        "PASS actual recording metadata, MP4 export, timestamp offset and Range 206/416", flush=True
    )

    if browser:
        probe = subprocess.run(
            [
                "node",
                "scripts/vms_browser.mjs",
                str(stack.runtime / "connection.json"),
                recording["id"],
            ],
            env=stack.env,
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=100,
        )
        report["browser"] = json.loads(probe.stdout.strip().splitlines()[-1])
        print("PASS unchanged frontend with real HLS, MP4 playback and seeking", flush=True)

    stack.stop_api()
    stack.start_api()
    assert [c["id"] for c in expect(client.get("/api/v1/cameras"), 200)["items"]] == ids
    assert expect(client.get(f"/api/v1/layouts/{layout['id']}"), 200)["cells"] == body["cells"]
    assert expect(client.get(f"/api/v1/recordings/{recording['id']}"), 200)["id"] == recording["id"]
    expect(client.get(playback["url"], headers={"Range": "bytes=0-127"}), 206)
    report["backend_restart_persistence"] = True
    print(
        "PASS backend restart preserves cameras, layout, recordings and playback session",
        flush=True,
    )

    disabled = expect(
        client.patch(
            f"/api/v1/cameras/{ids[0]}",
            headers={"Idempotency-Key": "disable-camera-1"},
            json={"enabled": False, "name": "Renamed camera", "location": None},
        ),
        200,
    )
    assert disabled["status"] == "disabled" and disabled["location"] is None
    expect(client.post(f"/api/v1/cameras/{ids[0]}/live-session"), 409, "CAMERA_DISABLED")
    expect(client.get(live["url"]), 503, "STREAM_OFFLINE")
    # Actual source file removal, not a mocked not-found response.
    with psycopg.connect(stack.env["DATABASE_URL"]) as db:
        storage_key = db.execute(
            """SELECT storage_key FROM segments WHERE recording_id=%s
            AND offset_ms<=%s AND offset_ms+duration_ms>%s""",
            (recording["id"], playback_body["offset_ms"], playback_body["offset_ms"]),
        ).fetchone()[0]
    (stack.runtime / "recordings" / storage_key).unlink()
    missing = client.post("/api/v1/playback-sessions", json=playback_body)
    assert missing.status_code in {404, 409}, missing.text
    report["missing_media"] = missing.json()["error"]["code"]

    # Losing a whole storage directory must also invalidate persisted availability.
    # Stop its actual publisher first, then move the files outside the recording root.
    publisher = stack.publishers[0]
    if publisher.poll() is None:
        publisher.send_signal(signal.SIGINT)
        publisher.wait(timeout=15)
    directory = (stack.runtime / "recordings" / storage_key).parent
    directory.rename(stack.runtime / "unavailable-camera-recordings")
    print("CHECK metadata after a complete recording directory becomes unavailable", flush=True)
    wait_for(
        lambda: client.get(f"/api/v1/recordings/{recording['id']}").status_code == 404,
        15,
    )
    with psycopg.connect(stack.env["DATABASE_URL"]) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM segments WHERE recording_id=%s AND status='ready'",
                (recording["id"],),
            ).fetchone()[0]
            == 0
        )
    expect(client.post("/api/v1/playback-sessions", json=playback_body), 404)
    report["missing_recording_directory"] = True

    # Replace one real publisher with HEVC to verify explicit codec rejection.
    stack.publishers[3].send_signal(signal.SIGINT)
    stack.publishers[3].wait(timeout=15)
    wait_for(lambda: client.get(f"/api/v1/cameras/{ids[3]}").json()["status"] == "offline", 20)
    stack.sample(3, codec="libx265")
    codec_error = wait_for(
        lambda: next(
            (
                c
                for c in client.get("/api/v1/cameras").json()["items"]
                if c["id"] == ids[3]
                and c.get("connection_error", {})
                and c["connection_error"]["code"] == "UNSUPPORTED_CODEC"
            ),
            None,
        ),
        30,
    )
    assert codec_error["status"] == "error"
    expect(client.post(f"/api/v1/cameras/{ids[3]}/live-session"), 503, "UNSUPPORTED_CODEC")
    report["unsupported_codec"] = True

    # Recover from an actual publisher interruption and resume finalized H264 recording.
    incompatible = stack.publishers[-1]
    incompatible.send_signal(signal.SIGINT)
    incompatible.wait(timeout=15)
    wait_for(lambda: client.get(f"/api/v1/cameras/{ids[3]}").json()["status"] == "offline", 20)
    resumed_at = datetime.now(timezone.utc)
    stack.sample(3)
    wait_for(lambda: client.get(f"/api/v1/cameras/{ids[3]}").json()["status"] == "online", 30)
    recovered = expect(client.post(f"/api/v1/cameras/{ids[3]}/live-session"), 200)
    assert "#EXTM3U" in expect(client.get(recovered["url"]), 200).text

    def resumed_segment():
        with psycopg.connect(stack.env["DATABASE_URL"]) as db:
            return db.execute(
                """SELECT s.id FROM segments s JOIN recordings r ON r.id=s.recording_id
                WHERE r.camera_id=%s AND s.started_at>=%s AND s.status='ready'
                ORDER BY s.started_at LIMIT 1""",
                (ids[3], resumed_at),
            ).fetchone()

    report["recovered_segment_id"] = str(wait_for(resumed_segment, 30)[0])
    report["stream_recovery"] = True
    print("PASS missing directory invalidation and interrupted-stream recovery", flush=True)

    # Remove camera 4 from the layout, then soft-delete and replay the exact mutation.
    expect(
        client.put(
            f"/api/v1/layouts/{layout['id']}",
            headers={"Idempotency-Key": "layout-replace-1"},
            json={**body, "cells": body["cells"][:3], "expected_version": 1},
        ),
        200,
    )
    delete_headers = {"Idempotency-Key": "delete-camera-4"}
    expect(client.delete(f"/api/v1/cameras/{ids[3]}", headers=delete_headers), 204)
    expect(client.delete(f"/api/v1/cameras/{ids[3]}", headers=delete_headers), 204)
    expect(client.get(f"/api/v1/cameras/{ids[3]}"), 404)
    report["camera_crud"] = True
    with psycopg.connect(stack.env["DATABASE_URL"]) as db:
        db.execute(
            "UPDATE media_sessions SET expires_at=now()-interval '1 second' WHERE id=%s",
            (playback["id"],),
        )
        report["audit_records"] = db.execute("SELECT count(*) FROM vms_audit").fetchone()[0]
    expect(client.get(playback["url"]), 404)
    report["expired_session"] = True
    # Actual MediaMTX process outage must become a typed failure, never an online success.
    stack.media_process.terminate()
    stack.media_process.wait(timeout=20)
    wait_for(lambda: client.get(f"/api/v1/cameras/{ids[1]}").json()["status"] == "unknown", 20)
    expect(client.post(f"/api/v1/cameras/{ids[1]}/live-session"), 503, "MEDIA_UNAVAILABLE")
    report["media_outage"] = True
    expect(
        client.post(
            "/api/v1/agent/messages",
            headers={"Idempotency-Key": "pending-agent-1"},
            json={"message": "Do something"},
        ),
        503,
        "MODEL_UNAVAILABLE",
    )
    print(
        "PASS disabled/deleted cameras, missing files, HEVC rejection, expiry and media outage",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mediamtx", required=True)
    parser.add_argument("--skip-browser", action="store_true")
    args = parser.parse_args()
    report = {
        "phase": "03",
        "status": "failed",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "fixture": "Real FFmpeg testsrc2; no human footage",
        "docker": "not available",
    }
    stack = NativeStack(args.mediamtx)
    # This media-only suite must not make paid model calls or assume the old 501 contract.
    stack.env["MODEL_API_KEY"] = ""
    try:
        with stack:
            run(stack, report, browser=not args.skip_browser)
        report["status"] = "passed"
    except Exception as error:
        report["error_type"] = type(error).__name__
        raise
    finally:
        path = stack.runtime / "report.json"
        path.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2), flush=True)
        print(f"Private local evidence: {path}", flush=True)


if __name__ == "__main__":
    main()
