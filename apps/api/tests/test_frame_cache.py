"""Preview-frame cache eviction under concurrent requests (no database or media needed)."""

import os

from veyra import explore


def write(path, size):
    path.write_bytes(b"\0" * size)
    return path


def test_eviction_tolerates_files_that_vanish_during_the_scan(tmp_path, monkeypatch):
    kept = write(tmp_path / "a.jpg", 10)
    gone = write(tmp_path / "b.jpg", 10)
    entries = list(os.scandir(tmp_path))
    gone.unlink()  # renamed or evicted by a concurrent request after scandir listed it
    monkeypatch.setattr(explore.os, "scandir", lambda _: iter(entries))
    explore._evict(tmp_path, 1000)
    assert kept.exists()


def test_eviction_never_touches_in_progress_partials(tmp_path):
    partial = write(tmp_path / ".0123abcd.jpg", 500)
    old = write(tmp_path / "old.jpg", 500)
    os.utime(old, ns=(1, 1))
    new = write(tmp_path / "new.jpg", 500)
    explore._evict(tmp_path, 600)
    assert partial.exists() and new.exists() and not old.exists()
