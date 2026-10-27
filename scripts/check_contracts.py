"""Verify frozen artifacts match source without rewriting them."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.contract_app import app  # noqa: E402
from veyra.registry import CAPABILITIES  # noqa: E402

document = app.openapi()
document["info"]["x-contract-status"] = "frozen-phase-01"
saved = ROOT / "packages/contracts/openapi.json"
if saved.read_text() != json.dumps(document, indent=2, sort_keys=True) + "\n":
    raise SystemExit("OpenAPI drift: run make contracts and coordinate the contract change")
tools_path = ROOT / "packages/contracts/agent-tools.json"
expected_tools = (
    json.dumps([tool.model_dump(mode="json") for tool in CAPABILITIES], indent=2, sort_keys=True)
    + "\n"
)
if tools_path.read_text() != expected_tools:
    raise SystemExit("Agent registry drift: run make contracts")
with tempfile.TemporaryDirectory() as directory:
    generated = Path(directory) / "api.d.ts"
    subprocess.run(
        [str(ROOT / "node_modules/.bin/openapi-typescript"), str(saved), "-o", str(generated)],
        cwd=ROOT,
        check=True,
    )
    if generated.read_text() != (ROOT / "packages/contracts/src/api.d.ts").read_text():
        raise SystemExit("TypeScript drift: run make contracts")
print("Frozen OpenAPI and generated TypeScript match their sources")
