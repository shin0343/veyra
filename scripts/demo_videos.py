"""Idempotent VIDEO-01 native demo: existing DB, licensed publishers, bounded recordings.

Never resets storage, never starts synthetic publishers, never queues cloud analysis.
Ctrl-C closes only this process's children. Reuse --runtime to retain all demo data.
"""

import argparse
import json
import signal
import time
from pathlib import Path

import httpx
from prepare_demo_videos import ROOT, prepare
from vms_native import PYTHON, NativeStack, wait_for


def response_json(response):
    response.raise_for_status()
    return response.json()


def ensure_cameras(client, assets):
    existing = response_json(client.get("/api/v1/cameras"))["items"]
    by_source = {c["source_id"]: c for c in existing}
    # Keep legacy IDs, recordings, Muse observations and saved-layout references intact.
    for camera in existing:
        if camera["source_id"] in {"sample", "sample_2"} and camera["enabled"]:
            response_json(
                client.patch(
                    f"/api/v1/cameras/{camera['id']}",
                    headers={"Idempotency-Key": f"video01-pause-{camera['id']}"},
                    json={"enabled": False, "group_name": "Development test sources"},
                )
            )
    for asset in assets:
        if not asset["register_by_default"] or asset["source_id"] in by_source:
            continue
        camera = response_json(
            client.post(
                "/api/v1/cameras",
                headers={"Idempotency-Key": f"video01-camera-{asset['source_id']}-v1"},
                json={
                    "name": asset["camera_name"],
                    "source_id": asset["source_id"],
                    "group_name": "Video demo library",
                    "location": asset["location"],
                    "cloud_analysis_allowed": False,
                },
            )
        )
        by_source[asset["source_id"]] = camera
    return by_source


def ensure_layout(client, cameras, assets):
    selected = [cameras[a["source_id"]] for a in assets if a["register_by_default"]][:4]
    cells = [{"position": index, "camera_id": c["id"]} for index, c in enumerate(selected)]
    name = "Video library · four spaces"
    layouts = response_json(client.get("/api/v1/layouts"))["items"]
    existing = next((item for item in layouts if item["name"] == name), None)
    if existing:
        if existing["columns"] != 2 or existing["cells"] != cells:
            raise RuntimeError("Existing VIDEO-01 layout differs; preserved for operator review")
        return existing
    return response_json(
        client.post(
            "/api/v1/layouts",
            headers={"Idempotency-Key": "video01-four-spaces-v1"},
            json={"name": name, "columns": 2, "cells": cells},
        )
    )


def run(args):
    document = prepare(args.assets_root)
    assets = document["assets"]
    library = args.assets_root.resolve() / "library.json"
    stack = NativeStack(
        args.mediamtx,
        args.runtime,
        publisher_paths=[a["media_path"] for a in assets],
        record_paths=(),
        preserve_recordings=True,
    )
    # Curated-only keeps Muse's search tool on attributed footage, as in the release tests.
    stack.env.update(
        DEMO_LIBRARY_PATH=str(library),
        DEMO_ASSETS_ROOT=str(args.assets_root.resolve()),
        DEMO_CURATED_ONLY="true",
    )
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)
    with stack:
        # The pre-VIDEO-01 database has already been cold-copied/pg_dumped by the operator.
        # Repeated starts never remove or rewrite historical media/index rows.
        cameras = ensure_cameras(stack.http, assets)
        capture = []
        for asset in assets:
            camera = cameras.get(asset["source_id"])
            if not camera or not camera["enabled"]:
                continue
            recordings = response_json(
                stack.http.get(
                    "/api/v1/recordings", params={"camera_id": camera["id"], "limit": 100}
                )
            )["items"]
            matching = [
                r
                for r in recordings
                if r.get("source_media")
                and r["source_media"].get("sha256") == asset["media"]["sha256"]
                and r["available_duration_ms"] >= 1000
            ]
            if not matching:
                capture.append(asset)
        for asset in assets:
            # Includes a real unregistered source for the connect-camera demonstration.
            process = stack.spawn(
                f"video-{asset['asset_id']}",
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "warning",
                    "-re",
                    "-stream_loop",
                    "-1",
                    "-i",
                    str(args.assets_root.resolve() / asset["file"]),
                    "-map",
                    "0:v:0",
                    "-an",
                    "-c:v",
                    "copy",
                    "-f",
                    "rtsp",
                    "-rtsp_transport",
                    "tcp",
                    f"rtsp://127.0.0.1:{stack.ports['rtsp']}/{asset['media_path']}",
                ],
            )
            asset["publisher_started"] = time.monotonic()
            asset["publisher_pid"] = process.pid

        # The reconciler owns the bounded recording policy, including across restarts.
        # Wait for actual finalized segments rather than racing its MediaMTX configuration.
        def captured():
            for asset in capture:
                items = response_json(
                    stack.http.get(
                        "/api/v1/recordings",
                        params={"camera_id": cameras[asset["source_id"]]["id"], "limit": 100},
                    )
                )["items"]
                if not any(
                    r.get("source_media")
                    and r["source_media"].get("sha256") == asset["media"]["sha256"]
                    and r["available_duration_ms"] >= 1000
                    and r["status"] == "ready"
                    for r in items
                ):
                    return False
            return True

        if not stopped:
            wait_for(captured, seconds=90)
        if stopped:
            return
        expected = {a["source_id"] for a in assets if a["register_by_default"]}
        wait_for(
            lambda: all(
                c["status"] == "online"
                for c in response_json(stack.http.get("/api/v1/cameras"))["items"]
                if c["source_id"] in expected
            ),
            seconds=60,
        )
        layout = ensure_layout(stack.http, cameras, assets)
        stack.spawn("worker", [str(PYTHON), "-E", "services/worker/main.py"])
        web_env = stack.runtime / "web.env"
        web_env.write_text(
            web_env.read_text().replace("http://localhost:3000", f"http://127.0.0.1:{args.port}")
        )
        stack.spawn(
            "web",
            [
                "node",
                f"--env-file={web_env}",
                "node_modules/next/dist/bin/next",
                "start",
                "apps/web",
                "--hostname",
                "127.0.0.1",
                "--port",
                str(args.port),
            ],
        )
        wait_for(
            lambda: (
                httpx.get(f"http://127.0.0.1:{args.port}", trust_env=False, timeout=3).status_code
                == 200
            ),
            seconds=60,
        )
        state = {
            "web_url": f"http://127.0.0.1:{args.port}",
            "layout_id": layout["id"],
            "camera_ids": {key: value["id"] for key, value in cameras.items()},
            "newly_captured_sources": [a["source_id"] for a in capture],
            "publisher_pids": {a["source_id"]: a["publisher_pid"] for a in assets},
            "pid": __import__("os").getpid(),
        }
        (stack.runtime / "video01-state.json").write_text(json.dumps(state, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "status": "ready",
                    "web_url": state["web_url"],
                    "newly_captured_sources": state["newly_captured_sources"],
                    "note": "Prerecorded publishers; no cloud jobs queued.",
                }
            ),
            flush=True,
        )
        while not stopped:
            time.sleep(0.5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mediamtx", required=True)
    parser.add_argument("--runtime", type=Path, default=ROOT / "runtime/demo")
    parser.add_argument("--assets-root", type=Path, default=ROOT / "runtime/video-library")
    parser.add_argument("--port", type=int, default=3200)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose an unprivileged local port")
    # A repeated setup against a healthy owned runtime is a successful read-only no-op.
    state_file, connection_file = (
        args.runtime / "video01-state.json",
        args.runtime / "connection.json",
    )
    if state_file.is_file() and connection_file.is_file():
        state = json.loads(state_file.read_text())
        connection = json.loads(connection_file.read_text())
        if state.get("web_url") == f"http://127.0.0.1:{args.port}":
            try:
                with httpx.Client(
                    trust_env=False,
                    timeout=3,
                    headers={"Authorization": "Bearer " + connection["operator_token"]},
                ) as client:
                    cameras = client.get(connection["api_url"] + "/api/v1/cameras")
                    web = client.get(state["web_url"])
                    actual = (
                        {c["id"] for c in cameras.json()["items"]}
                        if cameras.status_code == 200
                        else set()
                    )
                    if web.status_code == 200 and set(state["camera_ids"].values()) <= actual:
                        print(
                            json.dumps(
                                {
                                    "status": "already_running",
                                    "web_url": state["web_url"],
                                    "note": "Existing cameras, recordings and indexes preserved.",
                                }
                            )
                        )
                        return
            except (httpx.HTTPError, ValueError, KeyError):
                pass
    run(args)


if __name__ == "__main__":
    main()
