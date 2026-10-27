"""Fail-closed source admission. No DNS lookups or network requests are performed."""

import ipaddress
from urllib.parse import urlsplit


def validate_rtsp_source(url: str, allowed_cidrs: list[str]) -> str:
    try:
        parsed = urlsplit(url)
        address = ipaddress.ip_address(parsed.hostname or "")
        port = parsed.port or 554
        networks = [ipaddress.ip_network(cidr, strict=True) for cidr in allowed_cidrs]
    except ValueError:
        raise ValueError("source must use a literal IP and valid explicit CIDRs") from None
    if parsed.scheme not in {"rtsp", "rtsps"} or not 1 <= port <= 65535:
        raise ValueError("only approved RTSP sources are supported")
    if parsed.query or parsed.fragment or any(ord(c) < 33 for c in url):
        raise ValueError("source query, fragment and whitespace are not supported")
    metadata_addresses = {
        ipaddress.ip_address("100.100.100.200"),
        ipaddress.ip_address("168.63.129.16"),
    }
    if (
        address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or address.is_reserved
        or getattr(address, "ipv4_mapped", None) is not None
        or address in metadata_addresses
    ):
        raise ValueError("source address is forbidden")
    if not any(address in network for network in networks):
        raise ValueError("source is outside operator-approved networks")
    return url
