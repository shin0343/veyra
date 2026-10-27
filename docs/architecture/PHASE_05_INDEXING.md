# Phase 05 — grounded video indexing and retrieval

Phase 07 correction: output truncation is `MODEL_OUTPUT_TRUNCATED`; named observation interval,
apparel binding and unsupported-inference rejections may retry within the existing three-attempt
lease budget. Invalid metadata is never published. Terminal failure marks the attempted clip;
unattempted clips return to waiting without the attempted clip's failure code. Schema diagnostics
contain rule identifiers only. Application Muse turns now share the usage meter (migration 005).

Contract coordination, recorded before implementation. Backend-owned additive runtime
schemas will be generated as Phase 05 artifacts; frozen shared contracts and `apps/web`
remain unchanged. Existing search, analysis, activity and event operation IDs are retained.

## Execution design

One PostgreSQL-backed worker, sequential external inference, no vector service. Finalized
segments receive durable indexing-status rows. Explicit recording analysis acknowledgment
and current camera cloud consent are required to queue them. A request snapshots at most
30 segments / 300 seconds; newly finalized segments remain waiting for another acknowledgment.
Duplicate submissions reuse active work and already successful versioned segment indexes.

FFprobe verifies source media. Bounded FFmpeg grayscale sampling measures pixel changes;
a representative short silent H264 clip is selected around motion/scene change, or the
start of a static segment. Meta Files + Responses returns validated observable descriptions,
objects/attributes, estimated within-clip intervals, event types and uncertainty. The worker
normalizes these to actual segment-relative offsets. Output and media provenance are versioned.
No identity, demographics or intent inference; no SAM dependency.

Leased recording jobs use fencing tokens, heartbeat, three attempts, per-segment checkpoints
and bounded retry delays. Consent and media availability are rechecked before upload and
publication. API calls require configured daily request and monetary reservation limits.
Usage records distinguish configured reservations, token-price estimates and unknown billing.
Provider file deletion and a one-hour expiry backstop bound remote retention.

## Additive HTTP contract

- `POST /analysis-jobs`, `GET /analysis-jobs/{id}`: existing shapes plus version, selected
  segment states, actual analyzed intervals, elapsed processing, usage and cost data.
- `GET /recordings/{id}/index`: segment indexing/coverage status, including waiting work.
- `POST /search`: existing request plus IANA `timezone` (UTC default). Muse parses bounded
  structured constraints using server-supplied time/camera context. Explicit camera/time
  filters intersect inferred filters; they cannot be widened. Retrieval uses parameterized
  camera/time, same-object attributes, event constraints and PostgreSQL GIN full-text search.
- Hits retain frozen fields and add actual camera descriptors, evidence metadata IDs,
  object/event matches, model/schema/provenance, estimated-boundary uncertainty and typed
  playback targets. No model-generated URL or absolute timestamp is accepted.
- An observed native replay has overlapping segment clock intervals. A recording offset
  alone cannot uniquely choose the evidence file in that overlap. Search hits therefore add
  `playback_request` with the actual `segment_id`; `/playback-sessions` accepts that optional
  field and materializes the selected real file. Existing offset-only clients retain their
  behavior, while evidence playback can select the exact analyzed segment. Frontend adoption
  of this additive field belongs to its owner.
- `GET /cameras/{id}/activity`: availability milliseconds, analyzed milliseconds, measured
  motion milliseconds and start-counted semantic event density are distinct. Bins carry
  real playback targets. Unknown analysis is distinct from observed low motion.
- `GET /events`: actual stored available events with bounded keyset pagination.
- `GET /analysis-usage`: authenticated operator-only aggregate API usage/reservations.
- Muse registry adds `video.search` for validated structured retrieval. Agent tool execution
  and REST use the same retrieval function; the tool does not recursively call Muse.

Missing credentials/budgets yield explicit dependency errors. No matches explain indexed
coverage rather than claiming no activity occurred. A missing source file excludes its hit
even before the media reconciler catches up. Half-open UTC intervals and integer milliseconds
remain mandatory. Sampling does not prove continuous surveillance or object/event recall.

## Validation gates

Use licensed real footage with source/license/checksum and independently reviewed labels.
Local integration uses real FFmpeg/PostgreSQL and explicitly scripted provider responses.
A separate live gate must perform actual Meta upload/inference, persist output, parse a
natural-language query, retrieve it and open an authenticated playable offset. Missing key
is an unverified live gate, never a passed genuine-AI demonstration. Actual latency, time,
tokens and cost estimates are reported only when measured; unknown charges remain null.

## Operate

1. Configure private `.env` database/operator settings, `MODEL_API_KEY` and positive
   `MODEL_DAILY_BUDGET_USD` / `MODEL_REQUEST_RESERVE_USD`. Zero monetary defaults disable
   paid video/search inference. `MODEL_DAILY_REQUESTS` defaults to 100. Optional verified
   input/output token prices populate estimates, never fabricated invoice amounts.
2. Run `make migrate`, the VMS/API, and `make index-worker` in another terminal. Compose
   includes the same worker with read-only recording storage. Container execution still
   requires an available Docker environment.
3. Enable `cloud_analysis_allowed` on the actual camera. POST a real `recording_id` and
   `allow_cloud_upload:true` with Idempotency-Key to `/api/v1/analysis-jobs`. Poll the job.
   New segments remain waiting for the next explicit request; no indefinite cloud subscription.
4. POST `/api/v1/search` with query, optional explicit camera/time bounds and IANA timezone.
   Inspect `constraints`, `coverage`, available/analyzed milliseconds and uncertainty. Send
   the chosen hit's complete `playback_request` to `/api/v1/playback-sessions`, then use the
   returned authenticated MP4 URL and `seek_offset_ms`.

`make index-smoke` runs the real-media backend suite plus native RTSP/MediaMTX/index/playback
probe with explicitly scripted provider HTTP. `make index-live-smoke` also enables actual
three-clip Muse evaluation and a genuine-Muse native replay. It exits nonzero unless both live
gates pass. Individual native probe: `scripts/index_native.py [--mediamtx PATH] [--live]`.
Neither `make check` nor normal indexing acceptance silently enables paid video calls.

The bundled [evaluation dataset](../../apps/api/tests/fixtures/video/LICENSE.md) contains
three CC BY 3.0 derivatives from Henry Geer's real cycling film. Actual FFprobe durations are
3003/4004/4004ms; labels were independently reviewed at 2fps. Controlled import/replay camera
names and capture clocks are explicitly distinguished from the film's original capture clock.
This tests object/event, apparel binding, time/camera filters, no-match, failures, timestamp
grounding, latency, processing time and cost telemetry. Actual genuine model correctness,
latency, tokens and estimates are recorded only by the explicit live evaluation.

## Bounds and limitations

- Default sampling is 500ms, one at-most-10s 640px silent clip per segment, 20MiB upload;
  at most 30 segments/300s per acknowledgment. Segments longer than 60s require explicit
  operator configuration (maximum 300s). Pixel difference guides representative selection;
  lighting, cuts or camera motion can trigger it. Object/event recall is not continuous.
- Jobs have three attempts, 60s leases, 15s heartbeat, checkpointed publication, bounded
  retry delay and no hidden inference retries. Two in-flight inference reservations are
  admitted globally; a UTC-day request cap and conservative monetary reservations bound
  usage. Configure reserves from account pricing. A reservation is an admission estimate,
  not a guaranteed Meta invoice ceiling. Missing prices/charges remain unknown.
  Sampling/model configuration changes explicitly cancel unstarted/stale older-version work;
  still-running older jobs must finish or expire before a new configuration can be admitted.
- Captions/objects/events and within-clip boundaries are model observations with uncertainty.
  Media intervals, camera/recording IDs, source checksums and playback files are real.
  Identity, demographic/intent inference, negation/count/spatial reasoning beyond camera
  locations, face recognition, SAM tracking, vector retrieval and distributed analytics are absent.
- Search is lexical/structured and bounded to 24h/10000 segments; it can miss synonyms or
  brief unsampled activity. The tiny single-source evaluation has no positive red-jacket,
  night, entrance or garage footage and establishes no general surveillance accuracy.
- Source deletion/stat changes remove stale search/activity analysis. Per-query stat checks
  are inexpensive and do not cryptographically detect adversarial byte changes that preserve
  both size and mtime; recording storage is operator-controlled and finalized files immutable.
- The current frontend uses frozen types and ignores new fields. Exact-segment playback,
  timezone, separate motion/coverage/event metrics and worker-launch UX need frontend-owner
  integration. No frontend-owned file is changed. Legacy offset-only playback can choose a
  different covering segment when recording clocks overlap; exact evidence requests resolve it.

Official protocol sources checked October 26 Pacific / October 27 UTC, 2026:
[video understanding](https://dev.meta.ai/docs/video-understanding),
[Files upload/expiration/deletion](https://dev.meta.ai/docs/file-handling),
[structured output](https://dev.meta.ai/docs/structured-output).
The fixed first-party Standard endpoint uses Files `purpose=user_data`, 3600s expiration,
Responses `input_file.file_id` and strict `text.format`; no public media URL is accepted.
