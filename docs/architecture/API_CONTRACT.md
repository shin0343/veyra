# Frozen API contract — v0.1.0

**Final integration runtime additions (October 27, 2026):** frozen package contracts remain
unchanged. `AgentResponse.interaction_state` identifies answered, clarification_required,
awaiting_confirmation, completed_verified, committed_unverified, rejected, cancelled or failed.
The value comes from stored action receipts and independent database verification. Optional
`clarification` and actual `camera_candidates` distinguish a camera-list read from completing a
layout request. Layout tools require user-supplied camera references; the provider cannot choose
arbitrary cameras. Original idempotent message snapshots and confirmation receipts remain separate.

`POST /index-query` optionally accepts `interpretation: StructuredSearch`. It preserves object,
attribute, apparel, event and keyword constraints without invoking Muse. Explicit camera and time
filters intersect that interpretation; a contradictory camera scope returns CAMERA_FILTER_CONFLICT.
The browser stores search words and interpretations in tab-local sessionStorage; new URLs carry an
opaque `search` reference. Legacy q/run URLs only prefill or reuse a cached interpretation and cannot
authorize a new paid request. Agent questions may use several metered provider turns; the UI says
paid AI rather than promising one provider request per question.

The final runtime also adds:

- `curated_only=false` on search, index-query, index-coverage and events. When true, only recording
  snapshots with `source_media.kind=prerecorded` are included. Historical unknown/mixed recordings
  and their observations remain accessible explicitly; no old recording inherits a new source's
  attribution. The curated demo enables this scope and the browser explains the smaller coverage.
- `/events` is recent-first with stable `(started_at DESC,id DESC)` keyset pagination. Version 2
  cursors bind the camera, kind, time window, provenance scope and pipeline. Old or mismatched
  cursors return `INVALID_CURSOR`. Optional `kind=motion|observation` filters on the server.
- `POST /activity-query {camera_ids: UUID[1..16], start, end, bucket_seconds:10..3600}` returns
  `{items: ActivityHistogram[]}` using the existing per-camera service in one request. At most
  2,880 total buckets. Authorization and the per-camera endpoint are unchanged.
- `Camera.video_width/video_height` are nullable encoded dimensions measured with FFprobe from
  the checksum-validated configured demo file. Unknown streams remain null.
- Operator-only `analysis-usage` includes configured daily request/USD admission ceilings,
  `admission_used_usd=sum(max(reserved,estimated))`, remaining admission capacity, logical requests
  still admissible under both limits, observed/latest-usage timestamps and admission-enabled state.
  UTC-day boundaries match the admission ledger. Billing and billing_updated_at remain unknown/null.
  These values apply to this database, not the provider account or an actual charge ceiling.

No migration or existing demo-row rewrite is required. Regenerate the runtime artifacts with
`make agent-contracts`; frozen package contracts remain reproducible.

**VIDEO-02 runtime additions (additive; frozen v0.1.0 artifacts unchanged).** Three read-only
routes in `apps/api/veyra/explore.py`, generated into the runtime artifacts with
`make agent-contracts` (`openapi-phase05.json`, `api-phase05.d.ts`):

- `POST /index-query` (`queryIndex`) — `IndexQuery {camera_ids≤16, start?, end?, categories≤4,
  event_types≤4, keywords≤6 (word tokens 2–40 chars), motion_only=false, limit 1–50 (24)}` →
  the existing `SearchResponse`. **No model call**: it builds a `StructuredSearch` and calls the
  same `retrieval.retrieve` used by REST search and the Muse `video.search` tool (same 24 h
  window rule, coverage, provenance and segment-exact navigation). Extra fields → 422.
- `GET /index-coverage` (`getIndexCoverage`) → per camera: recordings, first/last recorded,
  available ms, segments, successfully indexed segments, analyzed ms, observations, last
  observation, `event_types` and `categories` counts. No model call.
- `GET /recordings/{recording_id}/frame?offset_ms&segment_id` (`getRecordingFrame`) → `image/jpeg`
  (480 px wide) decoded with FFmpeg from the finalized segment covering the offset (exact
  `segment_id` when given; 409 `MEDIA_GAP` otherwise). Position quantised to 250 ms; cached under
  `playback_cache_root/frames` (64 MB LRU, ≤2 concurrent decodes, 15 s timeout). A preview, not a
  frame-exact detection. The web adapter allows these routes (frames may be cached privately 10 min).

Frontend route note: navigation `feature_id: "search"` now renders **Explore** at `/explore`;
`/search` redirects (307) there with its query string preserved.

**Phase 07 runtime correction:** recording navigation returned by search (including Muse
`video.search` and activity) adds optional `segment_id` through the runtime-only
`RuntimeRecordingTarget` / `RuntimeNavigationAction` schemas. Links preserve it as
`/recordings/{recording_id}?offset_ms={offset_ms}&segment_id={segment_id}`. The server
continues to validate recording/segment ownership when creating playback sessions.
Agent receipts, suggested actions and navigation_target all retain the same segment.
Existing offset-only links remain valid. Frozen v0.1.0 Pydantic/contracts/package files
are unchanged; regenerate the current runtime artifacts with `make agent-contracts`.

The runtime `video.search` tool permits omitted start/end/unsupported_reason, defaulting them
to null as in REST. Provided values remain strictly typed. Validation errors expose only declared
field names, with no argument values. The daily usage summary now includes application Muse
turns; migration `005_agent_usage` is required by readiness. No frozen package schema changed.

**Current implementation:** Phase 05 adds consented indexing, grounded search, events and
activity data. See [Phase 05](PHASE_05_INDEXING.md) and
[current runtime OpenAPI](openapi-phase05.json). Genuine Muse video acceptance is unverified
without server credentials and budgets. Frozen artifacts remain unchanged.

**Phase 04 implementation:** Phase 04 adds real agent messages, confirmation and tool execution
to the Phase 03 camera/media/recording/layout services. The inventory's Phase 01 column is
historical. See [Phase 04 coordination](#phase-04-coordination),
[agent operation](PHASE_04_AGENT.md) and [runtime OpenAPI](openapi-phase04.json).
Frozen shared artifacts remain unchanged. Genuine Muse acceptance requires server credentials.

**Freeze:** October 26, 2026, before frontend/backend implementation workstreams.
Source: `apps/api/veyra/contracts.py` and typed FastAPI routes.
Machine-readable artifact: [`packages/contracts/openapi.json`](../../packages/contracts/openapi.json).
Generated TypeScript: [`packages/contracts/src/api.d.ts`](../../packages/contracts/src/api.d.ts).
Generate with `make contracts`; verify drift with `make contracts-check`. `/openapi.json`
and `/docs` expose the running API schema and Swagger UI.

## Wire conventions

- Base path `/api/v1`; JSON uses snake_case and UUID strings. Extra request fields are rejected.
- Time is timezone-aware RFC3339; emitted timestamps are UTC. Time ranges are half-open.
  Media offsets and durations are nonnegative integer **milliseconds**, never seconds or epoch values.
- Protected operations require `Authorization: Bearer <VEYRA_DEV_TOKEN>`. The development
  principal is fixed server-side to `local-operator`. Do not store this token in browser code.
- Mutating persistent resources, agent messages and confirmation decisions require an
  `Idempotency-Key` of 8–128 characters. Scope is principal + method + canonical path + key.
  Same body returns original status/body for 24h; same key with different body returns
  `409 IDEMPOTENCY_CONFLICT`. Schema/audit tables exist; enforcement starts with CRUD implementation.
  Live/playback session creation is ephemeral and intentionally has no idempotency header.
- Every response includes server-generated `X-Request-ID` and `Cache-Control: no-store`.
- Collections are bounded: cameras ≤16 and layouts ≤100 by service policy. Recordings/events
  use opaque keyset cursors `(started_at,id)`, default 50, maximum 100, `next_cursor:null` at end.
  Unknown/deleted/unauthorized resources return 404 without leaking existence.
- Camera source IDs are provisioned out of band; no endpoint accepts a raw RTSP URL or secret.
- All routes marked **contract** currently return a typed `501 NOT_IMPLEMENTED`, after
  authentication and shape validation. Their success schemas are an interface agreement,
  not claims of implemented behavior. Do not return fake empty collections while waiting.

## Endpoint inventory

| Method and path | Request | Success | Phase 01 |
| --- | --- | --- | --- |
| GET `/health/live` | none | `Health` 200 | implemented, unauthenticated |
| GET `/health/ready` | none | `Health` 200 / dependency 503 | implemented, DB + migration only |
| GET `/features?query=grid` | optional query ≤200 chars | `FeatureList` 200 | implemented, static catalog |
| GET `/agent/capabilities` | none | `CapabilityList` 200 | implemented, execution support flags |
| GET `/camera-sources` | none | `CameraSourceList` 200 | contract |
| GET `/cameras` | none | `CameraList` 200 | contract |
| POST `/cameras` | `CameraCreate`, idempotency | `Camera` 201 | contract |
| GET `/cameras/{camera_id}` | UUID | `Camera` 200 | contract |
| PATCH `/cameras/{camera_id}` | `CameraUpdate`, idempotency | `Camera` 200 | contract |
| POST `/cameras/{camera_id}/live-session` | UUID, no body | `MediaSession` 200 | contract |
| GET `/layouts` | none | `LayoutList` 200 | contract |
| POST `/layouts` | `LayoutCreate`, idempotency | `Layout` 201 | contract |
| GET `/layouts/{layout_id}` | UUID | `Layout` 200 | contract |
| PUT `/layouts/{layout_id}` | `LayoutReplace`, idempotency | `Layout` 200 | contract |
| GET `/recordings` | camera_id, start, end, cursor, limit | `RecordingList` 200 | contract |
| GET `/recordings/{recording_id}` | UUID | `Recording` 200 | contract |
| GET `/recordings/{recording_id}/segments` | UUID | `SegmentList` 200 | contract |
| POST `/playback-sessions` | `PlaybackRequest` | `MediaSession` 200 | contract |
| GET `/media/sessions/{session_id}/{resource}` | UUID, safe leaf name, optional Range | HLS/MP4 bytes 200/206 | contract |
| GET `/events` | camera_id, start, end, cursor, limit | `EventList` 200 | contract, secondary |
| GET `/cameras/{camera_id}/activity` | start, end, bucket_seconds (10–3600, default 60) | `ActivityHistogram` 200 | contract, secondary |
| POST `/search` | `SearchRequest` | `SearchResponse` 200 | contract |
| POST `/analysis-jobs` | `AnalysisJobCreate`, idempotency | `AnalysisJob` 202 | contract |
| GET `/analysis-jobs/{job_id}` | UUID | `AnalysisJob` 200 | contract |
| GET `/rules` | none | `RuleList` 200 | reserved, secondary |
| POST `/agent/messages` | `AgentMessage`, idempotency | `AgentResponse` 200 | contract |
| POST `/agent/confirmations/{confirmation_id}` | `ConfirmationDecision`, idempotency | `AgentResponse` 200 | contract |

The `/health` paths are absolute, outside `/api/v1`. No public DELETE, arbitrary rule scripting,
generic tool execution, raw metadata editing or recording file upload endpoint is in this contract.

## Core schemas and behavior

OpenAPI contains every required/nullable field and enum. These notes resolve service semantics:

- `CameraCreate`: `{name, source_id, cloud_analysis_allowed:false}`. Unknown source →422
  `SOURCE_NOT_APPROVED`, already registered source →409 `SOURCE_IN_USE`. `CameraUpdate`
  omitted fields stay unchanged; explicit null is rejected by service policy and at least one
  non-null change is required. Revoke consent before accepting further uploads.
  `Camera.status` is `unknown|online|offline|error|disabled` and never inferred from row existence.
- `LayoutCreate`: `{name, columns:1|2|3, cells:[{position:0..8,camera_id}]}`. One to nine cells,
  unique positions and cameras. Cell positions are row-major; gaps are empty cells. Rows =
  `floor(max(position)/columns)+1`. `LayoutReplace` additionally requires `expected_version`;
  mismatch →409 `VERSION_CONFLICT`. Replace atomically and increment version.
- `Recording`: actual UTC origin, optional end, verified available duration and status.
  Available duration is the sum of ready segment durations; gaps do not count.
  `Segment.offset_ms` is measured from recording origin; private storage keys never leave server.
- `PlaybackRequest`: `{recording_id,offset_ms,duration_ms:30000}`; duration 1000–300000.
  Reject offsets in a missing interval with 409. Requested duration may stop at the available
  window; response start/seek mapping tells the player where evidence lies.
- `MediaSession`: `{id,transport:hls|mp4,url,expires_at,actual_start_offset_ms,seek_offset_ms}`.
  URL is same-origin and under `/api/v1/media/sessions/`, not a provider URL. For playback,
  `actual_start_offset_ms + seek_offset_ms = requested offset_ms`. Expiration is five minutes.
  Renew via session creation; never put bearer tokens in URL query strings. Leaf resource
  names allow alphanumeric/underscore/hyphen and m3u8/mp4/m4s/ts suffixes only. Resolve leaf
  names from session-owned mappings; a matching regex alone is not authorization.
  Playback MP4 is materialized in a bounded expiring server cache and served with real Range
  support; direct MediaMTX MP4 streaming is not assumed seekable. Session creation completes
  only after the bounded clip is ready. Failure returns a dependency error, not a dead URL.
- `SearchRequest`: `{query,camera_ids:[],start:null,end:null,limit:10}`; 1–2000 chars,
  max 16 IDs, limit ≤50. Empty camera list means every camera authorized to this principal.
  Both bounds, when supplied, must be aware and start < end. Listing windows are max 24h;
  query/schema validators enforce shape now, service limits apply when implemented.
- `SearchHit`: real camera/recording/segment IDs, start/end, recording-relative offset,
  indexed summary/evidence, model/indexed_at provenance, ranking relevance and typed action.
  `coverage:none|partial|complete` describes successful indexed, available segments in the
  requested authorized window, not confidence. `none` yields no hits; never label an
  unindexed camera fully searched. `relevance` is rank normalization, never model certainty.
- `AnalysisJobCreate`: `{recording_id,allow_cloud_upload:true}`. Camera consent must already
  be true; otherwise 403 `CONSENT_REQUIRED`. Job state is queued/running/succeeded/failed/
  cancelled. Poll once per second until terminal; expose actual progress and stable errors.
  There is no cancel endpoint in v0.1.0; consent revocation cancels unstarted work internally.
- `ActivityBucket`: start/end, `event_count` and `coverage_ms`. A bucket with zero coverage
  means no available data, not proven inactivity. Empty histogram/rules are secondary work.

## Navigation contract (Claude owns rendering)

`NavigationAction` always has `{kind:"navigate",label,target}`. Models do not return raw
hrefs. Claude maps these discriminated targets exactly:

| Target | Frontend route |
| --- | --- |
| `{kind:"feature",feature_id}` | `/live`, `/cameras`, `/layouts`, `/recordings`, `/search`, `/events` |
| `{kind:"layout",layout_id}` | `/layouts/{layout_id}` |
| `{kind:"camera_live",camera_id}` | `/live?camera_id={camera_id}` |
| `{kind:"recording",recording_id,offset_ms}` | `/recordings/{recording_id}?offset_ms={offset_ms}` |

These destination pages are **not implemented** in the Phase 01 placeholder. Feature catalog
entries expose `implemented:false`; show disabled/unavailable behavior until real UI exists.
Action receipts and a human-readable link remain visible; navigation must not silently hide
a failed preceding mutation. Unknown target kinds fail closed, without opening a browser URL.

## Examples — illustrative contract fixtures, not observed model or camera data

Create a layout (requires existing authorized cameras):

```http
POST /api/v1/layouts
Authorization: Bearer <server-side token>
Idempotency-Key: layout-demo-0001
Content-Type: application/json

{"name":"Front and garden","columns":2,"cells":[
  {"position":0,"camera_id":"00000000-0000-4000-8000-000000000001"},
  {"position":1,"camera_id":"00000000-0000-4000-8000-000000000002"}
]}
```

Successful future `AgentResponse` action after the layout transaction commits:

```json
{
  "status":"succeeded",
  "tool_call_id":"example-call-1",
  "tool_name":"layouts.create",
  "message":"Layout saved.",
  "resource_id":"00000000-0000-4000-8000-000000000010",
  "navigation":{
    "kind":"navigate","label":"Open Front and garden",
    "target":{"kind":"layout","layout_id":"00000000-0000-4000-8000-000000000010"}
  }
}
```

Timestamped future playback request: `{"recording_id":"00000000-0000-4000-8000-000000000020",
"offset_ms":12000,"duration_ms":15000}`. A stream beginning at offset 10000 reports
`actual_start_offset_ms:10000, seek_offset_ms:2000`; the player seeks two seconds into it.
Neither of these example offsets claims an actual camera observation.

## Error contract

```json
{
  "request_id":"00000000-0000-4000-8000-000000000099",
  "error":{
    "code":"NOT_IMPLEMENTED",
    "message":"This operation is contract-only in Phase 01.",
    "retryable":false,
    "fields":[]
  }
}
```

401 `UNAUTHORIZED`; 403 `FORBIDDEN|CONSENT_REQUIRED`; 404 `NOT_FOUND|RECORDING_UNAVAILABLE`;
409 `VERSION_CONFLICT|IDEMPOTENCY_CONFLICT|SOURCE_IN_USE|MEDIA_GAP|CONFIRMATION_EXPIRED`;
422 `VALIDATION_ERROR|SOURCE_NOT_APPROVED|INVALID_TIME_RANGE`; 501 `NOT_IMPLEMENTED`;
503 `AUTH_NOT_CONFIGURED|DEPENDENCY_UNAVAILABLE|MODEL_UNAVAILABLE|STREAM_UNAVAILABLE`.
Unexpected failures return 500 `INTERNAL_ERROR` without internal exception details.
Media may also return 416 `INVALID_RANGE`. Future provider rate limiting is normalized to
503 `MODEL_UNAVAILABLE` with bounded retry; it never exposes provider body contents.

Validation errors list field paths and never echo rejected secret inputs. When a future
agent run performs some steps successfully and then fails, return its actual action list
with `status:"failed"`; do not convert partially completed work into a success message.

The frontend adapter must preserve errors and request IDs. Success payloads contain no
internal file paths, camera URLs, provider keys or raw provider file IDs.

## Phase 03 additions

[Proposal recorded before implementation](PHASE_03_CONTRACT_PROPOSAL.md).
Existing required fields, operation IDs, route mappings and millisecond units are preserved.
The backend package moved to `apps/api/veyra`; `contract_app.py` retains the frozen generator.
The separate runtime specification is generated with `scripts/export_runtime_openapi.py`.

- Camera create/update optionally accept `group_name`, `location` (1–100 characters, trimmed).
  They are nullable; PATCH null clears those fields. Other explicit null updates remain invalid.
  Responses add nullable grouping/location and `connection_error: ErrorDetail`.
- DELETE `/cameras/{camera_id}` requires operator access and Idempotency-Key. Success is 204;
  it soft-deletes registration, preserves recordings and revokes live sessions. Saved-layout
  references return 409 `CAMERA_IN_USE` until a versioned layout replacement removes them.
- Optional viewer token grants workspace reads and principal-bound live/playback sessions,
  with 403 on camera/layout writes. Registration/CRUD, layouts, recording/segment reads,
  media session creation and authenticated media resources are now implemented.
- Session errors additionally include `CAMERA_DISABLED`, `SOURCE_OFFLINE`, `UNSUPPORTED_CODEC`,
  `MEDIA_UNAVAILABLE`, `DATABASE_UNAVAILABLE`, `MEDIA_CAPACITY`, `MEDIA_BUSY`, `INVALID_MEDIA`,
  `SESSION_CAPACITY` and `EGRESS_GUARD_REQUIRED`. Gaps retain the agreed 409 `MEDIA_GAP` code.
  Failures use the existing ErrorResponse shape and never expose source credentials.
- Events, activity, search, analysis jobs, rules and agent mutation endpoints remain 501.
  Static feature/capability metadata is retained; tool execution flags are not claims of REST
  implementation. Updating agent adapters/feature availability belongs to the next AI phase.
- The existing frontend adapter rejects the new input fields and DELETE. Its source/types were
  not changed. The frontend owner must coordinate those additions before exposing their UI.

See [Phase 03 operation](PHASE_03_VMS.md) for actual codec, cache, retention, source policy,
health and local-execution behavior.

## Phase 04 coordination

The agent implementation uses the existing message and confirmation paths, operation IDs,
request shapes and discriminated action receipts. Every agent layout mutation now requires
an explicit browser confirmation, including a directly requested layout. This stricter policy
supersedes the Phase 01 explicit-intent shortcut. Confirmation IDs are opaque, expiring,
principal/run/action/argument-bound single-use tokens; the model has no confirmation tool.

Runtime responses add optional-to-existing-consumers fields: `suggested_actions`,
`navigation_target`, `confirmation_request` (resolved layout and camera preview),
`executed_operations`, `verified_results`, `errors`, and `camera_candidates` for name ambiguity.
All are constructed by the server.
Runtime capabilities add a handler identifier, navigation destination and availability.
The runtime catalog excludes unimplemented video search and rule tools. Camera settings
use the existing `feature:cameras` destination, never a fabricated camera-settings route.

Frozen Phase 01 artifacts remain historical and unchanged. Runtime schemas and the actual
tool catalog are separately generated into `openapi-phase04.json`,
`agent-tools-phase04.json` and `api-phase04.d.ts` in this directory by
`scripts/export_agent_contracts.py`; frontend integration remains its owner's workstream.
Agent messages reserve durable idempotency before contacting Meta; concurrent duplicates
return `409 AGENT_RUN_IN_PROGRESS`. Completed requests replay their original response for
24h. Abandoned runs fail closed and do not silently rerun model or mutation operations.
Existing message receipts are looked up before Meta client initialization and remain replayable
after key removal/rotation. Database availability is required for that lookup; if both dependencies
are unavailable, `DATABASE_UNAVAILABLE` takes precedence. Late completion of the original message
preserves its snapshot and cannot overwrite a later confirmation's committed/verified run state.
Unexpected layout service failures roll back into durable `TOOL_FAILED` receipts; unexpected
verification failures retain the committed operation with `VERIFICATION_FAILED` and no layout link.

## Phase 05 coordination

Source types: `index_models.py`; service boundaries: `index_store.py`, `index_worker.py`,
`index_provider.py`, `retrieval.py`. Generated current artifacts:
[`openapi-phase05.json`](openapi-phase05.json), [`api-phase05.d.ts`](api-phase05.d.ts),
[`agent-tools-phase05.json`](agent-tools-phase05.json). Use `make agent-contracts` and
`make contracts-check`. Historical Phase 01/03/04 snapshots are preserved.

Existing routes/IDs now implemented:

| Route | Implemented behavior and additive fields |
| --- | --- |
| POST `/analysis-jobs` | Operator + idempotency + explicit upload acknowledgment + current camera consent. Snapshot up to 30 segments/300000ms. Reuses active/processed work; new arrivals wait for another request. |
| GET `/analysis-jobs/{job_id}` | Real progress/attempts/errors plus pipeline version, selected duration, processing time, per-segment states/coverage and usage. |
| GET `/recordings/{recording_id}/index` | Current version's waiting/queued/running/succeeded/failed/cancelled segment checkpoints. |
| GET `/analysis-usage` | Operator-only UTC-day request/token/upload-byte/reservation/estimate totals. Actual provider billing is unknown. |
| POST `/search` | Existing shape + `timezone` (IANA, UTC default). Muse parses constraints; explicit camera/time bounds intersect them. Default window is the prior 24h; every resolved window is at most 24h, and at most 10000 segments. |
| GET `/cameras/{id}/activity` | Existing 10–3600s bins, at most 1440 bins/24h. Adds analyzed_ms, motion_ms, motion_sampled_ms, event_density_per_minute and playback actions. |
| GET `/events` | Available stored motion/Muse events; ordered half-open start window and keyset pagination. |
| POST `/playback-sessions` | Optional `segment_id` binds playback to the exact evidence file inside that recording. Offset-only requests retain existing behavior. |

Search uses authorized camera/time selection first, JSONB same-object/same-garment constraints,
event/motion filters, then existing PostgreSQL GIN full-text search with `plainto_tsquery('simple')`
and normalized `ts_rank_cd` ranking. No generated SQL/tsquery, embeddings or vector service.
Color is bound to a specific apparel kind: a green shirt and blue pants do not match green pants.
Exact/unique camera names, location or group resolve server-side; ambiguity/conflicting explicit
filters return 422 rather than widening the search. Relative dates use supplied IANA timezone
and server UTC now; no model-supplied absolute media times enter the stored index.

Each hit adds actual camera name, metadata ID, observable objects/apparel, event types, version,
uncertainty, provenance checksums/verified clip interval, evidence reference and `playback_request`.
Pass that complete request to `/playback-sessions` for exact segment selection, especially when
capture-clock intervals overlap. `offset_ms` is still recording-relative; seek mapping is unchanged.
Model boundaries are explicitly estimates within a real verified clip, not frame-accurate detection.
Pure motion hits have `metadata_id:null`, an actual evidence event ID, `model_id:ffmpeg_gray_v1`
and `boundary_accuracy:sampled_pixel_change`; they do not impersonate Muse observations.

Search responses add validated constraints, available/analyzed milliseconds, latency and an
honest explanation. Coverage describes unioned available/indexed media intervals per camera;
`complete` does not assert perfect object recall. Empty matches never prove inactivity.
Missing/deleted source files and source stat changes exclude stale analysis. Relevance is rank,
not confidence. Evidence responses contain no private storage key, provider file ID or secret.

Activity availability (`coverage_ms`) unions real ready-file intervals. `analyzed_ms` unions
successful clip intervals. `motion_sampled_ms` is measured low-resolution sample coverage;
`motion_ms` is its thresholded pixel-change subset. Unknown intervals do not become zero-motion
evidence. `event_count` counts Muse observation occurrences once at their start, irrespective of
how many type tags they carry. Density is that count per actual bin minute. Pixel change can be
lighting/camera movement; it is not identity, intent or an object detector.

Additional stable failures include `MODEL_BUDGET_NOT_CONFIGURED`, `MODEL_BUDGET_EXHAUSTED`,
`MODEL_BUSY`, `MODEL_NOT_CONFIGURED`, `INVALID_MODEL_OUTPUT`, `INVALID_MODEL_TIMESTAMP`,
`CONSENT_REVOKED`, `NO_AVAILABLE_SEGMENTS`, `SEGMENT_TOO_LONG`, `INVALID_TIME_RANGE`,
`SEARCH_WINDOW_TOO_LARGE`, `TOO_MANY_BUCKETS`, `UNSUPPORTED_SEARCH_CONSTRAINT`,
`CAMERA_FILTER_CONFLICT`, `SOURCE_CHANGED` and worker lease errors. Provider bodies stay private.
Indexing failures appear in job checkpoints; missing dependencies are explicit 503s.

The existing frontend owner must adopt current types, timezone, exact-segment playback and
separate activity metrics. `apps/web` and frozen `packages/contracts` are not edited in Phase 05.

## VIDEO-01 additive media provenance

Migration `006_demo_media` adds nullable JSONB provenance snapshots to cameras and recordings.
`Camera.source_media`, `Recording.source_media`, and approved-source `label`/`source_media` are
additive runtime fields. They distinguish operator-provisioned prerecorded films from synthetic
fixtures, and retain title, creator, original/license URLs, license, transformations and the
normalized video SHA-256. Existing recordings keep null provenance rather than incorrectly
inheriting a replacement source's metadata. Original capture dates are never inferred from
local replay/ingest clocks. No existing camera/recording/index IDs are changed.

Authenticated `GET /cameras/{id}/thumbnail` returns a JPEG extracted from the corresponding
checksum-verified film, or explicit `404 THUMBNAIL_UNAVAILABLE`. It does not fetch external URLs
and cannot accept a caller-controlled path. The same-origin web adapter allowlists this route.
Source configuration adds only fixed local publishers; RTSP pull admission/egress policy is
unchanged. A thumbnail is a preview frame, independent of the observed connection state.

Regenerate Phase 05 runtime artifacts from Python with `make agent-contracts`; frozen package
contracts and historical Phase 03/04 artifacts remain unchanged.

VIDEO-01 also adds optional `AnalysisJobCreate.max_segments` (strict integer 1–30, default 30).
It narrows the normal consented ingestion job, leaving unselected clips waiting and successful
checkpoints reusable. Admission metering, current camera consent, grounding validation, leases,
idempotency and retries remain unchanged. This allows a genuinely small demonstration without
queuing an entire long historical recording under a nearly exhausted daily budget.

When `max_segments` is omitted, analysis idempotency hashes retain the pre-VIDEO-01 request
shape (`exclude_unset=True`). Existing acknowledged requests therefore remain replayable with
their original keys after upgrading; an explicitly supplied cap remains part of the key binding.
