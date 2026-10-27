"""Record actual Phase 05 checks. A skipped live dependency never passes the live gate."""

import argparse
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.config import Settings  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-live", action="store_true")
    parser.add_argument("--mediamtx", default="/tmp/veyra-mediamtx/mediamtx")
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    runtime = ROOT / "runtime/index-evaluation" / stamp
    runtime.mkdir(parents=True, exist_ok=True)
    xml = runtime / "tests.xml"
    tests = subprocess.run(
        [
            sys.executable,
            "-E",
            "-m",
            "pytest",
            "-q",
            "apps/api/tests/test_indexing.py",
            f"--junitxml={xml}",
        ],
        cwd=ROOT,
        env={
            **os.environ,
            "VEYRA_INDEX_EVIDENCE": str(runtime),
            "VEYRA_RUN_LIVE_INDEX": "1" if args.require_live else "0",
        },
    )
    report = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "scope": "licensed real media, actual FFmpeg/PostgreSQL; provider is explicitly scripted",
        "backend_status": "passed" if tests.returncode == 0 else "failed",
        "live_meta": {"status": "unverified"},
        "native": {"status": "not_run"},
        "tests": [],
    }
    if xml.exists():
        for case in ET.parse(xml).iter("testcase"):
            report["tests"].append(
                {
                    "name": case.attrib["name"],
                    "seconds": float(case.attrib["time"]),
                    "status": "failed"
                    if case.find("failure") is not None or case.find("error") is not None
                    else "skipped"
                    if case.find("skipped") is not None
                    else "passed",
                }
            )
    path = runtime / "scripted-index.json"
    if path.exists():
        report["scripted_integration"] = json.loads(path.read_text())
    evaluation = runtime / "live-evaluation.json"
    report["genuine_ai_quality"] = (
        json.loads(evaluation.read_text()) if evaluation.exists() else None
    )
    if tests.returncode == 0 and Path(args.mediamtx).is_file():
        native = subprocess.run(
            [
                sys.executable,
                "-E",
                str(ROOT / "scripts/index_native.py"),
                "--mediamtx",
                args.mediamtx,
            ],
            cwd=ROOT,
        )
        evidence = ROOT / "docs/evidence/index-native-phase05.json"
        report["native"] = (
            json.loads(evidence.read_text()) if native.returncode == 0 else {"status": "failed"}
        )
    elif not Path(args.mediamtx).is_file():
        report["native"] = {"status": "unverified", "reason": "MediaMTX binary absent"}
    settings = Settings()
    if args.require_live and tests.returncode == 0:
        live = subprocess.run(
            [
                sys.executable,
                "-E",
                str(ROOT / "scripts/index_native.py"),
                "--mediamtx",
                args.mediamtx,
                "--live",
            ],
            cwd=ROOT,
        )
        path = ROOT / "docs/evidence/index-live-phase05.json"
        if path.exists():
            report["live_meta"] = json.loads(path.read_text())
        if live.returncode and report["live_meta"]["status"] == "passed":
            report["live_meta"] = {"status": "failed"}
    else:
        report["live_meta"] = {
            "status": "unverified",
            "reason": "MODEL_API_KEY absent"
            if not settings.model_api_key.get_secret_value()
            else "Explicit --require-live was not requested; no paid inference executed",
        }
    report["full_acceptance_gate"] = (
        "passed"
        if all(report[key]["status"] == "passed" for key in ("native", "live_meta"))
        and report["backend_status"] == "passed"
        and report["genuine_ai_quality"] is not None
        else "failed"
        if report["backend_status"] == "failed"
        or any(report[key]["status"] == "failed" for key in ("native", "live_meta"))
        else "unverified"
    )
    report["actual_api_cost_usd"] = None
    destination = ROOT / "docs/evidence/index-phase05.json"
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(
        json.dumps(
            {
                "backend": report["backend_status"],
                "native": report["native"]["status"],
                "live_meta": report["live_meta"]["status"],
                "full_acceptance_gate": report["full_acceptance_gate"],
            },
            indent=2,
        )
    )
    return (
        1
        if tests.returncode
        or report["native"]["status"] != "passed"
        or (args.require_live and report["full_acceptance_gate"] != "passed")
        else 0
    )


if __name__ == "__main__":
    raise SystemExit(main())
