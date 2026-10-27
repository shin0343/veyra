"""Small checksum-verified, transactional SQL migration runner."""

import hashlib
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from veyra.settings import get_settings  # noqa: E402


def migrate():
    with psycopg.connect(get_settings().database_url.get_secret_value(), connect_timeout=5) as db:
        db.execute("SELECT pg_advisory_xact_lock(9102601)")
        db.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
            version text PRIMARY KEY, sha256 text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now())""")
        for path in sorted((ROOT / "infra/migrations").glob("*.sql")):
            sql = path.read_text()
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            existing = db.execute(
                "SELECT sha256 FROM schema_migrations WHERE version = %s", (path.stem,)
            ).fetchone()
            if existing:
                if existing[0] != checksum:
                    raise RuntimeError(f"Applied migration changed: {path.name}")
                print(f"Already applied: {path.stem}")
                continue
            db.execute(sql)
            db.execute(
                "INSERT INTO schema_migrations (version, sha256) VALUES (%s, %s)",
                (path.stem, checksum),
            )
            print(f"Applied: {path.stem}")


if __name__ == "__main__":
    migrate()
