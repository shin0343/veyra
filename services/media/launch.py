"""Forward media lifecycle signals and redact RTSP URLs from upstream diagnostics."""

import re
import signal
import subprocess

child = subprocess.Popen(
    ["/mediamtx", "/mediamtx.yml"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
)
for sig in [signal.SIGINT, signal.SIGTERM]:
    signal.signal(sig, lambda signum, frame: child.send_signal(signum))
for line in child.stdout:
    print(re.sub(r"rtsps?://[^\s\"']+", "rtsp://[redacted]", line), end="", flush=True)
raise SystemExit(child.wait())
