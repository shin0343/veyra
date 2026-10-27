# Veyra

> Current real-video demo: [VIDEO_LIBRARY](docs/demo/VIDEO_LIBRARY.md). Six licensed prerecorded
> sources, preserved demo DB, idempotent setup and [VIDEO-01 evidence](docs/qa/VIDEO_01_REPORT.md).


A calm video workspace with a functioning VMS and a Phase 05 video indexing/search backend. Camera
management, authenticated HLS, recorded MP4 playback and saved layouts are implemented.
The control plane adds typed tools, explicit approval, actual layout writes, audit and independent
DB verification. Its real-PostgreSQL acceptance uses scripted Meta HTTP; genuine Muse acceptance
remains unverified without MODEL_API_KEY. Consented real-media indexing, stored-index natural
language search, distinct activity metrics and grounded events are implemented. Genuine Muse
video acceptance remains unverified without a key and configured model budgets; rules remain 501.

Read [HANDOFF](docs/HANDOFF.md) for current results and blockers, and
[Phase 03 operation](docs/architecture/PHASE_03_VMS.md) for media behavior and
[Phase 04 agent](docs/architecture/PHASE_04_AGENT.md) for control-plane operation and live gates.
Read [Phase 05 indexing](docs/architecture/PHASE_05_INDEXING.md) for worker/search operation,
current endpoints, evaluation provenance and the explicit genuine-Muse gate.

```text
apps/api/veyra/            FastAPI, PostgreSQL services, Muse tools, approvals and media
apps/api/tests/            Backend security, validation and failure tests
apps/web/                 Next.js product UI; frontend owner retains control
services/media/           Recording hook, sample publisher and container egress guard
packages/contracts/       Frozen v0.1.0 OpenAPI, generated TS and agent registry
infra/                    Dockerfiles, MediaMTX configuration and SQL migrations
scripts/                  Migration, seeding, native stack and real acceptance tests
docs/                     Product, architecture, design, evidence and handoff
```

## Run the verified native stack

Prerequisites: Node 22, Python 3.12, uv, PostgreSQL 15+ binaries, FFmpeg/FFprobe with
libx264/libx265, MediaMTX 1.21.3 and Playwright Chromium. Install existing locked dependencies
with `make install`. A built Next application is required for browser playback.

```sh
.venv/bin/python -E scripts/vms_native.py --mediamtx /absolute/path/to/mediamtx --runtime runtime/vms-dev
```

In another terminal:

```sh
.venv/bin/python -E scripts/seed_vms.py --connection runtime/vms-dev/connection.json
node --env-file=runtime/vms-dev/web.env node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1
```

Open `http://localhost:3000`. The stack starts its own dedicated PostgreSQL cluster, MediaMTX,
API and four explicit FFmpeg sample cameras on free loopback ports. The private connection
file contains API credentials; never commit it. Ctrl-C stops owned services. Reusing the same
runtime directory preserves database rows and video files. The sample is synthetic testsrc2,
with no human footage or AI-generated observations.

For a manually configured API: copy `.env.example` to private `.env`, replace the operator
and HLS secret placeholders, configure a dedicated database, run `make migrate`, then
`make dev-api`. `make dev-web` loads the root private environment. Read the operation document
before configuring separate MediaMTX processes or physical camera pull.

## Checks and actual acceptance

```sh
make check
make contracts-check
make agent-smoke
make meta-smoke
make agent-live-smoke  # Requires MODEL_API_KEY and a passing genuine-Muse layout test.
make index-smoke      # Licensed real media + FFmpeg/PostgreSQL/RTSP/playback; scripted Meta.
make index-live-smoke # Requires explicit key/budgets; enforces genuine video analysis/search.
make index-worker     # Runs the durable analysis worker against the configured database.
make vms-smoke MEDIAMTX_BIN=/absolute/path/to/mediamtx
```

`make check` runs Python lint/format, backend boundary and isolated PostgreSQL tests, frontend
TypeScript and frozen/runtime contract checks. Agent acceptance requires local PostgreSQL binaries;
it labels scripted provider evidence and skips the separate genuine-Muse test without a key.
`make agent-live-smoke` enforces the complete Phase 04 gate and exits nonzero on that skip.
The evidence report records `full_acceptance_gate` separately from backend test success.
The VMS media acceptance test starts isolated services and records at least sixty
seconds, exercises four live feeds through the unchanged Next UI, opens the 52-second recording
moment, tests MP4 byte ranges/seeking, persists a 2×2 layout, restarts the backend and tests
failures. It stops all processes it owns. Logs, screenshots and reports remain in ignored
`runtime/vms/<run>/`. It deliberately removes a camera/file during failure testing; use a fresh
interactive directory for a clean demo. Acceptance output contains actual results, never fixtures.

## Compose

```sh
cp .env.example .env
# Replace the two secret/token placeholders in the private .env.
docker compose config --quiet
docker compose --profile fixture up --build
```

Only web/API ports bind host loopback. Database, recordings and playback cache use persistent
volumes. Media/control ports remain internal. The media entrypoint requires Linux NET_ADMIN
and iptables/ip6tables to restrict outbound camera connections, then drops privilege/capabilities.
Set ENABLE_SAMPLE_CAMERA=true for the fixture and register it with `scripts/seed_vms.py` using
the private API environment. Docker is absent on the development machine: YAML was inspected,
but container build/run and the Linux firewall are unverified. Physical camera pull fails
closed without an installed matching egress policy. Do not expose this local workspace publicly.

## Contracts and ownership

Read [AGENTS](AGENTS.md), [API contract](docs/architecture/API_CONTRACT.md),
[agent tools](docs/architecture/AGENT_TOOLS.md) and [workstreams](docs/WORKSTREAMS.md).
The frozen shared v0.1.0 artifacts remain unchanged. Optional camera grouping/location/error
fields and DELETE were proposed before implementation; the separate
[current runtime OpenAPI](docs/architecture/openapi-phase05.json) captures them, Phase 04
agent additions and Phase 05 indexing/search data. The frontend owner
must integrate those additions in the frontend adapter/types before exposing their UI.

Real Meta credentials are required for the live agent acceptance gate. `make meta-smoke` and
the genuine-Muse test explicitly skip without a key. Do not infer model success or AI search
from working media or scripted tool tests. The unchanged frontend adapter's 15s timeout is shorter
than the backend's 60s budget; coordinate that before claiming live UI acceptance. Python commands
use `-E` because this host has an inherited PYTHONHOME override.

For indexing, configure positive `MODEL_DAILY_BUDGET_USD` and `MODEL_REQUEST_RESERVE_USD`
along with the private key. Zero defaults disable paid video/query inference. After enabling
camera cloud consent, POST `recording_id` and `allow_cloud_upload:true` to `/api/v1/analysis-jobs`
with an idempotency key, then poll the returned job. The separate worker uses real FFmpeg clips,
bounded Meta calls and PostgreSQL checkpoints. Search never uploads recordings again. Use a
hit's complete `playback_request` to select its exact original segment. Existing frontend
types/adapter need owner integration for the additive Phase 05 fields and activity metrics.
