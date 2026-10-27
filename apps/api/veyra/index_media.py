"""Bounded real-media sampling. Pixel change is a signal, not semantic recognition."""

import hashlib
import json
import re
import subprocess
from pathlib import Path

from .db import Problem


def command(args, timeout=40):
    try:
        return subprocess.run(args, check=True, capture_output=True, timeout=timeout)
    except (subprocess.SubprocessError, OSError):
        raise Problem(503, "MEDIA_ANALYSIS_FAILED", "The video could not be sampled.") from None


def media_info(path):
    try:
        data = json.loads(
            command(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_streams",
                    "-show_format",
                    "-of",
                    "json",
                    str(path),
                ],
                10,
            ).stdout
        )
        video = next(s for s in data["streams"] if s["codec_type"] == "video")
        info = {
            "duration_ms": round(float(data["format"]["duration"]) * 1000),
            "codec": video["codec_name"],
            "width": video["width"],
            "height": video["height"],
            "start_pts_seconds": float(video.get("start_time", 0)),
            "frame_rate": video.get("avg_frame_rate", "unknown"),
        }
        if info["duration_ms"] <= 0 or not (
            0 < info["width"] <= 8192 and 0 < info["height"] <= 8192
        ):
            raise ValueError
        return info
    except (ValueError, KeyError, StopIteration, TypeError):
        raise Problem(422, "INVALID_MEDIA", "The source video has no valid timeline.") from None


def sample(path, settings, duration_ms):
    interval = settings.indexing_sample_ms
    result = command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "info",
            "-threads",
            "1",
            "-i",
            str(path),
            "-t",
            str(duration_ms / 1000),
            "-an",
            "-vf",
            f"fps=1000/{interval},scale=160:90:flags=area,format=gray,showinfo",
            "-fps_mode",
            "passthrough",
            "-f",
            "rawvideo",
            "pipe:1",
        ]
    )
    frame_bytes = 160 * 90
    frames = result.stdout
    times = [round(float(v) * 1000) for v in re.findall(rb"\bpts_time:([0-9.e+-]+)", result.stderr)]
    if not times or len(frames) != len(times) * frame_bytes or len(times) > 1202:
        raise Problem(422, "INVALID_MEDIA", "Sampled frames have an invalid timeline.")
    samples = []
    for i in range(1, len(times)):
        previous = frames[(i - 1) * frame_bytes : i * frame_bytes]
        current = frames[i * frame_bytes : (i + 1) * frame_bytes]
        score = sum(abs(a - b) for a, b in zip(previous, current)) / (frame_bytes * 255)
        start, end = max(0, times[i - 1]), min(duration_ms, times[i])
        if end > start:
            samples.append(
                {
                    "start_ms": start,
                    "end_ms": end,
                    "score": score,
                    "active": score >= settings.indexing_motion_threshold,
                }
            )
    # Always retain a baseline clip for static scenes. Strongest change focuses long segments.
    peak = max(samples, key=lambda item: item["score"], default=None)
    focus = peak["end_ms"] if peak and peak["active"] else 0
    clip_start = min(
        max(0, focus - settings.indexing_clip_ms // 2),
        max(0, duration_ms - settings.indexing_clip_ms),
    )
    return times, samples, clip_start


def extract(path: Path, destination: Path, start_ms, duration_ms, settings):
    command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-threads",
            "1",
            "-i",
            str(path),
            "-ss",
            str(start_ms / 1000),
            "-t",
            str(duration_ms / 1000),
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            "scale=w='min(640,iw)':h=-2",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-fs",
            str(settings.indexing_max_upload_bytes),
            "-f",
            "mp4",
            str(destination),
        ]
    )
    info = media_info(destination)
    if (
        destination.stat().st_size >= settings.indexing_max_upload_bytes
        or abs(info["duration_ms"] - duration_ms) > 150
    ):
        raise Problem(422, "INVALID_CLIP", "The extracted clip failed duration or size checks.")
    return min(info["duration_ms"], duration_ms)


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
