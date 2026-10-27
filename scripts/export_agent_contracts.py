"""Generate/check current Phase 05 contracts, preserving frozen and historical artifacts."""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.agent_tools import TOOLS  # noqa: E402
from veyra.main import app  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    directory = ROOT / "docs/architecture"
    document = app.openapi()
    document["info"]["x-contract-status"] = "phase-05-video-indexing"
    artifacts = {
        "openapi-phase05.json": json.dumps(document, indent=2, sort_keys=True) + "\n",
        "agent-tools-phase05.json": json.dumps(
            [tool.public().model_dump(mode="json") for tool in TOOLS.values()],
            indent=2,
            sort_keys=True,
        )
        + "\n",
    }
    with tempfile.TemporaryDirectory(prefix="veyra-agent-contract-") as temporary:
        source, target = Path(temporary) / "openapi.json", Path(temporary) / "api.d.ts"
        source.write_text(artifacts["openapi-phase05.json"])
        subprocess.run(
            [str(ROOT / "node_modules/.bin/openapi-typescript"), str(source), "-o", str(target)],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        artifacts["api-phase05.d.ts"] = target.read_text()
    for name, content in artifacts.items():
        path = directory / name
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(
                    f"Runtime contract drift: {name}; run scripts/export_agent_contracts.py"
                )
        else:
            path.write_text(content)
    print(
        "Phase 05 runtime OpenAPI, TypeScript and executable tool catalog "
        + ("match" if args.check else "generated")
    )


if __name__ == "__main__":
    main()
