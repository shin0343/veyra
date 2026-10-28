# Veyra handoff

**Current: FINAL RELEASE (branch `release-recovery-20261027`, tag `veyra-rc1`).** Canonical demo
http://127.0.0.1:3200 (build `h45YdTzeygibz8PyPrxR6`, preserved `runtime/demo` DB). Layout-save
deadlock, frame-cache race, `/events` 422 and test drift fixed; `make check` 192 passed; final
E2E 10/10, REDESIGN 39/39 + 49/49, VIDEO-02 23/23 (RC and canonical). Live Meta Muse verified
once on an isolated copy (search → evidence, layout proposal → approval → verified; 3 requests).
Demo video `runtime/demo-video/veyra-final-demo.mp4` (110 s; scripted segment captioned, live
segment unedited). Gates: [FINAL_RELEASE_GATES](qa/FINAL_RELEASE_GATES.md) · results:
[FINAL_E2E_RESULTS](qa/FINAL_E2E_RESULTS.md) · fixes: [FINAL_INTEGRATION_REPORT](qa/FINAL_INTEGRATION_REPORT.md)
· demo: [FINAL_DEMO_GUIDE](demo/FINAL_DEMO_GUIDE.md) · submit: [SUBMISSION_CHECKLIST](demo/SUBMISSION_CHECKLIST.md).

Open items for the team: confirm the Official Rules/form when published, choose the track,
upload the video with footage credits, decide repository visibility (nothing pushed). Not
tested: Docker/Compose, physical cameras, Safari/iOS, `pip-audit`.

Operating notes: rebuild `.next` only while the demo is stopped; stop it with Ctrl-C or SIGINT
to the controller PID in `runtime/demo/video01-state.json` (never SIGKILL — an orphaned
PostgreSQL blocks the next start). Isolated stacks (`scripts/final_rc.py`) live in `/tmp/veyra-rc-*`
and never touch `runtime/demo`.

**Previous: REDESIGN-02 (branch `redesign-02`).** The REDESIGN-01 art direction now covers every
route: Cameras library + panel, Live wall, Recordings workspace, Activity log, Saved views gallery
with an editor, plain Settings, page-aware Muse and a palette that finds cameras and views for free.
See
[REDESIGN-02 handoff](#redesign-02-handoff--product-wide-art-direction).

**Previous: REDESIGN-01** — Home and Explore workspace ([handoff](#redesign-01-handoff--home-and-explore-workspace)).

**Previous: VIDEO-02 is complete. Veyra has an original design contract ([DESIGN.md](../DESIGN.md)),
an evidence-first Explore workspace with real video frames, data-backed camera lanes and an
inspector, and three additive model-free API routes. Production build `Xt58zp9KoNy6Yf99tkmGh`
runs at http://127.0.0.1:3200 on the preserved `runtime/demo` stack.**
See [VIDEO-02 report](qa/VIDEO_02_REPORT.md), [Explore UX](design/VIDEO_INTELLIGENCE_UX.md),
[reference research](design/REFERENCE_RESEARCH.md), [evaluation](qa/VIDEO_ANALYTICS_EVALUATION.md)
and the [VIDEO-02 walkthrough](demo/VIDEO_LIBRARY.md#presentation-flow--video-02-current).

**Previous: VIDEO-01** — six licensed prerecorded sources replaced the test patterns; see
[VIDEO-01 report](qa/VIDEO_01_REPORT.md), [video library](demo/VIDEO_LIBRARY.md) and
[asset manifest](demo/VIDEO_ASSET_MANIFEST.md). All earlier phases below are retained as history.

**Previous milestone: Phase 08 final polish is delivered. The frontend was audited against the real native
stack and genuine Muse, refined for first-time users, and a continuous in-product demo was
recorded with real screenshots. Frontend lint/typecheck/build, preview QA (0 axe violations),
real-stack flows 2/4/7/8 and the genuine demo walkthrough pass. Backend defects found are listed
for Codex. Docker/Linux firewall and physical cameras remain unverified.**
Read the [Phase 08 handoff](#phase-08-handoff--final-polish-and-demo-readiness),
[readiness report](qa/PHASE_08_READINESS.md) and [demo guide](demo/DEMO_GUIDE.md).
Earlier phase records are retained as history.

## Phase 01 handoff — October 26, 2026

**Architecture, frozen interfaces and a runnable native foundation are delivered.**
Media transport/playback feasibility passed. Meta account access and Docker execution remain
unverified for the concrete environment reasons below. No full product slice is claimed complete.

## Delivered

- Shared engineering/ownership rules in AGENTS and concise Claude guidance.
- Product scope, component/data flows, relational model, REST contract, agent allowlist,
  confirmation/error behavior and a measurable dated work order.
- Frozen **v0.1.0** OpenAPI, generated shared TypeScript and generated tool registry JSON.
  Twenty-seven operations include explicit success/error shapes. Product routes are marked
  contract-only and return authenticated, validated `501 NOT_IMPLEMENTED`.
- FastAPI liveness/readiness, static feature discovery/capability introspection, fail-closed
  local bearer guard, secret-redacting validation and source admission policy.
- Transactional checksum migration runner; 13 product/control tables plus migration history.
- Next.js/React server-rendered placeholder, actual API health read, dependency locks,
  Dockerfiles, Compose infrastructure and reproducible isolated feasibility scripts.
- First-party Meta transport and real smoke script, which truthfully skips without a key.
- Native Git repository on `main`. No commit, push, PR, deployment or external message sent.

## Actual check results

| Check | Result |
| --- | --- |
| Ruff lint and format | passed |
| Python boundary tests | **21 passed** |
| TypeScript | passed |
| Frozen OpenAPI / generated TS / registry drift check | passed |
| Next production build | passed |
| npm installation audit | reported zero vulnerabilities at install; no broader security audit claimed |
| PostgreSQL migration apply + reapply | passed on isolated PostgreSQL 15.19 |
| FK rejection + FTS schema fixture | passed; fixture data is explicitly not AI output |
| Actual API readiness + authenticated catalog + Next→API | passed |
| MediaMTX 1.21.3 / FFmpeg RTSP pull + HLS browser frames | passed |
| Finalized recording + H264 MP4 export | passed, probed 6.066s clip |
| Cached MP4 Range + browser seek | passed, HTTP 206; 2.000s requested/observed |
| Direct MediaMTX MP4 browser seek | failed, seekable `[0,0]`; architecture changed to cached FileResponse |
| Real Meta API smoke | **skipped: MODEL_API_KEY absent** |
| Meta video/SAM inference | not run; documentation only |
| Docker build / Compose startup | **not run: Docker unavailable** |

Nonfatal warning: Starlette TestClient currently warns that its httpx integration is
deprecated in favor of httpx2. Tests passed with locked versions; migrate the test adapter
when updating dependencies. Do not suppress or describe this as an application failure.

Evidence snapshots live in `docs/evidence/`; detailed sources, scope and limitations are
in [`architecture/FEASIBILITY.md`](architecture/FEASIBILITY.md). Generated footage/logs are
ignored under `runtime/feasibility/`; no owned/licensed real camera footage was provided.
All probes stopped their own servers. Nothing is intentionally left running.

## Important implementation decisions

1. Known H264 + RTSP TCP → MediaMTX HLS fMP4 for live. Optional codec conversion through
   fixed FFmpeg arguments. Browser playback uses a bounded cached MP4 and Range-capable
   FileResponse, because the direct-export seek probe failed.
2. One FastAPI app, PostgreSQL and one future leased indexing worker. No Redis/vector
   database or speculative distributed services. The worker directory is reserved only.
3. Cameras register using approved source IDs. No arbitrary camera URL endpoint; literal
   IP/CIDR policy rejects unsafe endpoints. This policy is tested but ingest wiring is not
   implemented. Physical-camera redirect/egress behavior is a next-workstream gate.
   Compose's media network is currently internal-only; physical LAN pull needs approved
   restricted camera egress rather than publishing MediaMTX ports.
4. Muse may propose only six typed tools. Static discovery is available; application agent
   dispatch/mutations are not. Models cannot approve confirmation, execute SQL/code or open URLs.
5. Standard-mode `muse-spark-1.3` on the documented first-party API. Account availability,
   rate limits and response behavior are unknown until a credentialed request is run.
6. Frontend navigation targets and media offsets are fixed in API_CONTRACT. Milliseconds
   are always recording-relative; no model-generated timestamps become wall-clock evidence.
7. Local single-user development, loopback bindings and server-only credentials. This is
   not public multi-user authentication. Media/control/DB ports remain internal in Compose.

## Current implementation boundary

Not implemented: camera/layout persistence APIs, camera source listing, actual app live or
recording player, media sessions/proxy, segment reconciliation, events/histogram/rules,
agent conversation/dispatcher/confirmation execution, indexing worker or natural-language
search. Their typed interfaces are available, but any success UI for them would be premature.

The existing `apps/web` page is an initial placeholder only. No Claude implementation
existed when inspected. Claude may build/replace it; Codex must preserve subsequent Claude
changes. Codex made no full design system or finished product UI in this phase.

## Next two workstreams can now proceed

**Codex:** implement camera/layout services, idempotency/audit, MediaMTX lifecycle and
Range-capable media sessions first. Then the bounded Muse dispatcher and consented worker/
grounded FTS search. Use shared service functions for REST and tools. See WORKSTREAMS A.

**Claude:** implement UX/design/accessibility and route mapping under `apps/web`, import
`@veyra/contracts`, add the constrained server-only adapter and honest states, then connect
live/layout/playback/Muse/search flows as Codex delivers services. See WORKSTREAMS B.

Before integration, coordinate any schema change in API_CONTRACT and regenerate artifacts.
Do not hand-edit generated files or fabricate a backend completion while waiting for the other owner.

## External prerequisites and verification still needed

- An actual Meta MODEL_API_KEY in server environment or ignored root `.env`. Run
  `make meta-smoke`; verify billing/entitlement yourself through Meta. No key was searched
  for in unrelated projects, copied from another application or exposed in output.
- Docker/Compose on a capable machine. Run the exact Compose commands in README; current
  native success does not prove container networking, image builds or Compose behavior.
- Owned/licensed scene footage for the search evaluation and a real approved camera for
  physical-ingest compatibility. The synthetic technical fixture cannot validate either.

The inherited PYTHONHOME mismatch is handled by `-E` in Make/script commands; project Python
3.12.14 works. Dependencies are already installed locally. Start with `make check`; full local
startup and isolated probe instructions are in README. Do not progress to unrelated features
before the three vertical slices meet their acceptance criteria.

---

## Phase 02 — frontend UX and application foundation

The Phase 01 backend/media/Meta status above is retained as historical evidence. This
phase implemented the frontend workstream only; no backend, media, AI orchestration,
database, infrastructure or generated-contract source was changed.

### Frontend delivered

- Eight working application destinations: Overview, Cameras, Live view, Recordings,
  Search, Activity, Saved views and Settings. Saved-layout and timestamped-recording
  detail routes resolve typed IDs/offsets, with loading/error/not-found boundaries.
- A light-first Manrope/sage/teal identity, responsive navigation, original labeled space
  illustrations, reusable UI tokens, object cards, filters and accessible states.
- Selective customized shadcn/ui Button/Dialog patterns with Radix composition, focus
  management and a keyboard command palette. Cmd/Ctrl+K, arrow navigation, Enter, Escape,
  focus restoration and dialog Tab containment are implemented.
- Integrated Muse side panel, contextual entry points, local feature guidance, typed
  destination cards and actual AgentResponse/confirmation/success/failure renderers.
  Local guidance explicitly does not impersonate a Muse response. Missing execution
  receipts are treated as uncertainty, not proof of success or rollback.
- Camera registration from approved source IDs; camera privacy review/confirmation;
  layout draft/review/create; single/four-camera viewing; recording availability and
  timestamp navigation; searchable result cards and neutral activity history.
- Server-only frontend adapter over the existing API. It rejects unknown paths and
  cross-origin browser access, validates request bodies, preserves idempotency/range
  headers, and keeps service credentials out of client bundles. Backend contracts remain
  frozen v0.1.0; their three generated artifact SHA256 values still match Phase 01.
- Explicit `?preview=1` development workspace using generated wire types. Every preview
  has a persistent disclosure; no sample clip or model output is presented as real.
  Local view creation works only within the current preview session and says so.

### Verification and artifacts

Read [`design/VERIFICATION.md`](design/VERIFICATION.md) for final commands, measured
browser results, inspected screenshots and limitations. The browser script lives at
`apps/web/tests/verify-ui.mjs`; its report and screenshots live in `docs/design/verification`.
`make check` also passed with the unchanged 21 backend boundary tests and contract checks.

Design references: [`DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md),
[`USER_FLOWS.md`](design/USER_FLOWS.md), [`COMPONENTS.md`](design/COMPONENTS.md).
Frontend startup, preview URLs and test commands are in `apps/web/README.md`.

Dependency additions are scoped to the web workspace; the root npm lockfile was updated
by npm. Next generated a local `apps/web/AGENTS.md` and its type-reference file. Root
engineering rules, Python dependencies, Compose, media config and database files were preserved.

### Backend-dependent work remains

- Actual camera/layout persistence, media-session authorization/exports, video indexing,
  search and Muse orchestration remain the existing backend workstream. The new pages
  surface service/501 errors; they do not turn on sample data as an implicit fallback.
- The new player attaches native MP4/HLS or hls.js only after receiving a validated real
  media session. No real app playback or Muse inference was available to verify in this
  frontend phase. Prior standalone media feasibility is not proof of the new UI integration.
- Space grouping is display-only fixture metadata because the frozen Camera schema has
  no space field. Actual cameras use the workspace grouping. Global recording settings,
  event pagination, layout editing and analysis-job launch/polling UX remain unfinished.
- Contract-result rendering tests use explicitly labeled, isolated wire fixtures, including
  decline/expiry and safe navigation. They are not claims of actual model execution.
- The Phase 01 `scripts/foundation_smoke.py` still asserts the old placeholder page's health
  sentence. Its backend owner should update that frontend assertion before reusing the
  combined probe; it was not changed or rerun in this frontend-only phase. Use the new
  frontend browser QA for the current UI.

Next: the backend owner can implement the frozen endpoints while the frontend owner connects
real results, verifies actual media sessions, and evaluates the three demo slices jointly.
Keep the missing Meta credentials and Docker verification gates from Phase 01 explicit.

---

## Phase 03 handoff — functional VMS backend and media

Completed October 26 Pacific / October 27 UTC, 2026. This section supersedes earlier statements
that camera/layout/media REST operations are unimplemented. Phase 01/02 status is preserved above.

### Implemented scope

- Canonical API package moved from `services/api/veyra` to `apps/api/veyra`; backend startup,
  Dockerfile, migration/export/smoke scripts and tests now use that path. Web source was preserved.
- Camera create/list/get/update/soft-delete, approved source listing, friendly names, optional
  group/location, consent/enabled settings and actual MediaMTX connection/error observations.
- Configurable literal-IP CIDR plus TCP-port RTSP admission. URLs/credentials stay in private
  server configuration. New pull registration/configuration requires a matching egress-policy
  manifest; absent policy fails closed. Container initialization installs IPv4/IPv6 destination
  rules before dropping privileges. Linux firewall execution remains unverified here.
- Explicit FFmpeg sample sources and publisher script. Real RTSP/TCP → MediaMTX HLS/fMP4;
  authenticated principal-bound sessions rewrite manifests to same-origin opaque resources.
- Actual finalized-segment recording, fixed completion hook, FFprobe verification, PostgreSQL
  recording/segment metadata, UTC timestamps, file availability reconciliation and bounded MP4
  export with Range 206/416. Playback correctly applies actual_start + seek = requested offset.
- Saved layouts with camera validation, atomic create/replace, optimistic versions, 2×2 support,
  durable idempotency (24h) and audit rows. Camera deletion rejects saved-layout references.
- Migration 002, API liveness/DB readiness, JSON application lifecycle/error logs, native stack,
  API seed script and real end-to-end acceptance runner. Compose adds FFprobe, recording hook,
  persistent playback cache and private egress-policy volume.
- Optional read-only viewer principal; camera/layout writes require operator access. Media
  sessions are owned by principal. This is a local shared workspace, not production multi-tenancy.

Implemented endpoints: `/camera-sources`; camera GET/POST/list/PATCH/DELETE and live-session;
layout GET/POST/list/PUT; recording GET/list/segments; POST playback-sessions; GET authenticated
media resources; existing health/features/capabilities. All product paths use `/api/v1`.
Events/activity/rules/search/analysis/agent execution remain typed 501s. No Muse call or video
indexing pipeline was added, and the existing missing-key Meta gate remains unchanged.

### Contract coordination

The additions were documented before implementation in
[`PHASE_03_CONTRACT_PROPOSAL.md`](architecture/PHASE_03_CONTRACT_PROPOSAL.md).
Optional grouping/location/connection_error fields and camera DELETE are described in
[`API_CONTRACT.md`](architecture/API_CONTRACT.md#phase-03-additions) and generated
[`openapi-phase03.json`](architecture/openapi-phase03.json). No existing required field,
operation ID, media time unit or frontend route changed. Frozen shared OpenAPI, generated
TypeScript and agent-registry artifacts still pass their original drift checks.

The frontend adapter currently rejects grouping/location inputs and DELETE; frontend ownership
must integrate those additions before exposing their UI. Existing camera/layout/media requests
already work through the unchanged adapter and were verified in Chromium. Capability execution
flags remain conservative; the next AI phase must connect typed tools and update availability.

### Actual commands and results

| Command / check | Actual result |
| --- | --- |
| `make check` | Ruff lint/format, **59 backend tests**, frontend TypeScript, frozen contract drift: passed |
| `make contracts-check` | Frozen OpenAPI/TS/agent registry match their sources |
| `.venv/bin/python -E scripts/foundation_smoke.py` | Fresh PostgreSQL 15.19, both migrations apply/reapply, FK rejection, SQL-only FTS fixture, API readiness, actual Next adapter → API: passed |
| `.venv/bin/python -E scripts/vms_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx` | Full real native acceptance, including browser and restart: passed |
| `.venv/bin/python -E scripts/export_runtime_openapi.py` | Current additive backend schema generated |
| Compose YAML parse / binding inspection | Passed; **not** Docker Compose validation or container execution |

Latest acceptance report (rerun 02:04 UTC October 27):
[`vms-phase03.json`](evidence/vms-phase03.json).
It observed four separate 640×360 H264 RTSP publishers advancing in the unchanged Next UI,
**60000 ms / six finalized segments** for the selected recording, and a real 1,357,855-byte
8.533-second MP4 export with working byte ranges. Requested recording offset **52000 ms** mapped
to actual segment offset **49497 ms** plus **2503 ms** player seek. Chromium initially showed
2.503 seconds in that clip, then advanced and sought to 5 seconds; its seekable range was [0,10].
This tests media/timestamp mapping, not AI scene-grounding accuracy or production performance.

Four actual camera IDs and a four-cell layout were committed and retrieved. After stopping and
restarting the API, the same cameras, layout, recording and authorized playback session remained
usable. The test checked bad tokens, read-only writes, unknown sources, duplicate/conflicting
idempotency, missing layout cameras, stale layout versions, in-use deletion, disabled/offline
streams, real HEVC codec rejection, actual source-file and directory removal, invalid ranges,
expired sessions and a real MediaMTX process outage. After interrupting the source and rejecting
HEVC, a replacement H264 publisher became online, served HLS, and persisted a new verified
segment. Eight durable mutation audit records were observed.

Screenshots were inspected: [four live samples](evidence/vms-phase03-browser-live.png),
[timestamped recording](evidence/vms-phase03-browser-playback.png).
[Foundation report](evidence/foundation-phase03.json). Private logs/video remain in
`runtime/vms/20261027T020414974358Z`; credentials in connection.json/web.env are not copied to docs.
The final full run passed without changing backend media timestamps or frontend code. Hash
comparison confirmed all 45 frontend source files unchanged. All owned test services stopped.

Resume verification also found and fixed a real retention bug: `Pipeline.ingest` returned early
when a whole camera directory disappeared, leaving its recordings advertised as available.
The new acceptance scenario failed before the fix with the real stack (`--skip-browser`,
`runtime/vms/20261027T020159419098Z`), then passed after missing-file reconciliation was moved
outside the directory-presence condition. Ready segments are now invalidated even when their
parent directory is absent or a symlink. The final acceptance includes this regression and
stream recovery; no mocked service response supplies either result.

The first resumed acceptance invocation was denied localhost port binding by the sandbox;
rerunning with local-service execution permission succeeded. `make check`, the foundation
probe and Compose YAML/binding inspection were rerun successfully. Docker remains absent.

### Working development commands

See [`PHASE_03_VMS.md`](architecture/PHASE_03_VMS.md) for prerequisites/configuration. Native:

```sh
.venv/bin/python -E scripts/vms_native.py --mediamtx /tmp/veyra-mediamtx/mediamtx --runtime runtime/vms-dev
# Separate terminal, after stack startup:
.venv/bin/python -E scripts/seed_vms.py --connection runtime/vms-dev/connection.json
node --env-file=runtime/vms-dev/web.env node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1
```

Open http://localhost:3000. The existing Phase 02 production build was used; no frontend rebuild
or source modification was needed. The native stack writes its chosen loopback API/media/DB ports
and private server environment under runtime. Reuse the same --runtime to preserve rows/files;
Ctrl-C stops owned services. Use a fresh demo directory rather than the failure-test directory.
`services/media/sample_camera.py` also provides a standalone fixed synthetic publisher.

Compose instructions: replace token/HLS secret placeholders in private .env; run
`docker compose config --quiet`, then `docker compose --profile fixture up --build`. Seed through
the API with the private operator environment. These commands remain pending Docker verification.

### Known limits and next-phase dependencies

1. **Docker is absent.** Custom media/API images, Compose startup, NET_ADMIN/iptables/ip6tables
   execution and exact redirect-egress behavior on Linux have not run. Validate those on Docker
   before enabling LAN pull. Native sample ingestion did not bypass the camera source policy.
2. **No physical camera was available.** H264 synthetic publishers and a real HEVC negative case
   were tested. Physical RTSP authentication, reconnect behavior across device vendors and AAC
   audio need device testing. General codec transcoding and WebRTC remain outside this phase.
3. The backend is one local workspace with server-side tokens. Public auth/session management,
   tenant isolation, TLS, production quotas and enterprise operation are not implemented.
4. Five-minute media sessions require renewal by a future frontend iteration for continuous
   long viewing. Clip/cache/time limits fail explicitly; an export process crash can leave an
   orphan cache file requiring operator cleanup with the stack stopped. Retention defaults to
   24h; completion markers can outlive deleted video and are ignored/reconciled.
5. The nonfatal Starlette TestClient/httpx deprecation warning remains. No dependency migration
   was attempted in this phase. The old foundation probe's obsolete placeholder-page assertion
   was replaced with an actual same-origin adapter request and rerun successfully.
6. One intermediate browser run failed at playback-session creation before the HTTP error
   code was captured (`runtime/vms/20261027T020042683391Z/browser.json`). The final instrumented
   browser run passed. The browser probe now preserves failure status/code for diagnosis;
   export contention is only a hypothesis, not a confirmed cause. Reproduce any recurrence
   before changing the frontend or export concurrency policy.
7. Next AI workstream: real Meta credentials/smoke first; typed tool adapters must call these
   service functions with authorization, idempotency and actual receipts. Then implement
   consented finalized-segment indexing and grounded search. No simulated Muse success qualifies.

Phase 03 ends here; AI orchestration/indexing and frontend extensions were not started.

---

## Phase 04 handoff — Muse Agentic Control Plane

Implemented October 26 Pacific / October 27 UTC, 2026. **The backend execution gate passes
with a scripted provider and a real PostgreSQL database. The genuine Muse end-to-end gate
is not verified: this project's MODEL_API_KEY is absent.** No live Meta success is claimed.
Phase 04 stops here; indexing/search and frontend implementation remain later work.

### Delivered backend

- Dedicated server-side first-party Meta adapter, default `muse-spark-1.3`, Standard mode only.
  Official model/tool/structured-output/error documentation was checked; references and exact
  protocol decisions are in [`PHASE_04_AGENT.md`](architecture/PHASE_04_AGENT.md).
  It validates response/summary/tool-call shapes, limits response size, bounds timeouts/attempts,
  retries transient failures with Retry-After/backoff, rejects redirects and never exposes keys
  or provider error bodies. The live smoke also checks the authenticated account model catalog.
- Twelve typed executable capabilities: introspection, feature discovery/navigation, camera
  list/status/navigation, layout list/get/create, recording list/open and database status.
  See [`AGENT_TOOLS.md`](architecture/AGENT_TOOLS.md). Search/rule/recognition tools are absent.
  Camera settings resolve to the actual cameras feature; deep links use the frozen typed targets.
- Bounded eight-turn/twelve-tool/60-second Muse loop, authenticated operator/viewer checks,
  DB-grounded name resolution, ambiguous-name candidates, missing/disabled-camera failures,
  safe typed navigation and durable action receipts. User/retrieved text has no action authority.
  Execution messages/links are built from backend results; model prose cannot fabricate success.
- Migration `003_agent.sql`, durable message reservation, history scoped to principal,
  duplicate/conflicting request handling, action-call idempotency and audit state transitions.
  Abandoned runs fail closed; inference does not hold a DB transaction open.
- Every agent layout now needs a two-minute, principal/run/action/preview-bound, single-use
  confirmation. This intentionally tightens the earlier explicit-request shortcut. A model or
  a “yes” chat message cannot approve it. The exact camera identities/details are rechecked
  under lock, and the actual `store.save_layout` service used by REST commits with the decision,
  operation idempotency and audit. Failures roll back inserts. Concurrent retries save once.
- A separate DB connection after commit reloads and compares the actual layout. Only matching
  persistence yields a verified result and layout link. Verification failure truthfully preserves
  a committed operation with failed overall status. Interruption after commit is recoverable
  by retrying the original decision key, without another write.
- Additive runtime response fields for suggestions, target, camera preview/candidates, executed
  operations, verified results and errors. Existing action and confirmation shapes remain usable.
  Original message idempotency snapshots stay stable after a separate confirmation decision.
- Re-verification fixed provider-dependent message replay, late completion overwriting verified
  run state, and unexpected write/verification errors that previously returned only 500.
  Replays now work after key removal; the original message and latest decision keep their own
  receipts. Unexpected insert failures roll back and record audited single-use failures;
  verification errors preserve actual committed operations. Seven additional cases cover these.
- `make agent-live-smoke` enforces genuine Muse acceptance with `--require-live` and cannot pass
  a skipped live test. Reports separate `full_acceptance_gate` from backend-only success.

### Actual verification

| Command/check | Observed result |
| --- | --- |
| `make check` | Ruff lint/format, **123 passed / 1 skipped**, existing web TypeScript, both contract checks: passed |
| `make agent-smoke` | **64 passed / 1 skipped**; actual isolated PostgreSQL + REST/tools/transactions, explicitly scripted Meta HTTP |
| `make agent-live-smoke` | **not passed** (make exit 2, script exit 1): backend **64 passed / 1 skipped**, `full_acceptance_gate:unverified` because the genuine test lacks MODEL_API_KEY |
| `.venv/bin/python -E scripts/foundation_smoke.py` | PostgreSQL **15.19**, migrations apply/reapply, FK/SQL fixture, real API readiness/catalog and actual Next→API: passed |
| `make contracts-check` (also invoked by `make check`) | Frozen OpenAPI/TS/registry and Phase 04 runtime OpenAPI/TS/catalog: match |
| `make meta-smoke` | **skipped: MODEL_API_KEY not configured** |
| Genuine Muse natural-language→saved-layout test | **skipped: MODEL_API_KEY absent**, not a mock success |
| Web/frozen boundary hashes | **46 baseline web files + 3 frozen artifacts unchanged** |

Acceptance evidence: [`agent-phase04.json`](evidence/agent-phase04.json). The recorded creation
scenario used the real Entrance/Garage/Garden/Lobby rows in the disposable test database. It
created and independently fetched layout `b1e9b12f-40fd-4130-8399-a2766e6d1ec3`, two columns and
four cells, after approval. The proposed camera UUIDs, committed API result, GET response and
verification/navigation receipt are included and labeled **scripted Meta HTTP, not live Muse**.
No layout existed before approval. The suite verifies audit/idempotency rows alongside persistence.
The latest evidence is from **2026-10-27 03:44 UTC**; its `status:passed` describes the backend
suite, while `full_acceptance_gate:unverified` leaves genuine Muse acceptance open. Official
Meta model, tool-call, structured-output and error documents were rechecked during this run.

Before correction, targeted PostgreSQL tests reproduced **five failures**: three replay variants
returned 503 without a key, late completion changed `completed` back to `awaiting_confirmation`,
and an unexpected exception after a real insert produced only 500. A separate verification test
reproduced a sixth failure after commit. All seven new cases now pass, including the missing-key
new-request control. These are additional backend regressions, not evidence of live Muse behavior.

Other exercised cases include settings selection, real garage resolution, ambiguous/missing
cameras, unknown tools, viewer denial, approval-time permission revocation, invalid/truncated
model responses, invalid tool fields, duplicate and concurrent requests, decline/expiry/foreign
confirmations, preview tampering, camera rename/disable/delete between proposal and approval,
provider/tool failures, rollback after an actual insert, verification read failure, recovery
between commit and verification, injected camera names, chat approval rejection and loop limits.
Fresh service instances successfully reused pending approval and persisted state. This is not
claimed as a full operating-system/API process restart or a browser-to-live-Muse run.

Supporting reports: [Meta skip](evidence/meta-phase04.json),
[foundation](evidence/foundation-phase04.json), [ownership hashes](evidence/phase04-boundaries.json).
Ignored per-run acceptance artifacts are under `runtime/agent-phase04`; disposable PostgreSQL
instances stop and their data directories are removed. The first sandboxed PostgreSQL attempt
failed at `shmget: Operation not permitted`; permitted local-service execution then passed.
The existing nonfatal Starlette TestClient/httpx deprecation warning remains.

### Contract and frontend coordination

Frozen `packages/contracts` files were preserved. Generated current runtime artifacts are
[`openapi-phase04.json`](architecture/openapi-phase04.json),
[`api-phase04.d.ts`](architecture/api-phase04.d.ts), and
[`agent-tools-phase04.json`](architecture/agent-tools-phase04.json). Generate with
`make agent-contracts`; they now participate in drift checking. The legacy runtime exporter
forwards to the Phase 04 exporter and does not overwrite the historical Phase 03 snapshot.

No `apps/web` edit, commit, push, PR, deployment or external message occurred. The existing web
adapter already accepts the message/boolean-confirmation requests and passes responses through.
Its action renderer supports existing receipts and typed links. Its owner should integrate the
richer layout preview/candidate/verification fields and runtime types. The adapter has a **15s**
upstream timeout while the backend agent budget is **60s**: long real requests can time out in
that UI. Same-key retries recover existing runs/receipts; coordinate the frontend timeout before
claiming complete UI acceptance. No frontend source change was made to hide that limitation.

### Remaining gate and restart instructions

1. Supply `MODEL_API_KEY` through this project's private server environment or ignored `.env`;
   keep Standard-mode `META_MODEL=muse-spark-1.3`. No keys were sought in unrelated projects.
2. Run `make meta-smoke`. It must successfully observe the actual account model catalog,
   genuine text, structured output and read-only tool calling. Invalid/denied API access fails.
3. Run `make agent-live-smoke`. With the key present the genuine-Muse test must propose the
   four-camera layout, wait for explicit confirmation, commit and independently verify the row.
   Until that test runs successfully, **natural language → genuine Muse tool call → real saved
   layout → verified frontend result remains unproven**.
4. Apply migration 003 to an existing development database with `make migrate` before restarting
   the updated API. Then coordinate the web timeout/preview integration and test the real UI.

Docker/physical-camera gates from Phase 03 remain unchanged and were not re-claimed in this phase.
No video inference, consented indexing, semantic retrieval or event-rule implementation was added.

---

## Phase 05 handoff — video indexing, search and activity

Implemented October 26 Pacific / October 27 UTC, 2026. This supersedes earlier indexing/search/
event implementation status. **Backend and real-media integration pass; genuine Muse video
analysis/search and the full definition-of-done gate remain unverified without credentials
and configured positive budgets.** No actual AI inference, model accuracy or API bill is claimed.

### Delivered

- Migration `004_indexing.sql`: versioned per-segment checkpoints, leased/fenced recording
  jobs, JSONB objects/apparel/event metadata, uncertainty, source/clip provenance, motion
  samples, API usage/reservations, indexes, normalized observation view and DB grounding triggers.
- Completion reconciliation creates waiting segment work. An acknowledged, consented operator
  request selects at most 30 segments/300 seconds. A separate worker performs actual FFprobe,
  bounded low-resolution FFmpeg sampling, motion-focused short-clip selection and silent H264
  extraction. No synthetic footage or fixture labels are substituted in normal application flow.
- First-party Standard Muse Files upload/expiry/deletion + strict Responses schema adapter.
  Observable objects and clothing colors remain associated with their object/garment. Negative,
  reversed, out-of-clip, refused, malformed or sensitive outputs fail without fabricated metadata.
  Actual uploaded bytes, token reports, request times and cleanup outcomes are tracked.
- Worker uses SKIP LOCKED, renewable 60s leases, 15s heartbeat, fencing tokens, three attempts,
  bounded retry delay, durable checkpoints, transactionally published observations/events and
  audited claim/completion/failure transitions. Camera consent/source integrity are rechecked.
  Changed configurations retire unstarted/stale old work with `INDEX_VERSION_CHANGED`; live
  older work returns `INDEX_VERSION_IN_PROGRESS` rather than blocking silently or changing model.
- Daily request/monetary admission and a two-inference limit use PostgreSQL locks/reservations.
  Default monetary budgets are zero. Optional account-provided token prices produce estimates;
  unknown/failed costs retain reservations. Actual provider billing remains null/unknown.
- Natural-language REST search parses Muse intent with current UTC/IANA timezone and real
  camera descriptors, validates/intersects explicit filters, then reads actual stored indexes.
  Retrieval prioritizes camera/time, same-object/same-garment/event filters and PostgreSQL FTS.
  The new `video.search` Muse capability calls the same retrieval service without reanalysis
  or recursive inference. Registry now has thirteen typed capabilities; no vector/SAM service.
- Every hit has actual IDs/times, evidence IDs, matching metadata, source/model versions,
  uncertainty, playback action and exact-segment playback request. Missing/changed files are
  excluded. Empty searches explain indexed coverage rather than proving no activity occurred.
- Native replay exposed overlapping segment capture-clock intervals. Optional `segment_id`
  on `/playback-sessions` now selects the exact analyzed source file for authenticated MP4
  preparation. This prevents offset-only ambiguity from choosing a different covering file.
- Activity bins distinguish unioned recording availability, analyzed clip coverage, locally
  sampled motion coverage, active pixel-change duration and start-counted model event density.
  Events support bounded keyset pagination and real recording navigation.
- Licensed real evaluation dataset: three small CC BY 3.0 derivatives, attribution/checksums,
  reviewed labels and actual 3003/4004/4004ms durations. Scripted integration and separately
  gated genuine-Muse evaluation distinguish fixtures from actual model correctness/cost.

Implemented routes: existing `/analysis-jobs`, job polling, `/search`, `/events`, camera
`/activity`, plus `/recordings/{id}/index`, `/analysis-usage` and optional exact-segment playback.
See [API coordination](architecture/API_CONTRACT.md#phase-05-coordination),
[operation and limits](architecture/PHASE_05_INDEXING.md), and
[dataset license/labels](../apps/api/tests/fixtures/video/LICENSE.md).

### Actual verification and measurements

| Command/check | Observed outcome |
| --- | --- |
| `make check` | Ruff lint/format, **152 passed / 2 skipped**, unchanged web TypeScript and both contract checks: passed |
| `make contracts-check` | Frozen Phase 01 artifacts and generated Phase 05 OpenAPI/TS/tool catalog match |
| `make index-smoke` | **29 passed / 1 skipped** plus actual RTSP/MediaMTX/worker/search/exact-segment playback: passed with explicitly scripted Meta HTTP |
| `make index-live-smoke` | Backend **29 passed / 1 skipped**, native scripted probe passed, genuine gate **unverified**; script exit 1 / make exit 2 because key/budgets are absent |
| `make meta-smoke` | skipped: MODEL_API_KEY not configured; no media uploaded |
| `.venv/bin/python -E scripts/foundation_smoke.py` | PostgreSQL **15.19**, all four migrations apply/reapply, FK/SQL FTS fixture, API readiness and unchanged Next→API: passed |
| Ownership hashes | All **46 web files + 3 frozen package artifacts** unchanged |
| Compose YAML/worker volume inspection | passed; Docker execution not run because Docker is unavailable |

Latest recorded local evaluation: 11.011 seconds of licensed fixture media indexed in
**0.866 seconds**, with measured per-clip processing **202 / 333 / 308ms** and search **11ms**.
These include real FFmpeg/PostgreSQL and scripted HTTP; **they do not measure Muse latency**.
The separate native capture indexed two real finalized segments in **0.646 seconds**, with
stored-index search **10ms**. Actual provider model quality, time and bill remain unmeasured.
Scripted token counts/price arithmetic are marked fixtures, never measured API consumption.

Native recording `c2f3c24a-f8c2-515a-946a-ae79aeed518d` contained 11200ms summed segment
durations but 10203ms unioned timeline availability because its clocks overlapped. Histogram/
search coverage use the latter. A matching result requested **9253ms**; exact evidence playback
selected its segment at **9003ms** plus a **250ms** player seek. Its actual 640×480 H264 cache
was 1200ms, returned **HTTP 206**, and FFmpeg decoded an **18,309-byte** JPEG frame at that
seek. This proves media/service/time mapping with scripted descriptions, not genuine detection.

Reports: [combined evaluation](evidence/index-phase05.json),
[native recording/playback](evidence/index-native-phase05.json),
[live prerequisite gate](evidence/index-live-phase05.json),
[foundation](evidence/foundation-phase05.json),
[ownership/Compose inspection](evidence/phase05-boundaries.json).
All owned PostgreSQL, API, MediaMTX and replay processes stopped. Private generated video,
DBs and logs remain ignored under `runtime/i5` and `runtime/index-evaluation`.

Earlier probe iterations exposed macOS's Unix-socket path limit and a scripted observation
extending beyond the short trailing segment. The probe uses a short private directory and
bounds fixture intervals to actual durations. Production timestamp validation rejected that
bad output before publication. Final commands above passed after those probe corrections.
The existing nonfatal Starlette TestClient/httpx deprecation warning remains.

### Remaining gates and limitations

1. Set this project's private `MODEL_API_KEY`, positive `MODEL_DAILY_BUDGET_USD` and
   `MODEL_REQUEST_RESERVE_USD`, optionally verified token prices. Run `make meta-smoke`, then
   `make index-live-smoke`. The latter must genuinely analyze the three licensed clips, measure
   six object/event/apparel/time/camera/no-match queries, and complete live RTSP evidence playback.
   It cannot pass a skipped genuine evaluation. No keys were sought in unrelated projects.
2. Sampling can miss brief objects/events. Pixel change includes lighting, cuts and camera
   movement. Model intervals are estimates within verified clips, not frame-accurate boundaries.
   The small single-source dataset has no positive red-jacket/night/entrance/garage scene;
   neither general accuracy nor those positive-case recalls have been established.
3. No identity, demographic/intent inference, SAM tracking, semantic embeddings, vector service,
   rule execution or distributed analytics was added. Search uses bounded lexical/structured
   constraints and can miss synonyms. Unknown analysis never implies inactivity.
4. Frontend source is untouched. Its owner must integrate Phase 05 types, timezone, per-segment
   playback requests, usage/job UI and separate activity metrics. Existing offset-only links can
   be ambiguous when segment clocks overlap. No browser-to-genuine-Muse UI acceptance is claimed.
5. Apply migration 004 before restarting an existing API; run the separate worker with
   `make index-worker`. Configure the same model/sampling settings for API and worker.
   New finalized segments await another explicit bounded acknowledgment. Failed jobs do not
   silently reset their attempts. Docker and physical-camera gates from earlier phases remain.

Generated runtime artifacts are `openapi-phase05.json`, `api-phase05.d.ts` and
`agent-tools-phase05.json` under `docs/architecture`. Frozen package and Phase 03/04 snapshots
are preserved. No commit, push, deployment, external message or frontend edit was made.

---

## Phase 06 handoff — real frontend integration

October 26 Pacific / October 27 UTC, 2026. Frontend owner (Claude). Only `apps/web/**`, its
tests, frontend docs/verification output and this handoff were edited. No backend, contract,
migration, script or infrastructure file was changed. No commit, push, deployment or external
message was made.

### Credentials

The Meta key was supplied by the operator and placed only in the root private `.env`
(gitignored, mode 600) as `MODEL_API_KEY`, with `META_MODEL=muse-spark-1.3`,
`MODEL_DAILY_REQUESTS=100`, `MODEL_DAILY_BUDGET_USD=5`, `MODEL_REQUEST_RESERVE_USD=0.05`.
These budget values are operator admission ceilings chosen for this session, not Meta prices.
The API and worker read it server-side; the web app never reads it. Checked: zero committable
files contain the key, and neither the key nor `MODEL_API_KEY` appears in `.next/static`.

### Delivered frontend

- **Runtime types.** `src/lib/types.ts` imports the generated Phase 05 runtime types through the
  `@veyra/runtime-contract` tsconfig alias for `docs/architecture/api-phase05.d.ts`. Frozen
  `@veyra/contracts` is untouched.
- **Adapter.** Phase 05 routes (`recordings/{id}/index`, `analysis-usage`, `DELETE cameras/{id}`),
  camera `group_name`/`location`, search `timezone`, playback `segment_id`. Upstream timeouts:
  70s agent (backend budget 60s), 60s search, 30s media, 15s otherwise. Timeouts return a typed
  504 `UPSTREAM_TIMEOUT`; 204 responses pass through without a body.
- **Errors.** The client preserves the server message, code, `retryable` and `request_id`. UI shows
  the code and a short reference. 501/503 no longer replace a server's specific message.
- **Cameras.** Real groups/locations, connection errors, 5-second quiet status polling,
  registration from approved sources (in-use sources hidden), edit name/group/location/active,
  consent review, removal behind an `alertdialog`. `CAMERA_IN_USE` names the referencing views.
- **Live.** One player for single and 2×2/saved arrangements. Saved views are read by ID, so a
  view Muse just created opens immediately; columns, gaps and removed cameras render honestly.
  Explicit connecting, buffering, offline (with `connection_error`), stream-error and retry
  states. Live sessions renew 20s before expiry. A camera that comes online is retried once.
- **Recordings.** Direct read of a linked recording, local-time filters, exact `segment_id`
  playback, ±10s, previous/next moment, `mm:ss` jump, click-to-seek timeline, optional
  auto-continue between 30-second clips, and "resume here" when a viewing link expires.
- **Histogram.** `ActivityHistogram` renders recorded coverage (context), measured motion and
  Muse event starts separately, using a validated palette, tooltips, legend, table view and
  roving-tabindex keyboard navigation. Clicking a bin opens its server-provided playback
  target. It appears on recordings (recording window) and Activity (last 24h).
- **Indexing.** A recording panel shows real segment index states. "Make searchable" opens an
  explicit upload consent dialog, posts an idempotent analysis job, polls once per second, and
  reports progress, success/usage or the failure code. Retry continues with the remaining
  segments.
- **Search.** Natural-language search with IANA timezone and local-day windows. Shows parsed
  constraints, explanation, coverage, analyzed/available time and latency. Each hit shows its
  caption, evidence text, objects, events, uncertainty and provenance, and opens its exact
  `playback_request` (recording, offset and segment). Correctable 422s are distinguished from
  outages. Links from Muse (`/search?q=`) run once.
- **Activity.** Server-side camera filter and keyset "Show older activity" pagination.
- **Muse.** The command bar, home prompt and contextual buttons send the user's words to
  `/agent/messages`; the thread persists while the panel is closed. Typed renderers cover:
  - feature suggestions;
  - camera, layout and recording navigation links (from `suggested_actions` and receipts,
    deduplicated);
  - search moments;
  - the layout proposal (grid preview, camera status, expiry countdown, approve/decline);
  - generic confirmations;
  - verified results, and committed-but-unverified results;
  - decline outcomes, errors, unsupported capabilities and ambiguous-camera candidates;
  - a "What Muse did" step trace.

  Unknown target kinds render nothing. Model prose is never turned into commands. Requests show
  elapsed time, can be abandoned, and "Check again" reuses the same Idempotency-Key. In preview
  mode the panel is a local guide labeled "Not Muse".
- **Settings.** Today's real analysis/search usage ledger (requests, upload bytes, reservations;
  billing stays unknown).

### Defects found and fixed while verifying

1. A recording still in progress recomputed the histogram window on every render, sending about
   2 activity requests per second (268 in 100s). The window is now stable and advances every 30s.
   An 11-minute soak afterwards made 2 requests per 30s with no errors. The page crash observed
   during an earlier 15-minute indexing session did not recur after this fix. Its exact
   exception was not captured.
2. Chromium (the Playwright build) now reports native HLS support, and its native demuxer
   intermittently failed on the fMP4 playlist (`DEMUXER_ERROR_COULD_NOT_PARSE`; all three live
   tiles of a saved view failed). hls.js is now preferred wherever MSE exists, with native HLS
   only as a fallback (iOS). Three consecutive loads then played all tiles.
3. Muse duplicated feature cards (discover + navigate return the same target). Destinations are
   now deduplicated.
4. Receipt-only navigation (no `suggested_actions`) and failed-action errors without an `errors`
   field were not rendered. Both now render. Navigation uses real links.
5. The preview settings link lost its `#recording` anchor. Restored.
6. Contrast failures: `.error-reference` (4.07:1) and the Phase 02 real-camera placeholder text
   (4.1:1) were raised to WCAG AA (placeholder now 5.5:1).

### Real-stack verification

Stack: `scripts/vms_native.py` (dedicated PostgreSQL, MediaMTX 1.21.3, API, 4 publishers), the
worker (`services/worker/main.py`) on the same DB/recordings, and `next start` with the production
build. Three sample publishers are synthetic `testsrc2`. The fourth path (`fixture_4`, camera
"Trail camera", consent on) was republished by the operator script with the project's licensed
CC BY 3.0 film `runtime/evaluation/dirt-jump-biking.webm` (Henry Geer), looped. Its camera
location says so. "Garage" was deliberately stopped for the offline case.

`apps/web/tests/live-flows.mjs` (no mocks), last full run `2026-10-27T06:10Z`. Report and
screenshots are in `docs/design/verification/phase06/`.

| Flow | Result | Observed |
| --- | --- | --- |
| 1 Register a camera via UI and view it | passed (separate run) | Source list from API; registered "Front entrance"; live HLS first frames 564ms |
| 2 Open recorded media | passed | First frames 313ms; +10s → `offset_ms=10000`; histogram bin → recording at 120000ms; `0:05` jump |
| 3 Create and open a layout | passed | 4 tiles, video playing, survives reload, `GET /layouts/{id}` has 4 cells |
| 4 Muse: find a feature and navigate | passed | Genuine Muse 2.8–4.3s; "Open Cameras" → `/cameras` |
| 5 Muse: create a layout and verify | passed | Proposal with 4 cameras (Garage shown offline); absent before approval; "Saved and verified"; opens with 4 tiles; listed in Saved views |
| 6 Search indexed video → recording | passed | "a person riding a bicycle": 20 Muse-indexed results, coverage partial, 5.8–11.4s; opened `segment_id` evidence at 18:39, frames 198ms |
| 7 Failure states | passed | Offline camera shows `SOURCE_OFFLINE` and no video; "a dog running" empty state; "red truck at night" → `UNSUPPORTED_SEARCH_CONSTRAINT` (one earlier run: `INVALID_MODEL_OUTPUT`); Muse "Basement" → `CAMERA_NOT_FOUND` receipt; missing-camera layout → no proposal; identity request → `UNSUPPORTED_CAPABILITY` |
| 8 Responsive/accessible real pages | passed | 8 routes × phone/tablet, no horizontal overflow; histogram keyboard labels; axe 11 scans, 0 violations |
| 6i Make a recording searchable via UI | **failed (backend)** | UI consent → job → progress → result works. 3 attempts each ended `INVALID_MODEL_OUTPUT`; 36 segments indexed (enough for flow 6) |

Console noise in the final run: the expected 422 from flow 7 and one 503 response whose route
was not identified. No flow surfaced it as a failure.

| Command/check | Observed result |
| --- | --- |
| `make meta-smoke` | passed: model catalog, text, structured output, read-only tool call (genuine Meta) |
| `make check` | passed: Ruff lint/format, 153 passed / 1 skipped backend tests, web typecheck, frozen + Phase 05 contract drift |
| `make agent-live-smoke` | **passed**: 65 passed / 0 skipped, `live_meta` passed, `full_acceptance_gate: passed` (rewrote `docs/evidence/agent-phase04.json`) |
| `make index-live-smoke` | **failed**: 29 passed / 1 failed, `test_genuine_muse_video_evaluation` job `INVALID_MODEL_OUTPUT`; native not run; gate failed |
| `npm run lint` / `typecheck` / `npm run build` | passed (zero warnings) |
| Prettier check of edited web sources/tests | passed after `--write` |
| `tests/verify-ui.mjs` (preview fixtures) | passed: 24 route/viewport checks, 30 interactions, 29 axe scans, 0 violations |

Usage today in the dev database when measured: 40 succeeded and 5 failed video analyses,
10 succeeded and 1 failed search parses, $2.80 reserved (configured estimate only; billing unknown).
Agent chat calls are not in this ledger (issue 3). The isolated acceptance databases kept their
own ledgers.

### API issues for Codex

These are documented, not worked around. The backend was not modified.

1. **One invalid Muse output aborts the whole analysis job, and the error is misattributed.**
   `INVALID_MODEL_OUTPUT` is non-retryable in `index_worker.once`, so the first rejected clip
   fails the job. `index_store.fail` then stamps every still-`queued` segment with the same code,
   although they were never sent. Observed:
   - UI-driven jobs failed after 4, 16 and 12 successful clips.
   - Ledger: 5 failed vs 40 succeeded video analyses.
   - The same failing segment validated on two later manual calls (nondeterministic).
   - `make index-live-smoke` reproduces it.

   Requested: isolate failures per segment (or make them retryable within the attempt budget),
   and keep never-attempted segments as queued/waiting. The UI explains the current behavior and
   offers a retry.
2. **Likely truncation reported as invalid output.** Failed video analyses used 2,047–3,459 output
   tokens, versus a successful average of 2,482 and maximum of 3,277. The failed search parse used
   exactly 4,096 = `max_output_tokens`. Provider bodies are not logged by design, so the violated
   rule is unconfirmed. Requested: classify `status:"incomplete"`/length separately (e.g.
   `MODEL_OUTPUT_TRUNCATED`), and review the token limit/reasoning effort. Expose a sanitized
   rule name if possible.
3. **Agent chat is not metered.** `/agent/messages` Chat Completions calls are not recorded in
   `model_usage` or budget admission; only `video_analysis` and `search_intent` are. The settings
   page labels its figures as analysis/search only.
4. **Muse `video.search` returns only navigation.** `AgentResponse` carries hits as
   `suggested_actions` (label + recording target), without caption, time, `segment_id`,
   `playback_request` or coverage. Muse search links therefore cannot request exact-segment
   playback when clocks overlap. The UI adds "Open video search" with the user's words. Requested:
   an additive typed `search_results` field, or `segment_id` on `RecordingTarget`.
5. **Duplicated completion text.** `response_for` joins every succeeded receipt message, so
   discover + navigate repeat the same sentence (observed in flow 4). The UI shows server text
   verbatim.
6. **Muse's own clarification is dropped.** With a missing-camera layout request, Muse sometimes
   stops after `cameras.list`. The response is then "Found 4 cameras…", with no explanation that
   the named cameras don't exist. Other runs called `layouts.create` and returned
   `CAMERA_NOT_FOUND`. The validated final summary could be surfaced as clearly labeled model text.
7. **Analysis is bounded to a growing recording.** A continuous recording accumulates segments
   indefinitely (291 here); each acknowledgement covers 30. A "latest N minutes" or time-window
   job request would match the UI better.

### Remaining work and limits

- Recording library shows the first 100 recordings (no "load more"); layout editing (PUT) and
  layout deletion UI are not built; there is no job list or cancel (no endpoint).
- Docker/Linux egress firewall and physical cameras remain unverified (no Docker on this Mac).
- Indexing reliability (issues 1–2) blocks a passing `make index-live-smoke` and flow 6i. Search
  and evidence playback were verified on the 36 segments that did index.
- Runtime artifacts (`runtime/vms-dev`, logs, DB, recordings) are private and ignored. Stop the
  stack with Ctrl-C/`kill` of the native script, the worker, the replay publisher and `next start`.

---

## Phase 07 handoff — integration, reliability, security and performance

October 27, 2026. Native demonstration verified; Docker/device portability remains open.
All Phase 07-owned services were stopped. No commit, push, deployment, external message or
design-system change was made. Existing development workspaces were preserved.

### Delivered and corrected

- Added the five reports: [E2E_REPORT](qa/E2E_REPORT.md), [SECURITY_REVIEW](qa/SECURITY_REVIEW.md),
  [PERFORMANCE](qa/PERFORMANCE.md), [KNOWN_LIMITATIONS](qa/KNOWN_LIMITATIONS.md),
  [RELEASE_CHECKLIST](qa/RELEASE_CHECKLIST.md). Exact commands, boundaries, failures and evidence
  are linked there. Previous failed runs remain in timestamped QA evidence directories.
- `scripts/phase07_acceptance.py` starts an isolated real stack, exercises the production UI
  through Playwright, verifies genuine Muse and licensed-video analysis, restarts the actual
  database, records raw timings and stops its services. Browser driver: `phase07_browser.mjs`.
- Reproduced strict video-observation rejection live. Named observation rejections and output
  truncation retry within the existing three-attempt lease budget. Invalid metadata remains
  rejected; successful checkpoints survive; unattempted clips are waiting, not falsely failed.
- Closed application chat's budget bypass: shared durable `agent_turn` reservations/token
  accounting. **Apply migration `005_agent_usage` before restarting the API**; readiness checks
  it. Configured reservations are not provider prices or actual charges.
- Reproduced and corrected an intermittent `MEDIA_BUSY` playback race: late camera details
  caused a second recording export. Actual metadata delayed by 600 ms now causes one export.
- Fixed timezone hydration mismatch when the server uses UTC and browser uses Los Angeles.
  Existing Veyra design tokens, typography, components and visual identity are preserved.
- Runtime navigation retains optional `segment_id` through search/activity, Muse receipts and
  frontend links. Frozen package contracts are unchanged. Runtime artifacts were regenerated
  from their sources after documenting the addition in API_CONTRACT.
- Reproduced genuine Muse search argument errors: nullable fields were filled with invalid
  sentinel strings. Unspecified tool time/reason fields now match REST's null defaults; supplied
  strings stay strictly validated. Errors expose only declared field names/fixed rule codes.
- Web Dockerfile now copies the required runtime declaration. A native staged-image-input test
  reproduces the prior missing-contract error and proves corrected TypeScript inputs compile.
  This is explicitly not a container build. Media suite's obsolete agent-501 assertion was
  corrected; that suite now disables cloud calls explicitly.

### Final execution evidence

Fresh run [20261027T072125917447Z/system.json](qa/evidence/20261027T072125917447Z/system.json)
and [browser.json](qa/evidence/20261027T072125917447Z/browser.json): **passed, exit 0**.
All A–E scenarios, expanded genuine Muse search → exact-segment playback, manual layout
comparison and responsive checks passed. Twelve route/viewport checks, four axe scans with
zero violations, zero browser page errors. At least 60 seconds of recorded synthetic media;
the analyzed 11.067-second licensed replay produced two successfully indexed clips.

Real database stop returned readiness 503; restart returned 200 and retained four cameras,
two layouts, four recordings and six metadata rows. Independent actual media acceptance passed
disconnect/recovery, HEVC rejection, missing file/directory, session expiry, API restart, Range
and MediaMTX outage. See [VMS report](qa/evidence/checks/vms-smoke.json).

| Command | Actual outcome |
| --- | --- |
| `make check` | exit 0: **162 passed / 1 skipped**; Ruff, TypeScript and contract checks passed. The deliberately skipped video live test ran in its separate gate. |
| `make contracts-check` | exit 0; frozen and current runtime artifacts match. |
| `npm run lint --workspace @veyra/web`, `npm run build` | exit 0; zero lint warnings; production build passed. |
| `scripts/foundation_smoke.py` via project Python `-E` | exit 0; fresh migrations/reapply, FK/SQL fixture, readiness, production Next→API. |
| `make meta-smoke` | exit 0; genuine model catalog/text/JSON/read-only tool loop. |
| `make agent-live-smoke` | exit 0; **65 passed / 0 skipped**, including genuine Muse persisted layout. |
| `make index-live-smoke` | exit 0; **30 passed**, genuine six-query evaluation **6/6**, scripted-native and genuine-native media→index→search→MP4 gates passed. |
| `scripts/phase07_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx` via project Python `-E` | exit 0; final genuine full-system browser/database demonstration. |
| `scripts/check_web_image_context.py`, `scripts/phase07_security_scan.py` via project Python `-E` | exit 0; staged TypeScript inputs compile; no known credentials in committable files/static bundles. |
| `npm audit --json --cache .cache/npm` | exit 0; zero reported npm advisories (475 entries). |
| Both requested Docker Compose commands | **blocked, exit 127**, Docker absent. No Linux firewall/container success claimed. |

Completed logs and report snapshots are in [qa/evidence/checks](qa/evidence/checks/).
Regular/scripted tests use real PostgreSQL/media with explicitly mocked provider HTTP;
genuine model gates and the final browser demo use actual Meta. The initial sandbox's shared
memory denial was an environment setup failure; permitted disposable database runs passed.

### Measurements and next work

Final samples: live decoded-frame startup **114/75/76 ms** (n=3); two-second recording export
+ Range retrieval **35/35/34 ms** (n=3); natural-language search **7490/4239/3015 ms** (n=3).
Two clips indexed in **28.324s** and **20.743s**; job wall time **51.526s**. Actual media seek
errors: **228 ms** and **3 ms**; these do not measure model boundary accuracy.

Four of four requested agent tasks completed in the final run. Across six development browser
runs with different code revisions, 19/21 attempted agent tasks completed; earlier failures
are retained. Automated manual layout creation took **330 ms** versus **2240 ms** using Muse,
one sample each, excluding human reading/typing. No speed improvement is claimed.

Final application ledger: 15 logical inference calls, 45,701 input / 11,549 output tokens,
507,835 uploaded bytes, **$0.75 reserved**. Verified token prices were not configured; estimated
and actual billed dollar costs remain unknown. Isolated databases/diagnostics are separate
accounting scopes and cannot establish an account-wide total.

**Next: final UX polish and rehearsal on this native setup.** Keep Docker image/Compose/Linux
egress verification, approved physical-camera testing, a broader independent-scene/ten-query
evaluation, longer isolated performance/soak testing and actual billing as open gates. No
major features, enterprise/public authentication, vector service or visual redesign were added.

---

## Phase 08 handoff — final polish and demo readiness

October 27, 2026. Frontend owner (Claude). Only `apps/web/**` and docs changed; contracts,
backend, migrations, scripts and infrastructure are untouched (`make contracts-check` passes).
No commit, push, deployment or external message.

- UX/visual changes, verification table, measurements and the **Codex defect list** are in
  [qa/PHASE_08_READINESS.md](qa/PHASE_08_READINESS.md). Highlights: ⌘K offers Ask Muse / Search
  video as first-class actions; prompts use real camera names; honest "Nothing was changed",
  neutral decline, post-decision badges, duplicate-name warning, grouped errors and a search
  fallback in Muse; live video on the overview; plain-language activity; bounded moment lists;
  indexing panel recovery and live counts; truthful settings copy.
- Demo: [demo/DEMO_GUIDE.md](demo/DEMO_GUIDE.md) (overview, differentiator, benefits, flow,
  narration) and real screenshots in `docs/demo/screenshots/`. Reproduce with
  `apps/web/tests/demo-walkthrough.mjs` (spends genuine Muse requests, saves one layout).
- Demo workspace: `runtime/demo` (private) with Front entrance, Garden, Trail camera (licensed
  replay, consent on, 30 clips indexed) and `sample_3` left free to connect "Garage" live. Saved
  views "Family room", "Morning check-in", "Garden walk" exist from rehearsal; use a new name live.
  Its ledger reached $4.00 of the $5/UTC-day admission ceiling during rehearsal.
- Processes started this phase and left running for the demo: `runtime/demo` native stack, its
  worker, the licensed replay publisher, and Next on 127.0.0.1:3200 (real stack) and :3300
  (API-less, preview QA). The older `runtime/vms-dev` stack and the :3000/:3100 servers were not
  stopped (not permitted from this session); they run pre-Phase-07 API code / an older build.


---

## VIDEO-01 handoff — curated real-video demonstration

October 27, 2026. Completed and stopped at VIDEO-01; local presentation processes remain running.

- Six default licensed films (gate, street, squirrels, public pedestrian space, bicycle parking,
  existing Henry Geer trail film) plus a real reserved station source. H.264 normalized videos,
  actual video-derived previews, source credits and replay/ingest-time disclosure in the app.
- Idempotent prepare/start/operator analysis scripts; default setup starts no synthetic publisher
  or cloud job. Two old fixture cameras are paused; their IDs, recordings and saved views remain.
- Additive migration 006 and generated runtime contracts for provenance; explicit small-job cap;
  recorder state and failed camera-status polling corrected and regression tested.
- `make check`: 174 passed / 1 skipped, Ruff/typecheck/frozen/runtime contracts pass. Frontend lint,
  production build and formatting pass. Final browser QA: 24 checks, no page errors; actual
  buffering/unknown/offline/recovery tested. Genuine Muse created/verified/opened a four-camera
  view and searched/played new Community evidence; direct walking query returned six intervals.
- Five new 10 s clips genuinely indexed into nine observations with one bounded automatic retry.
  Old 30 successful indexes and 86 observations preserved. Final demo ledger: 92 logical calls,
  $4.60 reserved / $5 UTC-day configured ceiling; actual billing unknown. Do not reindex broadly.
- Preservation comparison against pre-change pg_dump: all 7,636 old segment rows, 86 observations
  and nine old layout cells match row hashes; 20,389 original media/marker files retain size/mtime.
  Database backups and media inventory live privately at `runtime/backups/video01-before`.
- Final database: eight cameras (six real demo + two paused fixtures), five layouts, ten recordings,
  7,724 segments, 95 observations. Six default films play and their recording/Range/seek paths pass.
- Instructions, exact IDs, screenshots, counts, trial failures and remaining portability/accuracy
  limitations are in the three VIDEO-01 documents linked above. Docker/devices/Safari remain open;
  no deployment, push, external message or major UI redesign was performed.


---

## VIDEO-02 handoff — video intelligence and design contract

October 27, 2026. Claude (frontend owner) with a small additive backend change requested by the
phase brief. No push, deployment, external message, reset, re-import or re-indexing.

- **Design:** root `DESIGN.md` (18 sections, measured contrast), referenced from AGENTS.md and
  CLAUDE.md; research with honest inspection limits; Explore UX spec.
- **Frontend:** `/explore` (replaces Search; `/search` → 307 with query), Overview/Activity/
  Recordings rework, frames everywhere evidence appears, anchored time windows (fixes screens that
  would have gone empty after Oct 28), clustered timeline ticks, URL-composed filters,
  `MEDIA_BUSY` retry, plain-noun titles. `next.config.ts` accepts `VEYRA_DIST_DIR` so a dev server
  can run beside the production build (`.next-dev/`, `.next-qa/` ignored).
- **Backend for Codex to review** (`apps/api/veyra/explore.py`, routes in `main.py`, tests in
  `apps/api/tests/test_video02.py`): `POST /index-query`, `GET /index-coverage`,
  `GET /recordings/{id}/frame`. Additive and runtime-only; reuse `retrieval.retrieve`,
  `store` authorization helpers and `safe_file`. Contract notes in API_CONTRACT.md.
- **Checks:** `make check` 178 passed / 1 skipped; lint/typecheck/prettier/build pass;
  verify-ui 24 routes, 31 interactions, 29 axe scans, 0 violations; `video02-flows.mjs` 23/23 on
  production (25/25 with genuine Muse); 0 px overflow at five widths × eight routes.
- **Budget:** 3 genuine model requests (92 → 95, $4.60 → $4.75 reserved of $5 UTC-day).
- **State left running:** the `runtime/demo` stack via `scripts/demo_videos.py` (restarted with the
  new API/build). Dev servers used for QA were stopped. Two saved views added by tests.
- **Codex follow-ups:** serve `/events` newest-first (or a `order` param); cache segment stat in
  retrieval (index queries ~1 s); consider `categories` OR-filters for "vehicles";
  expose daily limits so the UI can show remaining Muse requests.
- **Tests to run:** `node apps/web/tests/video02-flows.mjs http://127.0.0.1:3200 docs/qa/video02`
  (free); add `SAVE=1` to save one view, `PAID=1` for genuine Muse (≈3 requests).


---

## REDESIGN-01 handoff — Home and Explore workspace

October 27, 2026. Claude (frontend owner). Only `apps/web/**`, `DESIGN.md` and `docs/design/**`
changed; no backend, contract, migration, media or data change. Branch `redesign-01`; checkpoint
commit `d8bbf20` holds the pre-redesign tree. No push, deployment or external message.

- **What:** Explore is a single-viewport workspace (results browser · dark stage with transport ·
  timeline with playhead and selected band · inspector); Home is a spaces wall with a live stage, a
  journal of moments and a local-first find field. New tokens (warm paper, one teal), Newsreader for
  Muse's words, mono timecodes, slim shell, rail on Explore. 309 orphaned selectors removed.
- **Muse:** hand-overs pre-fill only; every send says "1 request"; decided proposals show one
  past-tense state; Muse's search reading is reused for free refinements, reload and Back.
- **Evidence:** [direction](design/REDESIGN_01_DIRECTION.md) · [before/after](design/REDESIGN_01_BEFORE_AFTER.md)
  · screenshots `docs/design/redesign-01/screenshots/{before,after,compare}`.
- **Checks (production build, real stack):** `tests/redesign01-flows.mjs` 49/49; ported
  `tests/video02-flows.mjs` 23/23; `tests/verify-ui.mjs` (preview) 24 routes / 31 interactions /
  29 axe scans / 0 violations; lint, typecheck, prettier, build pass. `make check` was not run
  (no backend change).
- **Spend:** 0 model requests; a network guard aborted and counted paid endpoints (0 attempted).
  The genuine Muse approval flow was not re-run; `PAID=1 node tests/video02-flows.mjs` (≈3
  requests) would verify the new receipt rendering against a real response.
- **Promote to :3200:** stop the demo's Next process, `npm run build` in `apps/web`, start it as
  `scripts/demo_videos.py` does. Or keep serving `.next-qa` on :3600.
- **Codex follow-ups:** `IndexQuery` objects/attributes; a reusable parse id; source frame size on
  cameras; a read-only usage endpoint; multi-camera activity (details in the direction doc §6).
- **Next frontend phase:** move Recordings and Saved views onto the workspace grammar; replace the
  remaining hard-coded colours in `screens.css` with tokens.


---

## REDESIGN-02 handoff — product-wide art direction

October 27, 2026. Claude (frontend owner). Only `apps/web/**`, `DESIGN.md` and `docs/**` changed.
REDESIGN-01 was committed as `4cd5c11` on `redesign-01`; this phase is on `redesign-02` (uncommitted
at handoff). No push, deployment, external message, model request or data mutation.

- **Report:** [design/REDESIGN_02_REPORT.md](design/REDESIGN_02_REPORT.md) — per-screen changes, 27
  side-by-side comparisons in `design/redesign-02/screenshots/compare/`, measurements, checks.
- **Demo data:** synthetic test cameras, their recordings and views containing them are hidden on
  default surfaces (data-driven rule in `apps/web/src/lib/demo.ts`, DESIGN §19); "Show test sources"
  per screen or in Settings. Nothing was deleted or renamed.
- **Checks (production, real stack):** `redesign02-flows` 39/39, `redesign01-flows` 49/49,
  `video02-flows` 23/23; `verify-ui` (preview) 24 routes / 31 interactions / 29 axe / 0 violations;
  lint, typecheck, prettier, build pass. `make check` not run (no backend change).
- **Not exercised:** the view editor's real `PUT /layouts/{id}` save; `live-flows` and
  `demo-walkthrough` (they save views / spend Muse) were ported but not run.
- **Codex:** mixed-provenance Trail recording, usage ceiling, `/events` order, multi-camera
  activity, frame size — reproduction steps in the report §6.
