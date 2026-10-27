"""Check the web Docker COPY inputs with the real TypeScript compiler, without Docker.

Reproduces the previous missing-contract failure, then checks the corrected inputs.
This does not build or execute a container, install dependencies, or verify Linux networking.
"""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="veyra-web-context-") as temporary:
        stage = Path(temporary)
        shutil.copytree(
            ROOT / "apps/web",
            stage / "apps/web",
            ignore=shutil.ignore_patterns("node_modules", ".next", "*.tsbuildinfo", ".env*"),
        )
        shutil.copytree(ROOT / "packages/contracts", stage / "packages/contracts")
        (stage / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        # Next generates these during its build. Reuse only generated route declarations.
        shutil.copytree(ROOT / "apps/web/.next/types", stage / "apps/web/.next/types")
        command = [
            str(ROOT / "node_modules/.bin/tsc"),
            "--noEmit",
            "--incremental",
            "false",
            "-p",
            str(stage / "apps/web/tsconfig.json"),
        ]
        before = subprocess.run(command, capture_output=True, text=True)
        reproduced = before.returncode != 0 and "@veyra/runtime-contract" in before.stdout
        destination = stage / "docs/architecture/api-phase05.d.ts"
        destination.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / "docs/architecture/api-phase05.d.ts", destination)
        after = subprocess.run(command, capture_output=True, text=True)
        copy_present = (
            "COPY docs/architecture/api-phase05.d.ts" in (ROOT / "infra/web.Dockerfile").read_text()
        )
        report = {
            "scope": "native TypeScript over staged Docker source inputs; not a container",
            "old_missing_contract_reproduced": reproduced,
            "corrected_inputs_typecheck_exit_code": after.returncode,
            "dockerfile_copy_present": copy_present,
            "status": "passed"
            if reproduced and after.returncode == 0 and copy_present
            else "failed",
        }
        print(json.dumps(report, indent=2))
        return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
