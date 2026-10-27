"""Fixed MediaMTX completion hook. Reads environment; never interpolates a camera command."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def finalize():
    root = Path(os.environ["RECORDINGS_ROOT"]).resolve(strict=True)
    original = Path(os.environ["MTX_SEGMENT_PATH"])
    path = original.resolve(strict=True)
    if not path.is_relative_to(root) or path.suffix != ".mp4" or original.is_symlink():
        raise ValueError("Recording is outside the recording root")
    # File names are MediaMTX capture times, never model or request timestamps.
    started_at = datetime.strptime(path.stem, "%Y-%m-%d_%H-%M-%S-%f_%z")
    marker = {
        "storage_key": path.relative_to(root).as_posix(),
        "media_path": os.environ["MTX_PATH"],
        "started_at": started_at.astimezone(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    target = path.with_suffix(".done.json")
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, suffix=".tmp", delete=False) as f:
        json.dump(marker, f)
        temporary = Path(f.name)
    temporary.replace(target)


if __name__ == "__main__":
    try:
        finalize()
    except (ValueError, OSError, KeyError):
        # Deliberately omit environment values and filenames from media logs.
        print('{"event":"segment_finalization_failed"}', flush=True)
        raise SystemExit(1) from None
