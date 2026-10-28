"""Isolated release test server. Scripted provider HTTP, never a live Muse connection.

Only launched by final_rc.py with two explicit test markers and a dedicated test database.
This module is not a product route, deployment mode, or alternative AI integration.
"""

import json
import os
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from veyra.config import Settings
from veyra.index_models import SearchIntent
from veyra.main import app
from veyra.meta import MetaClient

if os.environ.get("VEYRA_FINAL_TEST_DB") != "1" or os.environ.get("MODEL_API_KEY"):
    raise RuntimeError("Scripted server requires an explicitly isolated, keyless test environment")
if not os.environ.get("DATABASE_URL", "").endswith("/veyra_final_qa"):
    raise RuntimeError("Scripted server refuses databases outside the release test scope")


def completion(name=None, arguments=None, identifier="fixture_call"):
    message = {"role": "assistant", "content": '{"message":"Scripted test response."}'}
    if name:
        message["content"] = None
        message["tool_calls"] = [
            {
                "id": identifier,
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(arguments or {})},
            }
        ]
    return httpx.Response(
        200,
        json={
            "choices": [
                {
                    "message": message,
                    "finish_reason": "tool_calls" if name else "stop",
                }
            ]
        },
    )


def scripted(request):
    if request.url.host != "api.meta.ai":
        raise AssertionError("Unexpected provider destination")
    messages = json.loads(request.content)["messages"]
    user = next(m["content"] for m in reversed(messages) if m["role"] == "user")
    lower = user.casefold()
    # Only current-turn tool messages participate; conversation history is still supplied
    # and validated by the real application dispatcher.
    last_user = max(i for i, m in enumerate(messages) if m["role"] == "user")
    tool_results = [m for m in messages[last_user + 1 :] if m["role"] == "tool"]
    if re.search(r"creat|assembl|make|save", lower) and re.search(r"view|layout", lower):
        if not tool_results:
            return completion("cameras.list", identifier="fixture_list")
        cameras = json.loads(tool_results[0]["content"]).get("items", [])
        selected = [c for c in cameras if c["name"].casefold() in lower]
        if selected:
            match = re.search(r'named\s+[“"\']([^”"\']+)[”"\']', user, re.I)
            return completion(
                "layouts.create",
                {
                    "name": match[1] if match else "Release fixture view",
                    "columns": 2,
                    "cameras": [{"name": c["name"]} for c in selected],
                },
                "fixture_create",
            )
        return completion()
    if "basement" in lower:
        return (
            completion() if tool_results else completion("cameras.navigate", {"name": "Basement"})
        )
    if any(word in lower for word in ("walking", "bicycle", "cycling", "squirrel", "dog")):
        if tool_results:
            return completion()
        category = (
            "person"
            if "walking" in lower
            else "bicycle"
            if "bicycle" in lower or "cycling" in lower
            else "dog"
            if "dog" in lower
            else "other"
        )
        return completion(
            "video.search",
            {
                "camera_names": [],
                "objects": [{"category": category, "attributes": []}],
                "event_types": ["walking"] if "walking" in lower else [],
                "motion_only": False,
                "keywords": [],
                "curated_only": True,
                "start": "2026-10-27T00:00:00Z",
                "end": "2026-10-28T00:00:00Z",
                "limit": 10,
            },
        )
    if any(word in lower for word in ("camera", "settings", "privacy", "feature")):
        return (
            completion()
            if tool_results
            else completion("features.discover", {"query": "camera settings"})
        )
    return httpx.Response(503, json={"error": "No scripted fixture for this prompt"})


original_lifespan = app.router.lifespan_context


class ScriptedInterpretation:
    """Fixed test interpretation; orchestration/retrieval run through the actual search API."""

    def parse_search(self, body, cameras):
        if body.query not in {"people walking", "a bicycle", "a dog running"}:
            raise AssertionError("No scripted interpretation for this query")
        return SearchIntent(
            camera_names=[],
            start=None,
            end=None,
            objects=[
                {
                    "category": "person"
                    if "walking" in body.query
                    else "bicycle"
                    if "bicycle" in body.query
                    else "dog",
                    "attributes": [],
                }
            ],
            event_types=["walking"] if "walking" in body.query else [],
            motion_only=False,
            keywords=[],
            unsupported_reason=None,
        )

    def close(self):
        pass


@asynccontextmanager
async def lifespan(application):
    async with original_lifespan(application):
        fixture_settings = Settings(_env_file=None, model_api_key="scripted-release-test-only")
        application.state.agent.provider_factory = lambda: MetaClient(
            fixture_settings, transport=httpx.MockTransport(scripted)
        )
        application.state.search.provider_factory = ScriptedInterpretation
        yield


app.router.lifespan_context = lifespan
