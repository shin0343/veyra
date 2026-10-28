# Final demo guide

**Canonical demo URL: http://127.0.0.1:3200** — the preserved curated demo database
(`runtime/demo`), six licensed films replayed as cameras, the stored Muse index, and the release
build. Older :3600/:3700/:3701/:3710 servers are test-only and are not the demo.

## Start, check, stop

```sh
# 1. Build the release frontend into the default .next (only while the demo is stopped)
cd apps/web && npx next build --webpack && cd ../..
cat apps/web/.next/BUILD_ID          # release candidate: h45YdTzeygibz8PyPrxR6

# 2. Start (reuses the database and media; captures nothing new; queues no cloud analysis)
.venv/bin/python -E scripts/demo_videos.py --mediamtx /tmp/veyra-mediamtx/mediamtx \
  --runtime runtime/demo --port 3200
# ready when it prints {"status": "ready", "web_url": "http://127.0.0.1:3200", ...}

# 3. Health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3200/                    # 200
curl -s -o /dev/null -w "%{http_code}\n" \
  http://127.0.0.1:3200/_next/static/$(cat apps/web/.next/BUILD_ID)/_buildManifest.js  # 200
curl -s -H "Origin: http://127.0.0.1:3200" http://127.0.0.1:3200/api/v1/analysis-usage  # ledger

# 4. Stop: Ctrl-C in the start terminal, or
kill -INT "$(python3 -c 'import json;print(json.load(open("runtime/demo/video01-state.json"))["pid"])')"
```

The controller stops only the processes it started (PostgreSQL shuts down cleanly). Never
delete `runtime/demo`. Muse calls need the private `.env` key; each Explore "Ask Muse" is one
request and each agent message up to a few; the server admits at most 100 requests / $5.00
reserved per UTC day.

## 2-minute presenter script

| Time | Screen | Say |
| --- | --- | --- |
| 0:00 | Home | "Veyra is a video workspace built on Meta Muse. These six cameras replay licensed films through a real media server." |
| 0:12 | Cameras → Entrance gate | "Each camera shows live video, its recordings, the views it belongs to, and the licence of its footage." |
| 0:25 | Live view | "The live wall streams every camera." |
| 0:35 | Saved views → Ask Muse: `Create a 2x2 view named "Front of house" with Entrance gate, Street approach, Community space and Bicycle parking.` | "Muse can only call typed, allowlisted tools. It proposes — nothing is saved until I approve." Approve → "The server saves it, re-reads it, then says it's done." Open saved layout. |
| 1:05 | Explore → `squirrels at the feeder` → Ask Muse | "One Muse request turns my words into structured filters; results come from Muse's stored analysis of each clip." |
| 1:25 | Result → Open in recording | "Every answer is evidence: the exact clip, at the exact time." |
| 1:40 | Activity → Watch | "Activity lists every analysed moment. Stack: Next.js, FastAPI, PostgreSQL, MediaMTX and FFmpeg, Meta Muse through typed tools with server-bound approvals." |

Live Muse on the canonical DB will create a real saved view. Delete nothing; if you want a clean
DB afterwards, run the demo on a disposable copy instead (`scripts/final_rc.py --live-muse-requests 4`).

## Recorded demo video

`runtime/demo-video/veyra-final-demo.mp4` — **110.1 s**, H.264 1440×900 30 fps, 14.2 MB,
sha256 `0eee71d5…0cffd764`. Not committed to git (size, third-party footage).

| Segment | Content | Muse |
| --- | --- | --- |
| 0:00–1:25.6 | Full product tour on an isolated copy (`tests/final-demo-recording.mjs`) | **Scripted** provider — captioned on screen "Recorded with a scripted Muse provider · not a live Meta call" |
| 1:25.6–1:29.6 | Title card "Unedited live session" | — |
| 1:29.6–1:50.1 | Unedited browser recording of the live verification (`tests/live-muse-verification.mjs`) | **Live** Meta Muse, 28 Oct 2026 02:40 UTC, 3 requests |

Reproduce: `scripts/final_rc.py --qa-provider`, then
`node tests/final-demo-recording.mjs <dir>` and encode with
`ffmpeg -i veyra-demo.webm -c:v libx264 -crf 22 -pix_fmt yuv420p -r 30 -movflags +faststart out.mp4`.

When publishing the video, put the footage credits from the [README](../../README.md#media-and-licensing)
in its description. One source is CC BY-SA 4.0; review share-alike terms before publishing.
