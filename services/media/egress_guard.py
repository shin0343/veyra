"""Install container OUTPUT rules before MediaMTX starts; no shell or client commands."""

import ipaddress
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps/api"))
from veyra.source_policy import validate_rtsp_source  # noqa: E402


def approved_targets(sources_json, cidrs, ports):
    sources = json.loads(sources_json)
    targets = set()
    for source in sources.values():
        if source.get("mode") != "pull":
            raise ValueError("Only pull sources belong in operator configuration")
        url = source["url"]
        validate_rtsp_source(url, cidrs)
        parsed = urlsplit(url)
        port = parsed.port or 554
        if port not in ports:
            raise ValueError("Source port is not approved")
        targets.add((str(ipaddress.ip_address(parsed.hostname)), port))
    return sorted(targets)


def install(targets, run=subprocess.run):
    for family, binary in [(4, "iptables"), (6, "ip6tables")]:

        def command(*args):
            run([binary, "-w", *args], check=True, capture_output=True, timeout=5)

        # Default deny takes effect before removing any previous rules.
        command("-P", "OUTPUT", "DROP")
        command("-F", "OUTPUT")
        command(
            "-A", "OUTPUT", "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT"
        )
        for address, port in targets:
            if ipaddress.ip_address(address).version == family:
                command(
                    "-A",
                    "OUTPUT",
                    "-p",
                    "tcp",
                    "-d",
                    address,
                    "--dport",
                    str(port),
                    "-m",
                    "conntrack",
                    "--ctstate",
                    "NEW",
                    "-j",
                    "ACCEPT",
                )


def main():
    marker = Path(os.environ["MEDIA_EGRESS_GUARD_FILE"])
    marker.unlink(missing_ok=True)
    targets = approved_targets(
        os.environ.get("CAMERA_SOURCES_JSON", "{}"),
        os.environ.get("CAMERA_ALLOWED_CIDRS", "").split(","),
        {int(p) for p in os.environ.get("CAMERA_ALLOWED_PORTS", "554,8554").split(",")},
    )
    install(targets)
    marker.write_text(json.dumps({"policy": "deny-other-new-connections", "targets": targets}))
    marker.chmod(0o444)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print('{"event":"media_egress_policy_failed"}', flush=True)
        raise SystemExit(1) from None
