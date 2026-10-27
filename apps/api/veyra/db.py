import hashlib
import json
from contextlib import contextmanager
from datetime import timezone
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class Problem(Exception):
    def __init__(self, status, code, message, retryable=False):
        self.status, self.code, self.message, self.retryable = status, code, message, retryable


class Database:
    def __init__(self, url):
        self.url = url

    @contextmanager
    def connect(self):
        with psycopg.connect(
            self.url,
            row_factory=dict_row,
            connect_timeout=3,
            options="-c timezone=UTC -c statement_timeout=5000",
        ) as db:
            yield db

    def mutate(self, principal, operation, key, payload, callback):
        fingerprint = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        with self.connect() as db:
            db.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (f"{principal}:{operation}:{key}",),
            )
            existing = db.execute(
                """DELETE FROM idempotency_keys WHERE principal_id=%s AND operation=%s
                AND key=%s AND created_at <= now()-interval '24 hours'""",
                (principal, operation, key),
            )
            existing = db.execute(
                """SELECT * FROM idempotency_keys
                WHERE principal_id=%s AND operation=%s AND key=%s""",
                (principal, operation, key),
            ).fetchone()
            if existing:
                if existing["request_sha256"] != fingerprint:
                    raise Problem(409, "IDEMPOTENCY_CONFLICT", "This request key was already used.")
                return existing["response_status"], existing["response_body"]
            status, body, resource_id = callback(db)
            db.execute(
                """INSERT INTO idempotency_keys
                (principal_id,operation,key,request_sha256,response_status,response_body)
                VALUES (%s,%s,%s,%s,%s,%s)""",
                (principal, operation, key, fingerprint, status, Jsonb(body)),
            )
            db.execute(
                """INSERT INTO vms_audit(id,principal_id,operation,resource_id)
                VALUES (%s,%s,%s,%s)""",
                (uuid4(), principal, operation, resource_id),
            )
            return status, body


def utc(value):
    return value.astimezone(timezone.utc)
