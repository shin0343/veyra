import base64
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from . import contracts as c
from . import models as m
from .db import Problem


def camera_model(row):
    status = row["status"]
    observed = row["last_observed_at"]
    code = row["connection_error_code"]
    if row["enabled"] and (
        observed is None or datetime.now(timezone.utc) - observed > timedelta(seconds=10)
    ):
        status = "unknown"
    return m.Camera(
        **{
            key: row[key]
            for key in (
                "id",
                "name",
                "source_id",
                "enabled",
                "cloud_analysis_allowed",
                "last_observed_at",
                "created_at",
                "group_name",
                "location",
            )
        },
        status=status,
        source_media=row.get("source_media"),
        connection_error=c.ErrorDetail(
            code=code,
            message={
                "UNSUPPORTED_CODEC": "Use an H264 camera stream with AAC audio or no audio.",
                "SOURCE_OFFLINE": "The camera is not providing a stream. Check its connection.",
                "SOURCE_NOT_CONFIGURED": "The camera's approved source is not configured.",
                "EGRESS_GUARD_REQUIRED": "Install the camera destination policy before RTSP pull.",
            }.get(code, "The media service is unavailable."),
            retryable=code == "MEDIA_UNAVAILABLE",
        )
        if code
        else None,
    )


def get_camera(db, camera_id, include_deleted=False):
    row = db.execute(
        "SELECT * FROM cameras WHERE id=%s"
        + ("" if include_deleted else " AND deleted_at IS NULL"),
        (camera_id,),
    ).fetchone()
    if not row:
        raise Problem(404, "NOT_FOUND", "This camera is not available.")
    return row


def list_cameras(db):
    return db.execute(
        """SELECT * FROM cameras WHERE deleted_at IS NULL
        ORDER BY enabled DESC, (source_media->>'kind'='prerecorded') DESC NULLS LAST,
        created_at,id LIMIT 16"""
    ).fetchall()


def create_camera(db, body, registry):
    # Lock capacity and uniqueness checks, including concurrent registrations with different keys.
    db.execute("SELECT pg_advisory_xact_lock(9102602)")
    source = registry.get(body.source_id)
    if source is None:
        raise Problem(422, "SOURCE_NOT_APPROVED", "Choose an approved camera source.")
    if source["mode"] == "pull" and not registry.pull_guarded():
        raise Problem(403, "EGRESS_GUARD_REQUIRED", "Install the camera destination policy first.")
    if db.execute(
        "SELECT 1 FROM cameras WHERE source_id=%s AND deleted_at IS NULL", (body.source_id,)
    ).fetchone():
        raise Problem(409, "SOURCE_IN_USE", "This camera source is already registered.")
    if (
        db.execute("SELECT count(*) AS n FROM cameras WHERE deleted_at IS NULL").fetchone()["n"]
        >= 16
    ):
        raise Problem(409, "CAMERA_LIMIT", "This workspace supports up to 16 cameras.")
    camera_id = uuid4()
    path = source["path"] if source["mode"] == "publisher" else f"cam_{camera_id.hex}"
    row = db.execute(
        """INSERT INTO cameras
        (id,name,source_id,media_path,cloud_analysis_allowed,group_name,location,source_media)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (
            camera_id,
            body.name,
            body.source_id,
            path,
            body.cloud_analysis_allowed,
            body.group_name,
            body.location,
            Jsonb(source["source_media"]) if source.get("source_media") else None,
        ),
    ).fetchone()
    return 201, camera_model(row).model_dump(mode="json"), camera_id


def update_camera(db, camera_id, body):
    get_camera(db, camera_id)
    values = body.model_dump(exclude_unset=True)
    # Keys originate only from validated Pydantic fields, never user SQL.
    assignments = [f"{key}=%s" for key in values]
    if "enabled" in values:
        assignments.extend(["status=%s", "connection_error_code=NULL"])
    params = list(values.values())
    if "enabled" in values:
        params.append("unknown" if values["enabled"] else "disabled")
    params.append(camera_id)
    row = db.execute(
        f"UPDATE cameras SET {','.join(assignments)} WHERE id=%s RETURNING *", params
    ).fetchone()
    return 200, camera_model(row).model_dump(mode="json"), camera_id


def delete_camera(db, camera_id):
    row = db.execute(
        "SELECT id FROM cameras WHERE id=%s AND deleted_at IS NULL FOR UPDATE", (camera_id,)
    ).fetchone()
    if not row:
        raise Problem(404, "NOT_FOUND", "This camera is not available.")
    if db.execute("SELECT 1 FROM layout_cells WHERE camera_id=%s", (camera_id,)).fetchone():
        raise Problem(409, "CAMERA_IN_USE", "Remove this camera from saved layouts first.")
    db.execute(
        """UPDATE cameras SET deleted_at=now(),enabled=false,status='disabled'
        WHERE id=%s""",
        (camera_id,),
    )
    db.execute("DELETE FROM media_sessions WHERE camera_id=%s AND kind='live'", (camera_id,))
    return 204, None, camera_id


def layout_model(db, row):
    cells = db.execute(
        """SELECT position,camera_id FROM layout_cells WHERE layout_id=%s
                       ORDER BY position""",
        (row["id"],),
    ).fetchall()
    return c.Layout(**row, cells=[c.LayoutCell(**cell) for cell in cells])


def get_layout(db, layout_id):
    row = db.execute("SELECT * FROM layouts WHERE id=%s", (layout_id,)).fetchone()
    if not row:
        raise Problem(404, "NOT_FOUND", "This saved layout is not available.")
    return layout_model(db, row)


def list_layouts(db):
    return [
        layout_model(db, row)
        for row in db.execute(
            "SELECT * FROM layouts ORDER BY updated_at DESC,id LIMIT 100"
        ).fetchall()
    ]


def save_layout(db, body, layout_id=None):
    db.execute("SELECT pg_advisory_xact_lock(9102603)")
    if not body.name.strip():
        raise Problem(422, "VALIDATION_ERROR", "Choose a name for this layout.")
    ids = [cell.camera_id for cell in body.cells]
    valid = db.execute(
        """SELECT id FROM cameras WHERE id=ANY(%s) AND deleted_at IS NULL
                       FOR SHARE""",
        (ids,),
    ).fetchall()
    if len(valid) != len(ids):
        raise Problem(404, "NOT_FOUND", "A selected camera is not available.")
    created = layout_id is None
    if created:
        if db.execute("SELECT count(*) AS n FROM layouts").fetchone()["n"] >= 100:
            raise Problem(409, "LAYOUT_LIMIT", "This workspace supports up to 100 layouts.")
        layout_id = uuid4()
        db.execute(
            "INSERT INTO layouts(id,name,columns) VALUES (%s,%s,%s)",
            (layout_id, body.name.strip(), body.columns),
        )
    else:
        row = db.execute("SELECT * FROM layouts WHERE id=%s FOR UPDATE", (layout_id,)).fetchone()
        if not row:
            raise Problem(404, "NOT_FOUND", "This saved layout is not available.")
        if row["version"] != body.expected_version:
            raise Problem(409, "VERSION_CONFLICT", "Reload this layout before saving changes.")
        db.execute(
            """UPDATE layouts SET name=%s,columns=%s,version=version+1,updated_at=now()
            WHERE id=%s""",
            (body.name.strip(), body.columns, layout_id),
        )
        db.execute("DELETE FROM layout_cells WHERE layout_id=%s", (layout_id,))
    for cell in body.cells:
        db.execute(
            "INSERT INTO layout_cells(layout_id,position,camera_id) VALUES (%s,%s,%s)",
            (layout_id, cell.position, cell.camera_id),
        )
    return (201 if created else 200), get_layout(db, layout_id).model_dump(mode="json"), layout_id


def recording_model(row):
    return m.Recording(
        **{key: row[key] for key in c.Recording.model_fields},
        source_media=row.get("source_media"),
    )


def get_recording(db, recording_id):
    row = db.execute(
        """SELECT r.*,c.media_path FROM recordings r JOIN cameras c ON c.id=r.camera_id
        WHERE r.id=%s AND r.status!='deleted'""",
        (recording_id,),
    ).fetchone()
    if not row:
        raise Problem(404, "RECORDING_UNAVAILABLE", "This recording is not available.")
    return row


def validate_window(start, end):
    if start and end and (start >= end or end - start > timedelta(days=1)):
        raise Problem(422, "INVALID_TIME_RANGE", "Choose an ordered window of at most 24 hours.")


def list_recordings(db, camera_id, start, end, cursor, limit):
    validate_window(start, end)
    clauses, params = ["status!='deleted'"], []
    if camera_id:
        clauses.append("camera_id=%s")
        params.append(camera_id)
    if start:
        clauses.append("COALESCE(ended_at,now()) > %s")
        params.append(start)
    if end:
        clauses.append("started_at < %s")
        params.append(end)
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            position = datetime.fromisoformat(decoded["at"])
            if position.tzinfo is None:
                raise ValueError
            clauses.append("(started_at,id)<(%s,%s)")
            params.extend([position, UUID(decoded["id"])])
        except (ValueError, KeyError, TypeError):
            raise Problem(422, "VALIDATION_ERROR", "This recording cursor is invalid.") from None
    rows = db.execute(
        f"""SELECT * FROM recordings WHERE {" AND ".join(clauses)}
                       ORDER BY started_at DESC,id DESC LIMIT %s""",
        [*params, limit + 1],
    ).fetchall()
    next_cursor = None
    if len(rows) > limit:
        row = rows[limit - 1]
        next_cursor = base64.urlsafe_b64encode(
            json.dumps({"at": row["started_at"].isoformat(), "id": str(row["id"])}).encode()
        ).decode()
    return m.RecordingList(
        items=[recording_model(row) for row in rows[:limit]], next_cursor=next_cursor
    )
