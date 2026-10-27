"""Real licensed-video RTSP recording -> worker -> retrieval -> authenticated MP4.

Default provider is explicitly scripted; --live requires real credentials and budget.
No frontend source or app interaction is needed. All owned services stop on exit.
"""

import argparse
import json
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
from vms_native import ROOT, NativeStack, wait_for

sys.path.insert(0, str(ROOT / "apps/api"))
from veyra import index_media, index_store  # noqa: E402
from veyra.config import Settings  # noqa: E402
from veyra.db import Database  # noqa: E402
from veyra.index_models import SearchRequest  # noqa: E402
from veyra.index_provider import IndexProvider  # noqa: E402
from veyra.index_worker import Worker  # noqa: E402
from veyra.retrieval import SearchService  # noqa: E402


def scripted(request):
    if request.method == "DELETE":
        return httpx.Response(200, json={"deleted": True})
    if request.url.path == "/v1/files":
        assert b"ftyp" in request.content
        return httpx.Response(200, json={"id": "file-native-scripted"})
    payload = json.loads(request.content)
    content = payload["input"][0]["content"]
    if content[0]["type"] == "input_file":
        duration = json.loads(content[1]["text"])["duration_ms"]
        value = {
            "observations": [
                {
                    "start_ms": min(250, duration - 1),
                    "end_ms": min(1750, duration),
                    "caption": "A person rides a bicycle near trees.",
                    "evidence": "Scripted response for a licensed replay; not Muse inference.",
                    "objects": [
                        {
                            "category": "bicycle",
                            "attributes": [],
                            "evidence": "Bicycle fixture label.",
                        },
                        {
                            "category": "person",
                            "attributes": [],
                            "evidence": "Person fixture label.",
                        },
                    ],
                    "event_types": ["cycling"],
                    "uncertainty": "high",
                    "uncertainty_notes": "Scripted integration fixture; no model quality claim.",
                }
            ]
        }
    else:
        value = {
            "camera_names": [],
            "start": None,
            "end": None,
            "objects": [{"category": "bicycle", "attributes": []}],
            "event_types": [],
            "motion_only": False,
            "keywords": [],
            "unsupported_reason": None,
        }
    return httpx.Response(
        200,
        json={
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": json.dumps(value)}],
                }
            ],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        },
    )


def run(mediamtx, live=False):
    configured = Settings()
    if live and (
        not configured.model_api_key.get_secret_value()
        or configured.model_daily_budget_usd <= 0
        or configured.model_request_reserve_usd <= 0
    ):
        return {
            "status": "unverified",
            "reason": "MODEL_API_KEY and positive model budgets required",
        }
    observed = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    # macOS Unix sockets have a 103-byte path limit; use a short private run directory.
    with NativeStack(mediamtx, ROOT / "runtime/i5" / observed[-13:-1]) as stack:
        # Restart only this disposable API with test or actual live credential admission.
        stack.stop_api()
        stack.env.update(
            MODEL_API_KEY=configured.model_api_key.get_secret_value()
            if live
            else "scripted-not-live",
            MODEL_DAILY_BUDGET_USD=str(configured.model_daily_budget_usd if live else 2),
            MODEL_REQUEST_RESERVE_USD=str(configured.model_request_reserve_usd if live else 0.01),
        )
        stack.start_api()
        camera = stack.http.post(
            "/api/v1/cameras",
            headers={"Idempotency-Key": str(uuid4())},
            json={
                "name": "Licensed cycling replay",
                "source_id": "sample",
                "cloud_analysis_allowed": True,
            },
        )
        assert camera.status_code == 201, camera.text
        camera = camera.json()
        wait_for(
            lambda: stack.http.get("/api/v1/cameras").json()["items"][0]["status"] == "offline"
        )
        video = ROOT / "apps/api/tests/fixtures/video/cycling.mp4"
        publisher = stack.spawn(
            "licensed-replay",
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-re",
                "-stream_loop",
                "-1",
                "-i",
                str(video),
                "-an",
                "-c:v",
                "libx264",
                "-threads",
                "1",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-r",
                "15",
                "-g",
                "15",
                "-bf",
                "0",
                "-f",
                "rtsp",
                "-rtsp_transport",
                "tcp",
                f"rtsp://127.0.0.1:{stack.ports['rtsp']}/fixture",
            ],
        )
        print("Recording licensed real cycling footage over RTSP.", flush=True)
        recording = wait_for(
            lambda: next(
                (
                    r
                    for r in stack.http.get("/api/v1/recordings").json()["items"]
                    if r["available_duration_ms"] >= 9000
                ),
                None,
            ),
            45,
        )
        publisher.send_signal(signal.SIGINT)
        publisher.wait(timeout=15)
        wait_for(
            lambda: (
                stack.http.get(f"/api/v1/recordings/{recording['id']}").json()["status"] == "ready"
            )
        )
        recording = stack.http.get(f"/api/v1/recordings/{recording['id']}").json()
        response = stack.http.post(
            "/api/v1/analysis-jobs",
            headers={"Idempotency-Key": str(uuid4())},
            json={"recording_id": recording["id"], "allow_cloud_upload": True},
        )
        assert response.status_code == 202, response.text
        job_id = UUID(response.json()["id"])
        settings = Settings(
            _env_file=None,
            **{
                "database_url": stack.env["DATABASE_URL"],
                "recordings_root": stack.runtime / "recordings",
                "model_api_key": stack.env["MODEL_API_KEY"],
                "meta_model": configured.meta_model,
                "model_daily_budget_usd": float(stack.env["MODEL_DAILY_BUDGET_USD"]),
                "model_request_reserve_usd": float(stack.env["MODEL_REQUEST_RESERVE_USD"]),
                "model_daily_requests": configured.model_daily_requests,
                "model_input_usd_per_million": configured.model_input_usd_per_million
                if live
                else None,
                "model_output_usd_per_million": configured.model_output_usd_per_million
                if live
                else None,
            },
        )
        database = Database(stack.env["DATABASE_URL"])

        def factory():
            return IndexProvider(
                settings, database, transport=None if live else httpx.MockTransport(scripted)
            )

        worker = Worker(settings, database, factory)
        processing_started = time.monotonic()
        for _ in range(3):
            worker.once()
            with database.connect() as db:
                job = index_store.get_job(db, job_id)
            if job.state != "queued":
                break
            # Honor the bounded retry schedule; no unbounded provider loop.
            time.sleep(8)
        indexing_seconds = time.monotonic() - processing_started
        assert job.state == "succeeded", job.model_dump(mode="json")
        print("Persisted video analysis; searching stored indexes.", flush=True)
        origin = datetime.fromisoformat(recording["started_at"])
        body = SearchRequest(
            query="Find footage with a bicycle.",
            camera_ids=[UUID(camera["id"])],
            start=origin,
            end=origin + timedelta(milliseconds=recording["available_duration_ms"] + 1000),
        )
        result = SearchService(settings, database, factory).search(body)
        assert result.items, (
            "No genuine matching observation was stored." if live else "No fixture match"
        )
        hit = result.items[0]
        playable = stack.http.post(
            "/api/v1/playback-sessions",
            json=hit.playback_request.model_copy(update={"duration_ms": 2000}).model_dump(
                mode="json"
            ),
        )
        assert playable.status_code == 200, playable.text
        session = playable.json()
        assert session["actual_start_offset_ms"] + session["seek_offset_ms"] == hit.offset_ms
        ranged = stack.http.get(session["url"], headers={"Range": "bytes=0-127"})
        assert ranged.status_code == 206 and len(ranged.content) == 128
        complete = stack.http.get(session["url"])
        assert complete.status_code == 200
        output = stack.runtime / "verified-playback.mp4"
        output.write_bytes(complete.content)
        info = index_media.media_info(output)
        assert session["seek_offset_ms"] < info["duration_ms"]
        frame = index_media.command(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                str(session["seek_offset_ms"] / 1000),
                "-i",
                str(output),
                "-frames:v",
                "1",
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "pipe:1",
            ]
        ).stdout
        assert len(frame) > 1000
        with database.connect() as db:
            usage = index_store.usage(db)
        return {
            "status": "passed",
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "provider": "genuine Meta Muse" if live else "scripted Meta HTTP; not genuine AI",
            "media": "licensed film replay -> actual RTSP/MediaMTX recording -> FFmpeg",
            "camera_id": camera["id"],
            "recording": recording,
            "indexing_wall_seconds": indexing_seconds,
            "job": job.model_dump(mode="json"),
            "search": result.model_dump(mode="json"),
            "playback": {
                "requested_offset_ms": hit.offset_ms,
                "session": session,
                "range_status": ranged.status_code,
                "decoded_frame_bytes": len(frame),
                "media_info": info,
            },
            "usage": usage.model_dump(mode="json"),
            "actual_model_cost_usd": None,
            "genuine_inference_verified": live,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mediamtx", default="/tmp/veyra-mediamtx/mediamtx")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    report = run(args.mediamtx, args.live)
    path = (
        ROOT
        / "docs/evidence"
        / ("index-live-phase05.json" if args.live else "index-native-phase05.json")
    )
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": report["status"], "evidence": str(path.relative_to(ROOT))}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
