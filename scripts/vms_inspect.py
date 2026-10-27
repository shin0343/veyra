"""Print only public VMS state from a private native connection file."""

import argparse
import json
from pathlib import Path

import httpx

parser = argparse.ArgumentParser()
parser.add_argument("connection", type=Path)
args = parser.parse_args()
config = json.loads(args.connection.read_text())
with httpx.Client(
    base_url=config["api_url"],
    trust_env=False,
    headers={"Authorization": f"Bearer {config['operator_token']}"},
) as client:
    for route in ["/cameras", "/recordings"]:
        response = client.get("/api/v1" + route)
        print(json.dumps({"route": route, "status": response.status_code, "data": response.json()}))
    camera = client.get("/api/v1/cameras").json()["items"][0]
    response = client.post(f"/api/v1/cameras/{camera['id']}/live-session")
    print(
        json.dumps(
            {"route": "live-session", "status": response.status_code, "data": response.json()}
        )
    )
    if response.is_success:
        media = client.get(response.json()["url"])
        print(json.dumps({"hls_status": media.status_code, "manifest": media.text[:1000]}))
