"""Owned synthetic camera publisher. This is an operator CLI, never an agent tool."""

import argparse
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", choices=["127.0.0.1", "mediamtx"], default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8554)
    parser.add_argument("--index", type=int, choices=[1, 2, 3, 4], default=1)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Choose a valid TCP port")
    suffix = "" if args.index == 1 else f"_{args.index}"
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-re",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=15",
        "-an",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-g",
        "15",
        "-bf",
        "0",
        "-f",
        "rtsp",
        "-rtsp_transport",
        "tcp",
        f"rtsp://{args.host}:{args.port}/fixture{suffix}",
    ]
    try:
        raise SystemExit(subprocess.call(command))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
