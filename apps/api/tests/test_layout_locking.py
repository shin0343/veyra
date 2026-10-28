"""Layout saves vs. concurrent camera status reconciliation on isolated PostgreSQL.

Regression for the release-candidate 503 DATABASE_UNAVAILABLE (DeadlockDetected): the media
reconciler updates every camera row in one transaction while a layout save share-locked the
same rows in arbitrary order.
"""

# ruff: noqa: F811
import random
import threading
import time

import psycopg
import pytest
from psycopg.rows import dict_row
from test_agent_integration import agent_env, postgres_url  # noqa: F401
from veyra import contracts as c
from veyra import store
from veyra.db import Problem


def connect(url, lock_timeout="2s"):
    db = psycopg.connect(url, row_factory=dict_row)
    db.execute(f"SET lock_timeout='{lock_timeout}'")
    return db


def reconcile_status(db, camera_id):
    # The exact statement MediaPipeline.once() issues for every camera each tick.
    db.execute(
        """UPDATE cameras SET status=%s,connection_error_code=%s,
        last_observed_at=CASE WHEN %s THEN %s ELSE last_observed_at END WHERE id=%s""",
        ("online", None, True, None, camera_id),
    )


def layout(ids, name="Locking"):
    return c.LayoutCreate(
        name=name, columns=2, cells=[{"camera_id": i, "position": n} for n, i in enumerate(ids)]
    )


def test_layout_save_does_not_wait_for_an_open_status_update(agent_env):
    _, database, cameras = agent_env
    ids = [camera["id"] for camera in cameras[:2]]
    pipeline, saver = connect(database.url), connect(database.url)
    try:
        reconcile_status(pipeline, ids[0])  # reconciler transaction still open
        status, body, _ = store.save_layout(saver, layout(list(reversed(ids))))
        saver.commit()
        assert status == 201 and [cell["camera_id"] for cell in body["cells"]] == ids[::-1]
        reconcile_status(pipeline, ids[1])
        pipeline.commit()
    finally:
        pipeline.close()
        saver.close()


def test_status_update_does_not_wait_for_an_open_layout_save(agent_env):
    _, database, cameras = agent_env
    ids = [camera["id"] for camera in cameras[:3]]
    pipeline, saver = connect(database.url), connect(database.url)
    try:
        store.save_layout(saver, layout(ids))  # layout transaction still open
        for camera_id in ids:
            reconcile_status(pipeline, camera_id)
        pipeline.commit()
        saver.commit()
    finally:
        pipeline.close()
        saver.close()


def test_camera_delete_still_serializes_with_an_open_layout_save(agent_env):
    _, database, cameras = agent_env
    camera_id = cameras[0]["id"]
    saver, deleter = connect(database.url), connect(database.url, "500ms")
    try:
        store.save_layout(saver, layout([camera_id]))
        with pytest.raises(psycopg.errors.LockNotAvailable):
            store.delete_camera(deleter, camera_id)
        deleter.rollback()
        saver.commit()
        with pytest.raises(Problem) as problem:
            store.delete_camera(deleter, camera_id)
        assert problem.value.code == "CAMERA_IN_USE"
    finally:
        saver.close()
        deleter.close()


def test_concurrent_layout_saves_and_reconciliation_never_deadlock(agent_env):
    _, database, cameras = agent_env
    ids = [camera["id"] for camera in cameras]
    stop, errors, saved, ticks = threading.Event(), [], [], [0]
    # Restored snapshots do not keep heap order equal to creation order; reverse it so the
    # reconciler's (created_at,id) order differs from a plain id=ANY() scan.
    with database.connect() as db:
        for age, camera_id in enumerate(ids):
            db.execute(
                "UPDATE cameras SET created_at=now()-make_interval(secs=>%s) WHERE id=%s",
                (age, camera_id),
            )

    def reconciler():
        with connect(database.url, "10s") as db:
            while not stop.is_set():
                try:
                    order = db.execute("SELECT id FROM cameras ORDER BY created_at,id").fetchall()
                    for row in order:
                        reconcile_status(db, row["id"])
                        time.sleep(0.002)
                    db.commit()
                    ticks[0] += 1
                except psycopg.Error as error:
                    db.rollback()
                    errors.append(type(error).__name__)

    def saver(seed):
        rng = random.Random(seed)
        with connect(database.url, "10s") as db:
            current = None
            while not stop.is_set():
                chosen = rng.sample(ids, rng.randint(2, len(ids)))
                body = layout(chosen, f"Stress {seed}")
                try:
                    if current is None:  # one POST, then PUTs: stays under the layout cap
                        _, current, _ = store.save_layout(db, body)
                    else:
                        replace = c.LayoutReplace(
                            **body.model_dump(), expected_version=current["version"]
                        )
                        _, current, _ = store.save_layout(db, replace, current["id"])
                    db.commit()
                    saved.append(1)
                except psycopg.Error as error:
                    db.rollback()
                    errors.append(type(error).__name__)

    def agent_locker():
        with connect(database.url, "10s") as db:
            while not stop.is_set():
                try:
                    store.share_cameras(db, list(reversed(ids)))
                    time.sleep(0.002)
                    db.commit()
                except psycopg.Error as error:
                    db.rollback()
                    errors.append(type(error).__name__)

    threads = [threading.Thread(target=reconciler), threading.Thread(target=agent_locker)]
    threads += [threading.Thread(target=saver, args=(n,)) for n in range(3)]
    for thread in threads:
        thread.start()
    time.sleep(4)
    stop.set()
    for thread in threads:
        thread.join(15)
    assert errors == [] and len(saved) > 20 and ticks[0] > 20, (errors[:5], len(saved), ticks)
    with database.connect() as db:
        versions = db.execute(
            "SELECT name,version FROM layouts WHERE name LIKE 'Stress %%' ORDER BY name"
        ).fetchall()
        orphans = db.execute(
            """SELECT count(*) AS n FROM layout_cells lc LEFT JOIN cameras c
            ON c.id=lc.camera_id WHERE c.id IS NULL OR c.deleted_at IS NOT NULL"""
        ).fetchone()["n"]
    assert len(versions) == 3 and sum(row["version"] for row in versions) == len(saved)
    assert orphans == 0
