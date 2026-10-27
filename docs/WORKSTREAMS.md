# Work order and ownership

**Current status:** Phase 02 frontend and Phase 03 VMS are implemented. Backend code is now
`apps/api/`; media helpers are `services/media/`. See the Phase 03 HANDOFF section and
[runtime contract additions](architecture/API_CONTRACT.md#phase-03-additions). The dated
work order below is historical; remaining AI/indexing and Docker gates still apply.

The v0.1.0 OpenAPI/type contract is frozen for the next two workstreams. Read HANDOFF before
starting. Neither agent edits another's implementation directory. Shared contract changes
must be proposed in API_CONTRACT, reviewed with the other owner and regenerated together.
No agent needs to guess route names, milliseconds/seconds, status enums, navigation payloads
or action receipt structure.

## Phase 01 acceptance and completion boundaries

| Gate | Measurable criterion | Evidence |
| --- | --- | --- |
| Architecture | product, system, data, API, agent tools and ownership docs exist | Required docs in this repository |
| Contract freeze | OpenAPI and generated TS match Pydantic, every route declares success/error shape | `make contracts-check` |
| Runnable foundation | Next build; real local API; migrated PostgreSQL; server-to-server health read | `scripts/foundation_smoke.py` |
| Media feasibility | actual RTSP pull, HLS browser frames, finalized recording, MP4 browser playback and seek | `scripts/media_smoke.py`, actual results in FEASIBILITY |
| Meta truthfulness | official capability links, exact model/auth format and real probe or explicit missing-key skip | `make meta-smoke`, FEASIBILITY |
| Handoff | implemented vs contract-only status, next tasks and actual blockers recorded | HANDOFF |
| Compose | local configuration/build/run instructions; runtime check if Docker available | Docker unavailable here; runtime verification remains an explicit handoff gate |

Do not infer that Phase 01 implements any complete product slice. It establishes their
interfaces and validates underlying feasibility. Docker/runtime and credentialed Meta
checks must remain labeled unverified until actually run.

## Next workstream A — Codex: working control/media services

Own `services/`, `infra/`, `scripts/`, shared contract generation and AI transport.
Implement in this order:

1. Camera source provisioning validation, camera CRUD and layout services using PostgreSQL.
   Enforce idempotency, permission and optimistic version semantics before agent writes.
2. MediaMTX adapter, source readiness, finalized-segment reconciliation, recording sessions
   and bounded authorized media proxy. Verify real H264 camera compatibility, reconnects,
   missing intervals and expiry. Validate Compose startup on a machine with Docker.
3. Real Meta smoke with operator-provided MODEL_API_KEY. No credential means report the
   blocker; do not invent successful Muse output or substitute a differently named model.
4. Typed dispatcher for the six tools; layout creation through the shared layout service,
   confirmation records and truthful action receipts. No generic HTTP/code execution.
5. Consent-gated leased worker, clip upload/cleanup, validated observation index, query
   expansion and PostgreSQL retrieval. SAM stays off until the three slices are complete.

Acceptance A1: real camera list and source registration; persisted layout survives restart;
same idempotency key produces exactly one saved row; unauthorized source fails closed.
Acceptance A2: advancing browser live video plus ≥60s recording, reconnect preserves files;
random timestamp replay is within one second on annotated owned fixture; no raw ports/URLs exposed.
Acceptance A3: actual Muse executes a request through typed tools, layout row exists, read-only
prompt has no mutation, failed steps cannot be presented as completed.
Acceptance A4: five annotated scenes/ten queries yield grounded hits or honest misses; every
hit opens actual available video with measured timestamp error and visible indexing coverage.

## Next workstream B — Claude: accessible VMS experience

Own `apps/web/`, product interaction and design system. The existing page is intentionally a
minimal placeholder and may be replaced by Claude. Coordinate shared type changes with Codex.

1. Design calm, readable camera/library/live/layout navigation, reusable empty/loading/error/
   offline/permission states and keyboard/focus behavior. Build fixed route mappings from
   API_CONTRACT. No fake camera feed or fabricated activity placeholder.
2. Add the server-only API adapter and same-origin restrictions defined in SYSTEM. Keep
   credentials server-side. Initially show explicit 501 responses while A implements services;
   isolated fixtures are allowed only in component development, labeled as fixtures.
3. Camera registration from approved source list; live player with hls.js/native HLS; layout
   creation/replacement; recordings and playback seeking using returned actual/seek offsets.
4. Muse panel with feature links, pending confirmation UI, durable action receipts and actual
   saved-layout navigation. Failed or unimplemented tools stay visibly unavailable.
5. Search results with camera/time/evidence/model provenance/coverage; open exact recording
   offset. Add activity histogram only after the primary playback/search flow works.

Acceptance B1: all required routes work with keyboard, visible focus and mobile-width layout;
no secret is present in client bundles; honest 501/offline/empty states are distinguishable.
Acceptance B2: integrated slices 1–3 follow the shared result types, time units and route table;
confirmation reject/expire/failure states are understandable, with no duplicate submit actions.

## Joint milestones (Los Angeles dates, proposed execution plan)

| Date | Outcome / gate |
| --- | --- |
| Oct 26 | Phase 01 handoff, contract freeze, dependency/media evidence |
| Oct 27–28 | A1/A2 + B1: camera/live/recording/playback, Docker verification |
| Oct 29 | A3 + integrated layout navigation; actual Meta key gate resolved |
| Oct 30–31 | A4 + grounded search/player integration |
| Nov 1–2 | Owned-footage evaluation, privacy/error/retry checks, accessibility, reconnect robustness |
| Nov 3 | Feature freeze; record a truthful demo and rehearse clean setup |
| Nov 4 | Final checks and submission before 18:00 PT / 21:00 ET |

Cut optional SAM, rules, alerting and advanced histograms if a primary gate slips. Keep one
machine, one API, one database, one media router and one worker. Do not spend the deadline
budget on enterprise infrastructure or polish that hides missing product behavior.
