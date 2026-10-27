"""Idempotently register explicitly enabled FFmpeg sample sources through the real API."""

import argparse
import json
import os
from pathlib import Path

import httpx


def seed(client):
    sources = client.get("/api/v1/camera-sources")
    sources.raise_for_status()
    items = []
    for source in sources.json()["items"]:
        if source["mode"] != "publisher" or not source["id"].startswith("sample"):
            continue
        response = client.post(
            "/api/v1/cameras",
            headers={"Idempotency-Key": f"seed-{source['id']}-v1"},
            json={
                "name": f"Sample camera {len(items) + 1}",
                "source_id": source["id"],
                "group_name": "Synthetic test cameras",
                "location": "FFmpeg sample",
            },
        )
        response.raise_for_status()
        items.append(response.json())
    if not items:
        raise RuntimeError("No explicit sample sources enabled; set ENABLE_SAMPLE_CAMERA=true")
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--connection", type=Path, help="Private native connection.json")
    args = parser.parse_args()
    connection = (
        json.loads(args.connection.read_text())
        if args.connection
        else {
            "api_url": os.environ.get("API_INTERNAL_URL", "http://127.0.0.1:8000"),
            "operator_token": os.environ["VEYRA_DEV_TOKEN"],
        }
    )
    with httpx.Client(
        base_url=connection["api_url"],
        trust_env=False,
        headers={"Authorization": f"Bearer {connection['operator_token']}"},
    ) as client:
        cameras = seed(client)
    print(json.dumps({"registered_camera_ids": [c["id"] for c in cameras]}))


if __name__ == "__main__":
    main()
