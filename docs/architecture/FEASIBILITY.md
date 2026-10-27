# Feasibility and compatibility — observed October 26, 2026

This file separates official documentation, executed probes and unverified behavior.
Nothing here claims a completed VMS, real scene analysis or a benchmark.

## Environment inspected

Target directory was empty; no Git repository, inherited project rules, existing frontend,
project `.env` or credentials were present. A new local Git repository was initialized
on `main`; nothing has been committed, pushed or deployed.

| Component | Observed |
| --- | --- |
| Hardware/OS | macOS arm64 |
| Node / npm | 22.23.1 / 10.9.8 |
| Python | shell initially 3.11.2; project uv environment 3.12.14 |
| API dependencies | FastAPI 0.162.0, Pydantic 2.14.1, Uvicorn 0.54.0, Psycopg 3.3.6, httpx 0.28.1 |
| Frontend dependencies | Next 16.4.3, React/React DOM 19.3.1, TypeScript 5.9.3 |
| Contracts / browser tools | openapi-typescript 7.13.0, Playwright 1.64.1, Chromium 156.0.8078.4 |
| FFmpeg / ffprobe | 8.0.1, libx264 available |
| PostgreSQL | native 15.19 Homebrew; Compose declares 16.13-bookworm, unrun |
| MediaMTX | downloaded official 1.21.3 Darwin arm64 binary, executed successfully |
| Docker / Compose | not installed; no daemon or container startup tested |
| Meta credentials | MODEL_API_KEY and common Meta key aliases absent in the task environment; project had no secret file |

Next's documented minimum Node version is 20.9, so the observed Node 22 meets it.
The project build and actual server request also passed; this is stronger evidence than
version matching alone. [Official Next installation requirements](https://nextjs.org/docs/app/getting-started/installation).

The host exports PYTHONHOME pointing to a different managed Python. A plain `.venv/bin/python`
initially failed to import encodings. Python `-E` ignores that interpreter override and
successfully runs the project environment. Make targets use it; no global configuration changed.

## Official Meta capabilities verified

| Capability | Documentation verified | Actual account/API test |
| --- | --- | --- |
| Endpoint/auth/model | `https://api.meta.ai/v1`, Bearer MODEL_API_KEY, Standard `muse-spark-1.3` | skipped: no key |
| Function tools | Chat Completions and Responses; application executes calls, returns matched IDs; auto choice only; strict flag validates schema subset | skipped |
| Structured JSON | Chat `response_format.json_schema`; Responses `text.format`; strict schema rules and recursive schema rejection | skipped |
| Video understanding | upload with Files API purpose=user_data; Responses input_file by file_id (also input_video); text output | not tested; no media uploaded |
| Optional SAM | `sam-3.1` on Responses for boxes/masks on images/video | not tested or required for baseline |
| File lifecycle | upload, expiration and delete documented | not tested |

Sources: [Meta overview](https://dev.meta.ai/docs/overview),
[tool calling](https://dev.meta.ai/docs/tool-calling),
[structured output](https://dev.meta.ai/docs/structured-output),
[video understanding](https://dev.meta.ai/docs/video-understanding),
[file handling](https://dev.meta.ai/docs/file-handling),
[SAM API overview](https://dev.meta.ai/docs/sam/overview).

Compatibility decisions: fixed first-party HTTP transport, no SDK assumption necessary;
no forced tool_choice, custom code tool or hosted search tool. Strict output still gets
Pydantic validation. Keep Standard mode for footage; model docs distinguish Contributor
content usage. Audio perception is not a baseline requirement, and the model documentation
notes degraded audio support in Spark 1.3. [Official model descriptions](https://dev.meta.ai/docs/models).

The open-weight SAM 3.1 repository requires a separate GPU-oriented installation; it is
not installed or claimed to run on this Mac. API access avoids making a local CUDA stack
a prerequisite. [Official SAM repository](https://github.com/facebookresearch/sam3).

Executed `make meta-smoke`: **skipped**, reason `MODEL_API_KEY not configured`.
The prepared smoke checks non-sensitive text, schema-constrained JSON and a read-only
feature discovery tool loop. It performs no write tool or video upload. A skipped exit 0
allows development without credentials; the JSON status must always be read as skipped.
See [`meta.json`](../evidence/meta.json). Actual entitlement, billing, quota, upload latency,
tool behavior and video-grounding quality are still unknown.

## Media probe — actual execution

Downloaded official `mediamtx_v1.21.3_darwin_arm64.tar.gz` and verified published SHA256:
`bc1a0762fd18ffb413bcd81dcb9a072ac159fbd1f27e79ac6f14598aaac5ed3f`.
[Official release](https://github.com/bluenviron/mediamtx/releases/tag/v1.21.3).
The binary lives in `/tmp/veyra-mediamtx/`, not in the repository.

`scripts/media_smoke.py` starts the actual checked-in MediaMTX configuration with temporary
loopback listener overrides. FFmpeg generates owned `testsrc2` H264, yuv420p, 640×360 at
15fps, no audio, one-second GOP, TCP RTSP. A second MediaMTX path pulls that simulated camera
over RTSP; browser tests use its HLS output and recorded MP4 export.

The final run at `2026-10-26T21:09:17.535845+00:00` passed:

- Real RTSP pull and valid HLS manifest.
- Chromium HLS video dimensions and advancing currentTime, not just an HTTP 200.
- Finalized fMP4 recording and MediaMTX MP4 export; ffprobe reports H264 and 6.066s export.
- A real FastAPI/Starlette FileResponse serving the bounded export honors Range bytes 0–127
  with HTTP 206 and 128 bytes.
- Chromium plays that MP4, reports seekable `[0,6.066]`, and seeks to 2.000s.

See [`media.json`](../evidence/media.json), [`browser-live.json`](../evidence/browser-live.json)
and [`browser-playback.json`](../evidence/browser-playback.json). Full local generated media,
ffprobe output and logs remain in ignored `runtime/feasibility/media/`. No real footage or
model observations were used. These are feasibility observations, not latency/accuracy benchmarks.

**Design correction from failed probe:** direct MediaMTX `format=mp4` played in Chromium,
but seeking failed with duration 6.066, currentTime returning to 0 and seekable `[0,0]`.
[`media-direct-seek.json`](../evidence/media-direct-seek.json) preserves that actual diagnosis.
The selected design materializes a short MP4 and serves it with FileResponse Range support;
do not forward a live chunked MP4 response and assume browser seeking works.

Official docs support HLS browser reading, recording and playback exports. Starlette documents
FileResponse Range 206/416 handling. These findings guided the probe; only the cases above
were actually executed. [MediaMTX browser guide](https://mediamtx.org/docs/read/web-browsers),
[recording guide](https://mediamtx.org/docs/features/record),
[playback guide](https://mediamtx.org/docs/features/playback),
[Starlette FileResponse](https://www.starlette.io/responses/).

Not verified: physical camera authentication/RTSP redirect policy, H265 transcode, audio,
Safari/Firefox/mobile, WebRTC, WAN access, latency targets, concurrent streams, product
media sessions or proxy authorization. Testsrc2 is a local transport fixture and is not
enough to evaluate natural-language search or model scene understanding.
The checked-in Compose media network has no LAN egress. Its fixture works entirely internally;
real-camera network admission/redirect enforcement is explicitly workstream A implementation.

## Foundation probe — actual execution

`scripts/foundation_smoke.py` starts a fresh temporary PostgreSQL 15.19 database, applies
and reapplies the migration, checks FK rejection and a labeled SQL-only FTS fixture, then
starts the API and production-built Next app. Readiness verifies the migrated DB; the
authenticated feature catalog resolves grid→layouts; the rendered Next page shows a real
successful server-to-API health read. The token is absent from rendered HTML. All passed;
the isolated processes/database are stopped afterward. [`foundation.json`](../evidence/foundation.json).

The FTS fixture validates PostgreSQL indexing syntax, not AI retrieval quality. The Next
request validates application connectivity, not the unimplemented VMS UI. Readiness does
not claim model or media readiness. [PostgreSQL FTS documentation](https://www.postgresql.org/docs/16/textsearch-intro.html).

## Remaining verification gates

1. Supply MODEL_API_KEY server-side and run real text/JSON/tools smoke. Then separately test
   consented owned-video upload, cleanup and timestamp grounding before indexing implementation.
2. Install/run Docker externally and execute `docker compose config --quiet`, `docker compose
   up --build`, `/health/ready`, web access and fixture profile. The YAML was parsed locally
   and its host bindings reviewed; that is not a Compose validation or container build.
3. Implement the services documented in WORKSTREAMS and run real end-to-end slice tests.
   Contract-only endpoints returning 501 are deliberate, not an operational prototype VMS.

Research access note: agent-reach skill was read and its Exa route attempted; Exa was not
configured, the agent-reach executable was absent, and Jina rejected anonymous access. Built-in
web search/open retrieved the linked official sources. No unofficial compatibility claims
were used, and no external account was signed into or changed.
