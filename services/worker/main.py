"""Run from repository root: .venv/bin/python -E services/worker/main.py."""

import signal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps/api"))
from veyra.config import Settings  # noqa: E402
from veyra.db import Database  # noqa: E402
from veyra.index_worker import Worker  # noqa: E402


def main():
    settings = Settings()
    worker = Worker(settings, Database(settings.database_url.get_secret_value()))
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: worker.stop_event.set())
    worker.run()


if __name__ == "__main__":
    main()
