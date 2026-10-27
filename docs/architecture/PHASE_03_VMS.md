# Phase 03 VMS implementation and operation

The implemented slice is camera registration → RTSP ingestion → HLS live view → finalized
recording → authenticated MP4 playback, with PostgreSQL layouts. Muse, indexing, search,
rules and generated events still return typed 501 responses. `apps/web` source is preserved.
See the appended Phase 03 section in HANDOFF for measured results.

## Runtime boundaries

`apps/api/veyra` is the canonical backend package. `main.py` owns REST/authentication;
`store.py` owns camera/layout/recording SQL; `sessions.py` resolves authorized media;
`pipeline.py` runs one reconciler thread in the API process. PostgreSQL advisory locks serialize
reconciliation and mutations. No Redis, distributed media worker or model executor was added.

`contract_app.py` preserves the Phase 01 schema generator and the remaining 501 endpoints.
Shared v0.1.0 artifacts and frontend types stay frozen. The runtime additions were proposed
before implementation in [PHASE_03_CONTRACT_PROPOSAL.md](PHASE_03_CONTRACT_PROPOSAL.md).
[openapi-phase03.json](openapi-phase03.json) describes the current backend.
Generate it with `.venv/bin/python -E scripts/export_runtime_openapi.py`.

Registration commits an `unknown` camera before asynchronous media configuration. A 201
means registration succeeded; it does not mean a live feed exists. The reconciler reads the
actual MediaMTX paths API and stores online/offline/error/disabled state. An observation older
than ten seconds is exposed as unknown. MediaMTX failure cannot leave a camera implicitly online.

H264 video and optional AAC audio are supported. Other observed codecs produce
`UNSUPPORTED_CODEC`; automatic transcoding is outside this phase. HLS is fMP4, rather than
WebRTC. Several seconds of HLS latency are expected; no low-latency benchmark is claimed.

## Camera destination and credential policy

Only the operator provisions RTSP URLs through server-side `CAMERA_SOURCES_JSON`. Browser
and agent schemas accept `source_id`, never URLs or passwords. IDs/modes are the only source
fields returned by `/camera-sources`. URLs are absent from camera rows, audit/idempotency
payloads and application responses. MediaMTX keeps its source configuration in private memory;
its Docker launcher redacts RTSP URLs from upstream diagnostics.

For example, configure an exact owned LAN destination and its TCP port:

```dotenv
CAMERA_ALLOWED_CIDRS=192.168.1.10/32
CAMERA_ALLOWED_PORTS=554
CAMERA_SOURCES_JSON={"entrance":{"mode":"pull","url":"rtsp://192.168.1.10:554/stream"}}
```

Use a private `.env` for credentials; never commit it. DNS, unapproved IPs/ports, loopback,
link-local/metadata, multicast, unspecified, mapped IPv6 and reserved addresses are rejected.
No endpoint offers arbitrary HTTP, SQL, filesystem or command execution.

URL validation alone cannot restrict a camera's RTSP redirects. Before starting MediaMTX,
the Docker media entrypoint installs IPv4/IPv6 OUTPUT rules: established replies and NEW
TCP connections to the exact configured IP/port pairs only. All other new outbound connections,
including DNS and unapproved redirect targets, are dropped. The process then drops privilege
and capabilities. API camera creation and configuration require an installed-policy manifest
whose targets exactly match current source configuration. A missing/mismatched guard fails
closed with 403 `EGRESS_GUARD_REQUIRED`. Source configuration changes require restarting media
and API together. This is an operator-managed trust boundary, not attestation against a hostile
host administrator.

Docker/Linux firewall execution and physical LAN camera pull were **not run on this Mac**.
Do not treat unit tests of rule generation as firewall verification. The native sample path
requires no pull exception: an explicitly enabled FFmpeg publisher sends owned testsrc2 video
to fixed `fixture`, `fixture_2`, `fixture_3`, `fixture_4` paths. Sample cameras are named as such.

## Recording and playback

MediaMTX writes ten-second fMP4 segments and invokes a fixed completion hook. The hook reads
`MTX_SEGMENT_PATH`/`MTX_PATH` from the environment; camera data is never interpolated into a
shell command. It writes an atomic `.done.json` marker with the actual UTC capture origin and
completion time. The reconciler accepts only closed, marked, FFprobe-verified H264 files.

Segments retain camera/recording association, actual UTC start, duration, recording-relative
offset and private storage key. Contiguous segments join one recording; gaps over two seconds
start a new recording. Available duration sums ready segments, not missing intervals. The
reconciler marks removed files deleted, including when an entire camera directory disappears
or is replaced with a symlink. Recordings with no available segments become deleted;
recordings close when ingest stops. Capture filenames use UTC (`TZ=UTC`).

Live sessions last five minutes by default, are principal-bound, and keep opaque HLS resource
maps in PostgreSQL. The API proxies only the fixed internal MediaMTX origin/path. HLS manifests
are rewritten to authenticated same-origin resources; absolute/traversing/query URLs are
rejected. Internal `hlsCDNSecret` bearer auth disables upstream HLS session redirects for the
proxy. The secret never reaches the browser. Live sessions cease to serve when the camera is
disabled, deleted, offline or incompatible.

Playback resolves a ready segment containing the requested offset and stops at a contiguous
available window. Missing intervals return 409 `MEDIA_GAP`; missing bytes return 404
`RECORDING_UNAVAILABLE`. The fixed MediaMTX playback endpoint exports MP4 into a private,
bounded cache, then FFprobe verifies it before a URL is returned. Example mapping:
`requested=52000`, `actual_start≈50000`, `seek≈2000`, in milliseconds. The sum is exact even
when segment offsets differ slightly from nominal ten-second boundaries.

FastAPI FileResponse provides byte ranges (206); malformed/unsatisfiable ranges return typed
416 errors. No token appears in a URL. Playback sessions survive an API restart while their
cache file and expiry remain valid. Expired sessions are rejected immediately and cleaned
on reconciliation. Defaults: 64 MiB per clip, 256 MiB cache, one export at a time, ten-second
upstream timeout, five-minute session TTL. Max request duration remains 300000 ms. A very large
or slow export fails explicitly. Process crashes during an export may leave an unreferenced
cache file; while the stack is stopped, an operator can remove orphan cache files if capacity
is exhausted. No production storage or quota service is claimed.

## Persistence, authorization and health

Migration `002_vms.sql` adds camera grouping/location/error/soft-delete fields, active-source
uniqueness, `media_sessions` and `vms_audit`. The original migration is unchanged. SQL migrations
are checksum-verified and transactional. API code never creates schema implicitly.

The local workspace uses the server's operator token. Optional `VEYRA_VIEWER_TOKEN` is a
separate read-only principal: it can read and create its own live/playback sessions, but cannot
mutate cameras/layouts or read another principal's media session. Both principals share the
single local workspace; production identities and tenant/resource grants are outside this phase.

Camera/layout mutations commit idempotency and audit rows in the same transaction. Same key
and body replay the original status/body for 24 hours (including its original observation);
a changed body conflicts. Layout replacement checks `expected_version`. Deleting a camera
referenced by a layout returns `CAMERA_IN_USE`; otherwise it soft-deletes registration and
preserves past recordings. No layout deletion endpoint was added.

`/health/live` checks the API process; `/health/ready` verifies migration 002 in PostgreSQL.
Readiness does not assert media or AI availability. Camera/session operations report those
separately. Application lifecycle/error records are JSON with IDs and error types, not raw
request bodies, SQL, camera URLs or provider responses.

## Local execution

Install the existing locked dependencies and provide PostgreSQL 15+ binaries, FFmpeg/FFprobe
with libx264/libx265, MediaMTX 1.21.3 and Playwright Chromium. A production Next build must
already exist for the browser test. This phase used the Phase 02 build without editing web code.

```sh
make check
make vms-smoke MEDIAMTX_BIN=/absolute/path/to/mediamtx
```

The acceptance script starts an isolated PostgreSQL cluster, applies/reapplies both migrations,
starts MediaMTX/API/four real FFmpeg publishers, verifies HTTP/browser media and failure cases
(including whole-directory loss and H264 recovery after interruption/HEVC rejection),
restarts the API, and stops all owned processes. It retains private evidence under ignored
`runtime/vms/<UTC-run>/`. `report.json` is safe to review; `connection.json`, `web.env` and media
configuration contain private local credentials and must remain ignored. It never connects
to the operator's normal database.

For an interactive stack with persistent storage:

```sh
.venv/bin/python -E scripts/vms_native.py --mediamtx /absolute/path/to/mediamtx --runtime runtime/vms-dev
# In another terminal, after startup:
.venv/bin/python -E scripts/seed_vms.py --connection runtime/vms-dev/connection.json
node --env-file=runtime/vms-dev/web.env node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1
```

The native stack chooses free loopback ports and writes frontend server settings to the private
`web.env`; open `http://localhost:3000`. Ctrl-C stops its children and PostgreSQL. Reusing the
same `--runtime` keeps camera/layout/recording rows and video files. Do not reuse the destructive
failure-test directory as a demo workspace: acceptance intentionally removes one file and camera.

A standalone fixed sample publisher is available as:

```sh
.venv/bin/python -E services/media/sample_camera.py --host 127.0.0.1 --port 8554 --index 1
```

Compose: copy `.env.example`, replace both token/secret placeholders, then `docker compose
config --quiet` and `docker compose --profile fixture up --build`. Set explicit sample mode
and use `scripts/seed_vms.py` with API_INTERNAL_URL/VEYRA_DEV_TOKEN from the private environment.
Compose overrides internal media URLs, mounted paths and guard location. The media container
requires Linux iptables/ip6tables and NET_ADMIN during initialization; it drops capabilities
before running MediaMTX. Only web/API ports bind host loopback. Volumes retain PostgreSQL,
recordings and playback cache. YAML syntax/bindings were checked; container build/run remains
unverified because Docker is absent.

## Official references

- [MediaMTX configuration](https://mediamtx.org/docs/references/configuration-file): fMP4
  recording, path configuration and HLS options.
- [MediaMTX hooks](https://mediamtx.org/docs/features/hooks): segment-completion environment.
- [MediaMTX playback](https://mediamtx.org/docs/features/playback): fixed export API.
- [MediaMTX scalability/CDN](https://mediamtx.org/docs/features/scalability): HLS CDN secret
  for the authenticated application proxy.
- [Starlette FileResponse](https://starlette.dev/responses/#fileresponse): byte-range serving.
