"""Verify pinned licensed originals and prepare silent, uncropped browser-compatible films.

No network by default. --download fetches only the seven reviewed Wikimedia originals,
with bounded retries that respect Retry-After. Never reads credentials or calls Muse.
"""

import argparse
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "docs/demo/video-sources.json"


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def probe(path):
    return json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
            timeout=30,
        )
    )


def download(asset, target):
    url = asset["download_url"]
    if not url.startswith("https://upload.wikimedia.org/wikipedia/commons/"):
        raise ValueError("Only reviewed Wikimedia original URLs are supported")
    for attempt in range(3):
        request = urllib.request.Request(url, headers={"User-Agent": "VeyraDemo/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                temporary = target.with_suffix(target.suffix + ".part")
                total = 0
                with temporary.open("wb") as stream:
                    while chunk := response.read(1024 * 1024):
                        total += len(chunk)
                        if total > 250 * 1024 * 1024:
                            raise ValueError("Original exceeds the bounded download size")
                        stream.write(chunk)
                if sha256(temporary) != asset["original_sha256"]:
                    raise ValueError("Original checksum differs from the reviewed source")
                temporary.replace(target)
                return
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            delay = max(30, int(error.headers.get("Retry-After", "30")))
            if delay > 300:
                raise
            print(f"Source rate limit: waiting {delay}s", flush=True)
            time.sleep(delay)


def prepare(root, allow_download=False):
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    (root / "normalized").mkdir(exist_ok=True)
    (root / "posters").mkdir(exist_ok=True)
    specification = json.loads(SOURCES.read_text())
    previous_path = root / "library.json"
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    old = {a["media"]["asset_id"]: a for a in previous.get("assets", [])}
    result = []
    for asset in specification["assets"]:
        original = root / asset["original_filename"]
        if not original.is_file() and allow_download:
            download(asset, original)
        if not original.is_file():
            raise FileNotFoundError(f"Missing licensed original: {original.name}; use --download")
        if sha256(original) != asset["original_sha256"]:
            raise ValueError(f"Original hash mismatch: {original.name}")
        identity = asset["asset_id"]
        video, poster = root / f"normalized/{identity}.mp4", root / f"posters/{identity}.jpg"
        recipe = hashlib.sha256(
            json.dumps([specification["normalization_version"], asset], sort_keys=True).encode()
        ).hexdigest()
        cached = old.get(identity, {})
        valid = (
            cached.get("recipe") == recipe
            and video.is_file()
            and poster.is_file()
            and sha256(video) == cached["media"]["sha256"]
            and sha256(poster) == cached["poster_sha256"]
        )
        if not valid:
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-threads",
                    "2",
                    "-ss",
                    str(asset["start_seconds"]),
                    "-i",
                    str(original),
                    "-t",
                    str(asset["duration_seconds"]),
                    "-map",
                    "0:v:0",
                    "-an",
                    "-vf",
                    "scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                    "pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=15",
                    "-c:v",
                    "libx264",
                    "-threads",
                    "2",
                    "-preset",
                    "fast",
                    "-crf",
                    "24",
                    "-profile:v",
                    "baseline",
                    "-level",
                    "3.1",
                    "-pix_fmt",
                    "yuv420p",
                    "-g",
                    "15",
                    "-keyint_min",
                    "15",
                    "-sc_threshold",
                    "0",
                    "-bf",
                    "0",
                    "-maxrate",
                    "1800k",
                    "-bufsize",
                    "3600k",
                    "-movflags",
                    "+faststart",
                    "-y",
                    str(video),
                ],
                check=True,
                timeout=300,
            )
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-ss",
                    str(asset["poster_seconds"]),
                    "-i",
                    str(video),
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    "-y",
                    str(poster),
                ],
                check=True,
                timeout=30,
            )
        info, original_info = probe(video), probe(original)
        stream = next(s for s in info["streams"] if s["codec_type"] == "video")
        if stream["codec_name"] != "h264" or stream["pix_fmt"] != "yuv420p":
            raise ValueError("Prepared video is not browser-compatible H264")
        changes = (
            f"Excerpt {asset['start_seconds']}–"
            f"{asset['start_seconds'] + asset['duration_seconds']:g}s; silent H.264, "
            "15 fps, resized and letterboxed without cropping. Preview extracted from video."
        )
        item = {
            **asset,
            "recipe": recipe,
            "file": str(video.relative_to(root)),
            "poster": str(poster.relative_to(root)),
            "poster_sha256": sha256(poster),
            "duration_ms": round(float(info["format"]["duration"]) * 1000),
            "original_probe": original_info,
            "normalized_probe": info,
            "media": {
                "kind": "prerecorded",
                "asset_id": identity,
                "title": asset["title"],
                "creator": asset["creator"],
                "source_url": asset["original_url"],
                "license": asset["license"],
                "license_url": asset["license_url"],
                "changes": changes,
                "sha256": sha256(video),
            },
        }
        result.append(item)
        print(
            f"Verified {identity}: {item['duration_ms']}ms, {video.stat().st_size} bytes",
            flush=True,
        )
    document = {"schema_version": 1, "assets": result}
    temporary = previous_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(previous_path)
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets-root", type=Path, default=ROOT / "runtime/video-library")
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    prepare(args.assets_root, args.download)


if __name__ == "__main__":
    main()
