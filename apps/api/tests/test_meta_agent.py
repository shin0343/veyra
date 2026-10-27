"""Provider transport fixtures: these tests never contact the live Meta API."""

import json
import time

import httpx
import pytest
from pydantic import ValidationError
from veyra.agent_tools import TOOLS, CameraSelection, CreateLayout, discover_features
from veyra.meta import MetaClient, ModelFailure, parse_turn
from veyra.settings import Settings


def completion(content='{"message":"Ready."}', calls=None, finish=None):
    message = {"role": "assistant", "content": content}
    if calls is not None:
        message["tool_calls"] = calls
    return {
        "choices": [
            {"message": message, "finish_reason": finish or ("tool_calls" if calls else "stop")}
        ]
    }


def tool_call(name="cameras.list", arguments="{}", call_id="call_1"):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": arguments}}


def test_actual_capability_catalog_and_camera_settings_selection():
    assert len(TOOLS) == 13
    assert "video.search" in TOOLS and "rules.create" not in TOOLS
    assert all(spec.public().implemented for spec in TOOLS.values())
    assert all(spec.handler and spec.input_type for spec in TOOLS.values())
    assert TOOLS["layouts.create"].confirmation == "always"
    features = discover_features("Where can I change my camera settings?")
    assert [feature.id for feature in features] == ["cameras"]
    assert features[0].action.target.feature_id == "cameras"
    assert not discover_features("recognize everyone")


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": " "},
        {"name": "Garage", "camera_id": "00000000-0000-4000-8000-000000000001"},
        {"name": "Garage", "url": "https://evil.test"},
    ],
)
def test_camera_references_fail_closed(body):
    with pytest.raises(ValidationError):
        CameraSelection.model_validate_json(json.dumps(body), strict=True)


def test_no_arbitrary_route_or_execution_arguments():
    with pytest.raises(ValidationError):
        CreateLayout.model_validate_json(
            json.dumps(
                {
                    "name": "X",
                    "columns": 2,
                    "cameras": [{"name": "Garage"}],
                    "code": "DROP TABLE cameras",
                }
            ),
            strict=True,
        )


def test_json_schema_integer_columns_does_not_accept_boolean():
    with pytest.raises(ValidationError):
        CreateLayout.model_validate_json(
            '{"name":"X","columns":true,"cameras":[{"name":"Garage"}]}', strict=True
        )


@pytest.mark.parametrize(
    "value",
    [
        {},
        {"choices": []},
        completion(content="not JSON"),
        completion(content='{"message":"ok","url":"evil"}'),
        completion(content='{"message":"ok"}', finish="length"),
        completion(calls=[tool_call(arguments={})]),
        completion(calls=[tool_call(), tool_call()]),
        completion(calls=[tool_call(call_id="x" * 65)]),
        completion(calls=[tool_call(call_id="")]),
    ],
)
def test_malformed_model_responses_are_never_dispatched(value):
    with pytest.raises(ModelFailure, match="MALFORMED_MODEL_RESPONSE"):
        parse_turn(value)


def test_preserve_complete_assistant_including_reasoning():
    value = completion(content=None, calls=[tool_call()])
    value["choices"][0]["message"]["reasoning_content"] = "Fixture reasoning."
    message, calls = parse_turn(value)
    assert message == value["choices"][0]["message"]
    assert calls[0].function.name == "cameras.list"


def client_for(handler):
    return MetaClient(
        Settings(_env_file=None, model_api_key="fixture-key-not-real"),
        transport=httpx.MockTransport(handler),
    )


def test_dedicated_adapter_format_and_server_key():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=completion())

    client = client_for(handler)
    try:
        client.turn(
            [{"role": "user", "content": "Where are settings?"}],
            [TOOLS["features.discover"].provider()],
            time.monotonic() + 5,
        )
    finally:
        client.close()
    request = requests[0]
    assert str(request.url) == "https://api.meta.ai/v1/chat/completions"
    payload = json.loads(request.content)
    assert payload["model"] == "muse-spark-1.3"
    assert payload["tool_choice"] == "auto" and payload["parallel_tool_calls"] is False
    assert payload["response_format"]["json_schema"]["strict"] is True
    assert payload["tools"][0]["function"]["strict"] is False
    assert payload["store"] is False
    assert "fixture-key" not in request.content.decode()


@pytest.mark.parametrize(
    "status,expected_calls", [(401, 1), (403, 1), (404, 1), (400, 1), (429, 2), (500, 2), (503, 2)]
)
def test_retry_only_transient_errors_and_sanitize_provider_body(
    status, expected_calls, monkeypatch
):
    calls = []
    monkeypatch.setattr("veyra.meta.time.sleep", lambda delay: None)

    def handler(request):
        calls.append(request)
        return httpx.Response(
            status,
            headers={"Retry-After": "0"},
            json={"error": {"message": "private-provider-secret"}},
        )

    client = client_for(handler)
    try:
        with pytest.raises(ModelFailure) as caught:
            client.chat(messages=[])
        assert caught.value.http_status == status
        assert "private-provider-secret" not in str(caught.value)
        assert len(calls) == expected_calls
    finally:
        client.close()


def test_honor_retry_after_without_exceeding_run_deadline(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503, headers={"Retry-After": "60"})

    client = client_for(handler)
    monkeypatch.setattr(
        "veyra.meta.time.sleep", lambda delay: pytest.fail("Must not wait beyond deadline")
    )
    try:
        with pytest.raises(ModelFailure):
            client.chat(messages=[], deadline=time.monotonic() + 1)
        assert len(calls) == 1
    finally:
        client.close()


@pytest.mark.parametrize("body", [b"not-json", b"[]", b"x" * (2 * 1024 * 1024 + 1)])
def test_invalid_or_oversized_http_body(body):
    client = client_for(lambda request: httpx.Response(200, content=body))
    try:
        with pytest.raises(ModelFailure, match="MALFORMED_MODEL_RESPONSE"):
            client.chat(messages=[])
    finally:
        client.close()


def test_contributor_and_unapproved_models_are_rejected():
    with pytest.raises(ModelFailure, match="MODEL_NOT_ALLOWED"):
        MetaClient(
            Settings(
                _env_file=None, model_api_key="fixture", meta_model="muse-spark-1.3-contributor"
            )
        )
