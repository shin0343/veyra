"""Read-only VIDEO-01 evidence, including byte/row preservation against the private backup."""

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import httpx
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]


def table_snapshot(dump, table):
    sql = subprocess.check_output(
        ["pg_restore", "--data-only", "--table", table, "--file=-", str(dump)],
        text=True,
        timeout=30,
    )
    match = re.search(
        r"COPY public\." + table + r" \(([^)]+)\) FROM stdin;\n(.*?)\n\\\.", sql, re.S
    )
    if not match:
        raise ValueError("Missing preservation snapshot")
    return match[1], match[2].splitlines()


def digest_rows(lines):
    return hashlib.sha256(("\n".join(sorted(lines)) + "\n").encode()).hexdigest()


def inspect(runtime, output):
    connection = json.loads((runtime / "connection.json").read_text())
    state = json.loads((runtime / "video01-state.json").read_text())
    backup = ROOT / "runtime/backups/video01-before"
    result = {"checked_at": datetime.now(timezone.utc).isoformat(), "web_url": state["web_url"]}
    with httpx.Client(
        base_url=connection["api_url"],
        trust_env=False,
        timeout=60,
        headers={"Authorization": "Bearer " + connection["operator_token"]},
    ) as client:
        for name, route in {
            "cameras": "/api/v1/cameras",
            "recordings": "/api/v1/recordings?limit=100",
            "layouts": "/api/v1/layouts",
            "usage": "/api/v1/analysis-usage",
            "sources": "/api/v1/camera-sources",
            "ready": "/health/ready",
        }.items():
            response = client.get(route)
            response.raise_for_status()
            result[name] = response.json()
        response = httpx.get(state["web_url"], timeout=10, trust_env=False)
        result["web_status"] = response.status_code
        browser_report = ROOT / "docs/qa/video01/browser.json"
        result["demo_disclosure_verified_in_browser"] = browser_report.is_file() and any(
            item["name"] == "overview" and item["status"] == "passed"
            for item in json.loads(browser_report.read_text())["checks"]
        )
    with psycopg.connect(connection["database_url"], row_factory=dict_row) as db:
        result["migrations"] = db.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall()
        result["counts"] = {
            table: db.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"]
            for table in ["cameras", "layouts", "recordings", "segments", "video_metadata"]
        }
        result["index_states"] = db.execute(
            "SELECT state,count(*) FROM segment_indexes GROUP BY state"
        ).fetchall()
        result["new_observations"] = db.execute(
            """SELECT c.name,c.source_id,r.id AS recording_id,v.id AS metadata_id,v.segment_id,
            s.offset_ms,v.observation_start_ms,v.observation_end_ms,v.summary,v.evidence_text,
            v.objects,v.event_types,v.uncertainty,v.uncertainty_notes,v.model_id,
            v.provenance FROM video_metadata v JOIN segments s ON s.id=v.segment_id
            JOIN recordings r ON r.id=s.recording_id JOIN cameras c ON c.id=r.camera_id
            WHERE r.source_media IS NOT NULL ORDER BY c.source_id,v.observation_start_ms"""
        ).fetchall()
        result["usage_groups"] = db.execute(
            """SELECT operation,state,error_code,count(*),sum(reserved_usd) AS reserved_usd
            FROM model_usage WHERE created_at>=date_trunc('day',now())
            GROUP BY operation,state,error_code ORDER BY operation,state,error_code"""
        ).fetchall()
        phase_start = json.loads((ROOT / "docs/qa/video01/before.json").read_text())["checked_at"]
        result["phase_usage_groups"] = db.execute(
            """SELECT operation,state,error_code,count(*),sum(reserved_usd) AS reserved_usd
            FROM model_usage WHERE created_at >= %s::timestamptz
            GROUP BY operation,state,error_code ORDER BY operation,state,error_code""",
            (phase_start,),
        ).fetchall()
        preserved = {}
        for table, key in [
            ("segments", "id"),
            ("video_metadata", "id"),
            ("layout_cells", "layout_id"),
        ]:
            columns, before = table_snapshot(backup / "demo.dump", table)
            key_index = [value.strip() for value in columns.split(",")].index(key)
            ids = list({UUID(line.split("\t")[key_index]) for line in before})
            with db.cursor().copy(
                f"COPY (SELECT {columns} FROM {table} WHERE {key}=ANY(%s)) TO STDOUT", (ids,)
            ) as copy:
                after = b"".join(copy).decode().splitlines()
            preserved[table] = {
                "before_rows": len(before),
                "after_rows": len(after),
                "before_sha256": digest_rows(before),
                "after_sha256": digest_rows(after),
                "unchanged": digest_rows(before) == digest_rows(after),
            }
        result["preserved_database_rows"] = preserved
    inventory = json.loads((backup / "recordings-inventory.json").read_text())
    missing, changed = [], []
    for item in inventory:
        path = runtime / item["path"]
        if not path.is_file():
            missing.append(item["path"])
        elif path.stat().st_size != item["bytes"] or path.stat().st_mtime_ns != item["mtime_ns"]:
            changed.append(item["path"])
    result["preserved_recording_files"] = {
        "before_file_count": len(inventory),
        "missing": missing,
        "changed_size_or_mtime": changed,
        "original_bytes": sum(i["bytes"] for i in inventory),
    }
    film = ROOT / "runtime/evaluation/dirt-jump-biking.webm"
    with film.open("rb") as stream:
        result["henry_geer_original_sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
    with httpx.Client(trust_env=False, timeout=10) as control:
        origin = f"http://127.0.0.1:{connection['ports']['control']}"
        result["recording_policy"] = []
        for camera in result["cameras"]["items"]:
            if camera["source_media"] and camera["source_media"]["kind"] == "prerecorded":
                source = next(
                    a
                    for a in json.loads((ROOT / "runtime/video-library/library.json").read_text())[
                        "assets"
                    ]
                    if a["source_id"] == camera["source_id"]
                )
                response = control.get(origin + "/v3/config/paths/get/" + source["media_path"])
                response.raise_for_status()
                result["recording_policy"].append(
                    {"source_id": camera["source_id"], "record": response.json()["record"]}
                )
    result["build_id"] = (ROOT / "apps/web/.next/BUILD_ID").read_text().strip()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, default=str) + "\n")
    if (
        missing
        or changed
        or not all(p["unchanged"] for p in preserved.values())
        or result["henry_geer_original_sha256"]
        != "68b94c8a7c38755b0394af728ac7f83446bef607d1faa37c38047f389870ddfb"
    ):
        raise RuntimeError("Preservation check failed; inspect the evidence")
    print(
        json.dumps(
            {
                "status": "passed",
                "counts": result["counts"],
                "usage": result["usage"],
                "preserved_rows": {k: v["before_rows"] for k, v in preserved.items()},
                "preserved_files": len(inventory),
            }
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=ROOT / "runtime/demo")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/qa/video01/after.json")
    args = parser.parse_args()
    inspect(args.runtime, args.output)


if __name__ == "__main__":
    main()
