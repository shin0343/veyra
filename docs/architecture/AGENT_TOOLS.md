# Agent capability registry — Phase 05

The executable source is `apps/api/veyra/agent_tools.py`. `GET /api/v1/agent/capabilities`
returns its actual registered handlers. Generated runtime artifacts are
[`agent-tools-phase05.json`](agent-tools-phase05.json),
[`openapi-phase05.json`](openapi-phase05.json), and [`api-phase05.d.ts`](api-phase05.d.ts).
`make agent-contracts` regenerates all three; `make contracts-check` checks both runtime
and frozen artifacts. `veyra/registry.py` and `packages/contracts/agent-tools.json` remain
historical Phase 01 interfaces, not the running execution allowlist.

Each registry entry has a stable `name`, description, Pydantic input schema, fixed callable
backend handler, optional typed navigation destination, effect, permission, confirmation
policy, implementation flag and availability. Handler identifiers are metadata, never a
user-supplied import path. Unknown tool names cannot dispatch code.

| Stable name | Supported input | Permission | Effect | Destination | Confirmation |
| --- | --- | --- | --- | --- | --- |
| `capabilities.list` | `{}` | `vms:read` | read | — | never |
| `features.discover` | `{query}` | `vms:read` | read | feature | never |
| `features.navigate` | `{feature_id}` | `vms:read` | navigation | feature | never |
| `cameras.list` | `{}` | `vms:read` | read | — | never |
| `cameras.status` | camera selector | `vms:read` | read | — | never |
| `cameras.navigate` | camera selector | `vms:read` | navigation | camera_live | never |
| `layouts.list` | `{}` | `vms:read` | read | — | never |
| `layouts.get` | `{layout_id}` | `vms:read` | read | — | never |
| `layouts.create` | `{name,columns,cameras:[selector]}` | `layouts:write` | write | layout | **always** |
| `recordings.list` | camera/time/cursor/limit filters | `vms:read` | read | — | never |
| `recordings.open` | `{recording_id,offset_ms}` | `vms:read` | navigation | recording | never |
| `system.status` | `{}` | `vms:read` | read | — | never |
| `video.search` | validated camera/time/object/apparel/event/motion/keyword constraints | `vms:read` | read | recording | never |

All thirteen handlers are implemented. This availability describes application tools; it
does not assert that Meta credentials, live camera streams or recording bytes are available.
Rules, cloud-indexing tools, identity recognition, arbitrary camera controls and executable
code/SQL/shell/HTTP/browser tools are absent. Identity-recognition requests also encounter a
server policy rejection for explicit matching requests; the model cannot grant that capability.

`video.search` uses the same stored-index retrieval service as REST and performs no recursive
model call or video upload. Muse supplies validated structured constraints; the server resolves
real camera names/locations and clips verified intervals to the requested time range. Clothing
colors are bound to their apparel kind. Hits carry typed recording navigation, evidence IDs,
source/model uncertainty and an exact-segment `playback_request`. Empty indexes report coverage
honestly. REST natural-language parsing is separately bounded by the Phase 05 usage ledger.

A camera selector contains exactly one of `name` or `camera_id`. Name lookup normalizes
Unicode/case/whitespace and an optional trailing “camera”, prefers an exact name, then accepts
only a unique partial match. Ambiguity returns `CAMERA_AMBIGUOUS` and real candidate descriptors;
missing names return `CAMERA_NOT_FOUND`. Layout UUID selectors must occur literally in the user
message, preventing a model from bypassing ambiguous names with a guessed ID. Normal creation
uses names and server resolution. Duplicate cameras, invalid dimensions and extra fields fail
validation. Disabled/deleted cameras cannot enter an agent layout. Offline/unknown status is
reported honestly; a saved arrangement does not imply its cameras are streaming.

Camera settings discovery points to the existing `feature:cameras` destination. Other target
kinds remain `camera_live`, `layout`, and `recording`, with validated backend UUIDs and recording
relative integer milliseconds. There are no model-provided URLs. Recording navigation checks
an authorized registration and a ready segment covering the requested offset. The media-session
service still validates actual bytes and produces a playable session; a link alone proves neither
playback nor footage availability. System status reads actual DB counts and explicitly says media
health was not probed.

## Durable execution and approval

1. Authentication establishes the operator or viewer principal. The model cannot supply roles,
   credentials or permissions. Viewer catalogs omit writes; the dispatcher independently checks
   every call, and approval checks permission again inside the write transaction.
2. Agent message idempotency is reserved in `agent_requests` before any model HTTP request.
   A conflicting body returns 409; an active duplicate returns `AGENT_RUN_IN_PROGRESS`.
   Completed receipts replay for 24h. Abandoned runs fail closed without restarting a model.
   Existing requests are recovered before initializing Meta, so pending/completed/failed receipts
   remain available after key removal or rotation. Storage must be reachable for this lookup;
   if both storage and Meta are unavailable, `DATABASE_UNAVAILABLE` takes precedence.
3. Strict Pydantic argument validation precedes handler execution. Invalid/unknown tool payloads
   are not persisted as arguments. Every proposed/read/failed/pending action gets a durable action
   record and audit entries. Reused call IDs replay the recorded result; changed arguments fail.
4. `layouts.create` resolves names into a real `LayoutCreate` and stores a camera preview. It
   always pauses before mutation. Direct user wording, model prose and “yes” in chat cannot approve.
   This supersedes the earlier Phase 01 `explicit_request` shortcut.
5. A confirmation UUID is an opaque token bound through DB relationships to principal, run,
   action, resolved arguments and preview hash. It expires in two minutes and is single-use.
   Only the protected confirmation endpoint accepts a literal boolean decision. Rejection creates
   no layout; expired/used/foreign tokens fail explicitly. Camera names, enabled state, visibility
   and preview details are locked/rechecked before mutation. Changed previews require a new proposal.
6. The confirmation decision, `store.save_layout` (also used by REST), action receipt,
   `(principal,run_id,tool_call_id)` action idempotency key, and mutation audit commit atomically.
   A failed service call rolls its writes back. Approval retries cannot create another layout.
   Unexpected service exceptions also produce a durable sanitized failure and consume the
   decision once; the failed action transition is audited after its insert rolls back.
7. A **new DB connection after commit** reloads the layout and compares its actual name, columns
   and cells to the approved proposal. Only a matching read produces `verified_results`, completion
   text and a layout navigation receipt. Verification failure preserves the actual committed
   operation, returns failed status and omits the unverified link. A retry can recover a process
   interruption between commit and verification without repeating the write.
   Unexpected verification exceptions preserve the committed receipt too. A late message finish
   cannot reset an approved/verified run to pending or overwrite its verification evidence.

`AgentResponse` preserves the frozen `conversation_id`, `run_id`, `status`, `message` and
`actions` union. Additive fields are `suggested_actions`, `navigation_target`,
`confirmation_request` (typed layout/cameras), `executed_operations`, `verified_results`,
`errors` and `camera_candidates`. All are built from application receipts, never model prose.
The original message's idempotent response remains its original snapshot after the separate
confirmation endpoint completes. A failed action has no invented resource ID or success link.

## Meta adapter and bounds

`veyra/meta.py` is the dedicated server-only first-party transport. Standard-mode Muse Spark
1.3 is the default; the verified 1.2/1.1 IDs are permitted explicit configuration. Contributor
and arbitrary models are rejected. The base URL is fixed to `https://api.meta.ai/v1`;
`MODEL_API_KEY` stays in authorization headers. Redirects and proxy environment routing are
disabled. Provider bodies, rejected arguments and credentials are not logged or echoed.

Chat Completions uses nested function definitions, `tool_choice:auto`,
`parallel_tool_calls:false`, and complete assistant messages followed by matching tool results.
Application schemas use `strict:false` because optional properties do not satisfy Meta's
all-properties-required subset. Server validation remains strict. Final model content uses a
closed, all-required `response_format:json_schema` summary; malformed/truncated/refusal output
fails closed. User-facing execution statements come from server receipts even if model prose
claims success. Text-only output never synthesizes an operation.

Phase 07 keeps unspecified `video.search` start/end/unsupported_reason optional with null
defaults, matching REST semantics. Supplied strings such as `"none"` and empty timestamps
remain invalid. Safe validation feedback contains only declared field names and fixed rule
identifiers. Meta's tool `strict` flag validates the schema definition, not generated arguments;
server-side validation remains the execution boundary. Runtime recording actions now preserve
optional `segment_id` through receipts and frontend links to exact evidence.

Default application Muse turns reserve and record `agent_turn` usage in the same durable
budget as video analysis/search. Apply migration `005_agent_usage`; estimates are not invoices.

Runs have at most eight model turns, twelve tool calls and a 60-second execution budget.
Each HTTP request has bounded connect/read timeouts, at most two attempts and a 2 MiB response
limit. Only transient transport errors and 408/429/500/502/503/504 retry, with bounded backoff and
jitter; Retry-After is honored or the run fails when it cannot fit the deadline. Authentication,
permission and validation errors do not retry. PostgreSQL has connect/statement timeouts. Model
failures preserve actual preceding receipts. No DB transaction is held during model inference.

User text, history, camera names, metadata and tool results stay in their user/tool roles and
cannot add tools or approve actions. Server enforcement, fixed handlers and explicit approval
remain the action boundary even if a model follows an injected instruction. This phase sends
safe inventory descriptors, not camera source secrets, footage or private storage paths.

## Verification boundary

See [`PHASE_04_AGENT.md`](PHASE_04_AGENT.md) and
[`../evidence/agent-phase04.json`](../evidence/agent-phase04.json). The local acceptance suite
uses actual PostgreSQL/REST/transactions and explicitly scripted Meta HTTP responses. It does
**not** prove Muse selected the right tools. The separate `live_meta` test calls genuine Meta
when the server key exists and must reach a persisted, verified layout. Without a key it is
recorded as skipped; the full live acceptance gate remains open.
`make agent-live-smoke` enforces that gate and exits nonzero when the genuine test does not pass.
The evidence report's `full_acceptance_gate` distinguishes that result from backend suite success.
