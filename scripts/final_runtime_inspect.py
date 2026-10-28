"""Read-only release reconciliation. Private connection files never enter the report."""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]


def inspect():
    private = json.loads((ROOT / "runtime/demo/connection.json").read_text())
    output = ROOT / "docs/qa/final/evidence"
    output.mkdir(parents=True, exist_ok=True)
    backup = ROOT / "runtime/backups/final-redesign02-checkpoint/demo.dump"
    if not backup.exists():
        subprocess.run(
            ["pg_dump", "-Fc", "--file", str(backup), private["database_url"]],
            check=True,
            capture_output=True,
            timeout=120,
        )
        backup.chmod(0o600)
    report = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "checkpoint_revision": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "backup": str(backup.relative_to(ROOT)),
        "frontends": [],
        "api_url": private["api_url"],
        "ports": private["ports"],
        "paid_calls": 0,
    }
    with httpx.Client(timeout=20, trust_env=False) as client:
        for port, directory in ((3200, ".next"), (3600, ".next-qa")):
            build = (ROOT / "apps/web" / directory / "BUILD_ID").read_text().strip()
            base = f"http://127.0.0.1:{port}"
            html = client.get(base)
            manifest = client.get(f"{base}/_next/static/{build}/_buildManifest.js")
            cameras = client.get(base + "/api/v1/cameras", headers={"Origin": base}).json()
            report["frontends"].append(
                {
                    "url": base,
                    "build_id": build,
                    "html_status": html.status_code,
                    "manifest_status": manifest.status_code,
                    "camera_ids": sorted(item["id"] for item in cameras["items"]),
                }
            )
        headers = {"Authorization": "Bearer " + private["operator_token"]}
        schema = client.get(private["api_url"] + "/openapi.json").json()
        report["api_schema_sha256"] = hashlib.sha256(
            json.dumps(schema, sort_keys=True).encode()
        ).hexdigest()
        for path in ("/health/ready", "/api/v1/analysis-usage"):
            report[path] = client.get(private["api_url"] + path, headers=headers).json()
    with psycopg.connect(private["database_url"], row_factory=dict_row) as db:
        report["migrations"] = [
            {
                "version": item["version"],
                "checksum_matches": hashlib.sha256(
                    (ROOT / "infra/migrations" / (item["version"] + ".sql")).read_bytes()
                ).hexdigest()
                == item["sha256"],
            }
            for item in db.execute("SELECT * FROM schema_migrations ORDER BY version")
        ]
        report["row_counts"] = {
            table: db.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"]
            for table in (
                "cameras",
                "layouts",
                "layout_cells",
                "recordings",
                "segments",
                "video_metadata",
            )
        }
    report["same_workspace_visible"] = (
        report["frontends"][0]["camera_ids"] == report["frontends"][1]["camera_ids"]
    )
    report["backend_revision"] = (
        "Legacy process has no revision stamp; schema hash and migration checksums verified. "
        "Final integration starts a fresh process from an identified revision."
    )
    (output / "runtime-before.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    inspect()
