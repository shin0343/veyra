"""Generate deterministic OpenAPI without connecting to a dependency."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from veyra.contract_app import app  # noqa: E402
from veyra.registry import CAPABILITIES  # noqa: E402

destination = ROOT / "packages/contracts/openapi.json"
document = app.openapi()
document["info"]["x-contract-status"] = "frozen-phase-01"
destination.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
print(f"Generated {destination.relative_to(ROOT)}")
tools_path = ROOT / "packages/contracts/agent-tools.json"
tools_path.write_text(
    json.dumps([tool.model_dump(mode="json") for tool in CAPABILITIES], indent=2, sort_keys=True)
    + "\n"
)
