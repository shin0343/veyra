"""Scan committable files and browser bundles without printing private credentials."""

import json
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.config import Settings  # noqa: E402


def main():
    settings = Settings()
    secrets = [
        getattr(settings, field).get_secret_value()
        for field in (
            "model_api_key",
            "veyra_dev_token",
            "veyra_viewer_token",
            "mediamtx_hls_secret",
        )
    ]
    for path in (ROOT / "runtime/q7").glob("*/connection.json"):
        private = json.loads(path.read_text())
        secrets.extend(private.get(key, "") for key in ("operator_token", "viewer_token"))
    needles = [
        value.encode() for value in secrets if len(value) >= 16 and not value.startswith("replace-")
    ]
    files = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout.split(b"\0")
    matches, scanned = [], 0
    for value in files:
        path = ROOT / value.decode()
        if not value or not path.is_file():
            continue
        scanned += 1
        if any(needle in path.read_bytes() for needle in needles):
            matches.append(str(path.relative_to(ROOT)))
    bundles = [p for p in (ROOT / "apps/web/.next/static").rglob("*") if p.is_file()]
    bundle_matches = [
        str(path.relative_to(ROOT))
        for path in bundles
        if any(needle in path.read_bytes() for needle in [*needles, b"MODEL_API_KEY"])
    ]
    report = {
        "known_secret_values_checked": len(needles),
        "committable_files_scanned": scanned,
        "committable_matches": matches,
        "browser_bundle_files_scanned": len(bundles),
        "browser_bundle_matches": bundle_matches,
        "private_env_mode": oct(stat.S_IMODE((ROOT / ".env").stat().st_mode)),
        "scope": "exact known credentials and server key identifier; not entropy scanning",
        "status": "passed" if not matches and not bundle_matches else "failed",
    }
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
