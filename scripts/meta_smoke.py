"""Minimal real API probe. Never substitutes fake output; no key => explicit skip.

Reads MODEL_API_KEY from the environment or root .env. Uses only non-sensitive prompts.
Saves status/usage/request IDs, not credentials or raw generated responses.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.agent_tools import FindFeature, discover_features  # noqa: E402
from veyra.meta import MetaClient, ModelFailure  # noqa: E402
from veyra.settings import get_settings  # noqa: E402


def main():
    settings = get_settings()
    report = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "model": settings.meta_model,
        "status": "skipped",
        "reason": "MODEL_API_KEY not configured",
        "video": "not tested: no media uploaded in this minimal smoke test",
    }
    destination = ROOT / "runtime/feasibility/meta/report.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not settings.model_api_key.get_secret_value():
        destination.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 0
    client = None
    report.pop("reason")
    report["status"] = "failed"
    try:
        client = MetaClient(settings)
        catalog = client.list_models()
        if not any(item.get("id") == settings.meta_model for item in catalog.get("data", [])):
            raise ValueError("configured model absent from live account catalog")
        report["model_availability"] = {"status": "passed", "model": settings.meta_model}
        text = client.chat(
            messages=[{"role": "user", "content": "Reply with the word ready."}],
            max_completion_tokens=128,
        )
        content = text["choices"][0]["message"].get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("text response is empty")
        report["text"] = {"status": "passed", "id": text.get("id"), "usage": text.get("usage")}
        structured = client.chat(
            messages=[{"role": "user", "content": 'Return {"status":"ready"}.'}],
            max_completion_tokens=256,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "health_probe",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {"status": {"type": "string", "enum": ["ready"]}},
                        "required": ["status"],
                        "additionalProperties": False,
                    },
                },
            },
        )
        if json.loads(structured["choices"][0]["message"]["content"]) != {"status": "ready"}:
            raise ValueError("structured response did not match the requested schema")
        report["structured_output"] = {"status": "passed", "id": structured.get("id")}
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "features.discover",
                    "description": "Find the actual Veyra feature catalog.",
                    "parameters": FindFeature.model_json_schema(),
                    "strict": True,
                },
            }
        ]
        messages = [
            {
                "role": "user",
                "content": "Use features.discover with query layouts to find saved grids.",
            }
        ]
        first = client.chat(
            messages=messages,
            tools=tools,
            tool_choice="auto",
            parallel_tool_calls=False,
            max_completion_tokens=512,
        )
        assistant = first["choices"][0]["message"]
        calls = assistant.get("tool_calls") or []
        if not calls:
            report["tool_calling"] = {"status": "not_observed", "id": first.get("id")}
            report["status"] = "partial"
        else:
            if len(calls) != 1 or calls[0]["function"]["name"] != "features.discover":
                raise ValueError("unexpected tool request; nothing executed")
            call = calls[0]
            arguments = FindFeature.model_validate_json(call["function"]["arguments"], strict=True)
            features = [f.model_dump(mode="json") for f in discover_features(arguments.query)]
            messages.append(assistant)  # Preserve tool-call/reasoning fields, per official guide.
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": json.dumps({"items": features}),
                }
            )
            final = client.chat(
                messages=messages, tools=tools, tool_choice="auto", max_completion_tokens=512
            )
            final_message = final["choices"][0]["message"]
            if final_message.get("tool_calls") or not final_message.get("content"):
                raise ValueError("read-only tool loop did not finish within two requests")
            report["tool_calling"] = {
                "status": "passed",
                "id": final.get("id"),
                "executed": "features.discover (read-only)",
            }
            report["status"] = "passed"
    except ModelFailure as exc:
        report["error_code"] = exc.code
        report["http_status"] = exc.http_status
        report["retryable"] = exc.retryable
    except httpx.HTTPStatusError as exc:
        # Do not echo provider bodies or request headers.
        report["http_status"] = exc.response.status_code
        report["provider_request_id"] = exc.response.headers.get("x-request-id")
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
        report["error_type"] = type(exc).__name__
    finally:
        if client is not None:
            client.close()
        destination.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
