"""Server-only first-party Meta transport. It never executes application operations."""

import json
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .settings import Settings

BASE_URL = "https://api.meta.ai/v1"
RETRYABLE = {408, 429, 500, 502, 503, 504}
FINAL_SCHEMA = {
    "name": "agent_summary",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {"message": {"type": "string"}},
        "required": ["message"],
        "additionalProperties": False,
    },
}


class ModelFailure(Exception):
    def __init__(self, code="MODEL_UNAVAILABLE", retryable=False, http_status=None):
        self.code, self.retryable, self.http_status = code, retryable, http_status
        # Do not retain a provider response, headers, input, or exception message.
        super().__init__(code)


class FunctionCall(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_.-]+$")
    arguments: str = Field(max_length=16000)


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    type: Literal["function"]
    function: FunctionCall


class Summary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    message: str = Field(min_length=1, max_length=4000)


def parse_turn(response):
    """Validate the entire turn before dispatch. Preserve the complete assistant message."""
    try:
        choices = response["choices"]
        if not isinstance(choices, list) or len(choices) != 1:
            raise ValueError
        choice = choices[0]
        message = choice["message"]
        if message["role"] != "assistant" or message.get("refusal"):
            raise ValueError
        if choice["finish_reason"] not in {"stop", "tool_calls"}:
            raise ValueError
        if message.get("content") is not None and not isinstance(message["content"], str):
            raise ValueError
        calls = message.get("tool_calls")
        if calls is None:
            calls = []
        if not isinstance(calls, list) or len(calls) > 12:
            raise ValueError
        parsed = [ToolCall.model_validate(call) for call in calls]
        if parsed and choice["finish_reason"] != "tool_calls":
            raise ValueError
        if len({call.id for call in parsed}) != len(parsed):
            raise ValueError
        if not parsed:
            if choice["finish_reason"] != "stop":
                raise ValueError
            Summary.model_validate_json(message["content"], strict=True)
        return message, parsed
    except (KeyError, IndexError, TypeError, ValueError, ValidationError):
        raise ModelFailure("MALFORMED_MODEL_RESPONSE") from None


class MetaClient:
    def __init__(self, settings: Settings, *, transport=None, usage_meter=None):
        key = settings.model_api_key.get_secret_value()
        if not key:
            raise ModelFailure("MODEL_NOT_CONFIGURED")
        if settings.meta_model not in {"muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.1"}:
            raise ModelFailure("MODEL_NOT_ALLOWED")
        self.model = settings.meta_model
        self.usage_meter = usage_meter
        self.http = httpx.Client(
            base_url=BASE_URL + "/",
            headers={"Authorization": f"Bearer {key}"},
            timeout=httpx.Timeout(25, connect=5),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )

    def _request(self, method, path, payload=None, deadline=None):
        deadline = deadline if deadline is not None else time.monotonic() + 55
        for attempt in range(2):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ModelFailure("AGENT_DEADLINE", True)
            try:
                with self.http.stream(
                    method,
                    path,
                    json=payload,
                    timeout=httpx.Timeout(min(25, remaining), connect=min(5, remaining)),
                ) as response:
                    if response.status_code == 200:
                        body = bytearray()
                        for chunk in response.iter_bytes():
                            body.extend(chunk)
                            if time.monotonic() >= deadline:
                                raise ModelFailure("AGENT_DEADLINE", True)
                            if len(body) > 2 * 1024 * 1024:
                                raise ModelFailure("MALFORMED_MODEL_RESPONSE")
                        try:
                            value = json.loads(body)
                            if not isinstance(value, dict):
                                raise ValueError
                            return value
                        except (ValueError, UnicodeError):
                            raise ModelFailure("MALFORMED_MODEL_RESPONSE") from None
                    retryable = response.status_code in RETRYABLE
                    if not retryable or attempt == 1:
                        raise ModelFailure(http_status=response.status_code, retryable=retryable)
                    delay = self._retry_delay(response.headers.get("retry-after"), attempt)
            except httpx.HTTPError:
                if attempt == 1:
                    raise ModelFailure(retryable=True) from None
                delay = self._retry_delay(None, attempt)
            if delay + 0.05 >= deadline - time.monotonic():
                raise ModelFailure(retryable=True)
            time.sleep(delay)
        raise ModelFailure(retryable=True)

    @staticmethod
    def _retry_delay(header, attempt):
        if header:
            try:
                return max(0, float(header))
            except ValueError:
                try:
                    return max(
                        0,
                        (
                            parsedate_to_datetime(header) - datetime.now(timezone.utc)
                        ).total_seconds(),
                    )
                except (TypeError, ValueError, OverflowError):
                    pass
        return (0.25 * 2**attempt) + random.uniform(0, 0.1)

    def chat(self, *, deadline=None, **payload: Any) -> dict:
        return self._request(
            "POST",
            "chat/completions",
            {**payload, "model": self.model, "reasoning_effort": "minimal", "store": False},
            deadline,
        )

    def turn(self, messages, tools, deadline):
        identifier = self.usage_meter.reserve("agent_turn") if self.usage_meter else None
        started, response, error = time.monotonic(), {}, None
        try:
            response = self.chat(
                deadline=deadline,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                parallel_tool_calls=False,
                max_completion_tokens=2048,
                response_format={"type": "json_schema", "json_schema": FINAL_SCHEMA},
            )
            return parse_turn(response)
        except ModelFailure as exc:
            error = exc.code
            raise
        finally:
            if identifier is not None:
                self.usage_meter.finish(
                    identifier, response, round((time.monotonic() - started) * 1000), error
                )

    def list_models(self):
        catalog = self._request("GET", "models")
        items = catalog.get("data")
        if not isinstance(items, list) or not all(
            isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"]
            for item in items
        ):
            raise ModelFailure("MALFORMED_MODEL_RESPONSE")
        return catalog

    def close(self):
        self.http.close()
