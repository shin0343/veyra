# Phase 04 — Muse application control plane

The backend implements real typed tools, durable runs, approval, actual layout persistence,
audit and read-after-commit verification. `apps/web` is preserved. No indexing, video search,
rule execution or later phase work was implemented. Live Muse acceptance is still gated by
server credentials; backend integration with a scripted provider is distinct evidence.

## Run

Configure the existing private server `.env` with the local operator token, database URL,
`MODEL_API_KEY`, and `META_MODEL=muse-spark-1.3`. Never paste credentials into agent messages,
client bundles or reports. Apply migration 003 with `make migrate` before starting the updated
API; readiness requires that migration. Use the existing VMS development stack from
[`PHASE_03_VMS.md`](PHASE_03_VMS.md), with already registered, enabled cameras.

- `make meta-smoke`: genuine first-party model catalog, text, structured output and read-only
  tool-loop probe. Absent key is explicitly skipped; invalid credentials/API failures fail.
- `make agent-smoke`: isolated temporary PostgreSQL, actual backend tools, scripted provider
  scenarios, and a separate genuine-Muse layout test when credentials exist. Reports go to
  `docs/evidence/agent-phase04.json`; each run has a fresh ignored `runtime/agent-phase04` directory.
  Owned PostgreSQL processes stop and their temporary database directories are removed.
- `make agent-live-smoke`: the same tests with `--require-live`; exits nonzero unless genuine
  Muse creates and independently verifies the layout. Missing credentials cannot pass this gate.
  `full_acceptance_gate` in the report is separate from backend-only test success.
- `make check`: lint/format, all backend tests, existing frontend TypeScript and contract checks.
- `make contracts-check`: frozen artifacts plus additive Phase 04 OpenAPI/TS/tool catalog drift.
- `make agent-contracts`: regenerate the three Phase 04 artifacts from their Python sources.
  `scripts/export_runtime_openapi.py` now delegates to the current exporter; Phase 03 snapshots
  remain historical and are not overwritten.

The PostgreSQL tests need local `initdb`/`pg_ctl`. They skip explicitly if binaries are absent;
a sandbox that denies shared memory/loopback must allow disposable local-service execution.
They never connect to or truncate an operator's configured database. Native checksum migration
apply/reapply and actual API/Next connectivity are separately exercised by
`scripts/foundation_smoke.py`.

## API sequence

Use the existing protected `/api/v1/agent/messages` endpoint and a stable Idempotency-Key:

```json
{"message":"Create a 2×2 view of my entrance, garage, garden, and lobby cameras."}
```

Muse can list cameras and propose `layouts.create` with four name selectors. The server
resolves actual rows and returns `status:awaiting_confirmation`, the existing confirmation
receipt, and a typed `confirmation_request` with the exact `LayoutCreate` and camera preview.
No layout exists yet. Ambiguity/missing/disabled cameras produce explicit failures with no
substitution or pending mutation. The user can clarify names or explicitly supply a camera UUID.

Submit the real confirmation ID through `/agent/confirmations/{id}`, with its own stable
Idempotency-Key and `{"approved":true}`. On successful commit and independent DB verification,
the response contains the saved UUID, actual full layout, `verified_results`, and a typed
`{kind:"layout",layout_id}` target. Repeating that decision with the same key returns the exact
receipt; a different body conflicts and a different key cannot reuse the token.

Feature questions use `features.discover`; settings resolve to `feature:cameras`. Contextual
navigation uses `cameras.navigate` and actual record IDs. Identity recognition is unsupported.
The server never promotes a model's claim, a camera name or retrieved text into action authority.

## Observed checks and limits

The evidence report records the actual test cases and live-test skip reason. The creation
scenario contains the real proposed camera UUIDs, saved layout, GET response, navigation target
and verification receipt from that run, clearly labeled **scripted Meta HTTP**. The backend
suite also checks same/different request keys, concurrent approval, single-use/expiry/decline,
principal binding and permission rechecks, preview tampering and camera changes, malformed
responses/arguments, unknown tools, injected names, bounded loops, rollback after an actual
insert and recovery after a commit interrupted before verification.

Reliability re-verification added seven cases. Before correction, three cached-message replays
returned 503 after key removal, a late message finish replaced verified state with pending state,
an unexpected post-insert exception returned only 500, and an unexpected verification exception
hid the committed receipt behind 500. These six failures were reproduced on isolated PostgreSQL.
The corrected paths recover receipts before Meta initialization, preserve the message snapshot
and newer decision state independently, roll back unexpected write failures into audited terminal
receipts, and report unexpected verification failure without claiming a rollback. A separate
new-request test confirms absent credentials still return `MODEL_UNAVAILABLE` without starting a run.
If storage is also unavailable, its `DATABASE_UNAVAILABLE` error takes precedence over model setup.

A passing scripted-provider test cannot establish real Muse tool selection, account entitlement,
latency, refusal behavior or model quality. Without `MODEL_API_KEY`, the full sequence
“natural language → real Muse tool call → committed layout → verified result” is **not verified**.
A credentialed failure is not converted into mock output or skipped as success.

The existing frontend already understands the frozen confirmation/action/navigation shapes,
and its adapter passes through JSON responses. Rendering the richer camera preview, candidate
choices, execution/verification fields and runtime types belongs to its owner. Its current
upstream request timeout is **15 seconds**, while an agent run has a **60-second** budget. A
long real Muse request may time out in that UI; retry the same request key to recover the
existing run/receipt. Coordinate a longer frontend timeout before claiming full UI acceptance.
No live browser-to-Muse flow was claimed or tested in this backend phase.

The API remains a local single-workspace operator/viewer deployment, not tenant-isolated public
software. Inventory can include offline/unknown cameras without pretending their stream is live.
Recording navigation validates DB coverage; actual playback still requires the media-session
boundary. Prior Docker/physical-camera and later indexing/search gates remain unchanged.

## Official Meta verification

Documentation was checked October 26 Pacific / October 27 UTC, 2026. It lists Standard-mode
Muse Spark 1.3 for new agent work. Actual account availability must be checked with `GET /models`;
no account access was established without a key. Sources:

- [Models](https://dev.meta.ai/docs/models): model IDs, availability and Standard/Contributor modes.
- [Tool calling](https://dev.meta.ai/docs/tool-calling): nested Chat Completions function format,
  auto-only choice, single-dot name restriction and full-message/tool-call matching.
- [Structured output](https://dev.meta.ai/docs/structured-output): closed objects, all properties
  required, and the supported strict-schema subset.
- [Chat Completions schemas](https://dev.meta.ai/docs/api-reference/chat-completions/schemas):
  request/response/tool-call fields, `store:false`, JSON schema output and finish reasons.
- [Error handling](https://dev.meta.ai/docs/error-handling): authentication/validation failures,
  transient status codes, Retry-After and retry strategy.

Chat Completions is retained for compatibility with the agreed application contract. Complete
assistant messages are replayed as required; this does not promise reasoning continuity, which
Meta recommends the Responses API for. No migration to a different API is claimed here.
