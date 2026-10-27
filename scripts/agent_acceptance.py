"""Run actual isolated-PostgreSQL agent acceptance; identify scripted vs genuine Muse evidence."""

import argparse
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-live",
        action="store_true",
        help="Fail the acceptance command unless the genuine Muse-to-database test passes.",
    )
    args = parser.parse_args()
    observed = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    runtime = ROOT / "runtime/agent-phase04" / observed
    runtime.mkdir(parents=True, exist_ok=True)
    xml = runtime / "tests.xml"
    env = {**os.environ, "VEYRA_AGENT_EVIDENCE": str(runtime)}
    result = subprocess.run(
        [
            sys.executable,
            "-E",
            "-m",
            "pytest",
            "-q",
            "apps/api/tests/test_meta_agent.py",
            "apps/api/tests/test_agent_integration.py",
            f"--junitxml={xml}",
        ],
        cwd=ROOT,
        env=env,
    )
    report = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "status": "failed",
        "scope": "PostgreSQL + actual REST/application tools; "
        "scripted Meta HTTP except explicitly named genuine test",
        "live_meta": {"status": "not_run"},
        "tests": [],
    }
    if xml.exists():
        for case in ET.parse(xml).iter("testcase"):
            status = (
                "failed"
                if case.find("failure") is not None or case.find("error") is not None
                else "skipped"
                if case.find("skipped") is not None
                else "passed"
            )
            item = {"name": case.attrib["name"], "status": status}
            if case.find("skipped") is not None:
                item["reason"] = case.find("skipped").attrib.get("message", "")
            report["tests"].append(item)
            if "genuine_muse" in item["name"]:
                report["live_meta"] = item
        report["passed"] = sum(item["status"] == "passed" for item in report["tests"])
        report["skipped"] = sum(item["status"] == "skipped" for item in report["tests"])
        report["failed"] = sum(item["status"] == "failed" for item in report["tests"])
        integration = next(
            (
                item
                for item in report["tests"]
                if item["name"] == "test_real_layout_creation_confirmation_persistence_and_audit"
            ),
            None,
        )
        report["backend_acceptance"] = integration["status"] if integration else "not_run"
        report["status"] = (
            "passed"
            if result.returncode == 0 and report["backend_acceptance"] == "passed"
            else "failed"
        )
    for filename in ("scripted-layout.json", "live-layout.json"):
        path = runtime / filename
        if path.exists():
            report[filename.removesuffix(".json")] = json.loads(path.read_text())
    report["full_acceptance_gate"] = (
        "passed"
        if report["status"] == "passed" and report["live_meta"]["status"] == "passed"
        else "failed"
        if report["status"] == "failed" or report["live_meta"]["status"] == "failed"
        else "unverified"
    )
    report["require_live"] = args.require_live
    destination = ROOT / "docs/evidence/agent-phase04.json"
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(
        json.dumps(
            {
                key: value
                for key, value in report.items()
                if key not in {"tests", "scripted-layout", "live-layout"}
            },
            indent=2,
        )
    )
    if result.returncode:
        return result.returncode
    if args.require_live and report["full_acceptance_gate"] != "passed":
        print("Live acceptance gate did not pass; scripted-provider tests are insufficient.")
        return 1
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
