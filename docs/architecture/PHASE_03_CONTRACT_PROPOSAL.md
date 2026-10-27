# Phase 03 additive contract proposal

Recorded before implementation, October 26, 2026. The frozen v0.1.0 frontend interface
remains valid. No existing required request field, operation ID, route or media unit changes.
The frontend and its generated types will not be edited in this phase.

Proposed extensions for the requested camera-management scope:

- Camera create/update accept optional `group_name` and `location` (nullable strings,
  1–100 characters when supplied). Camera responses include these nullable fields and
  nullable `connection_error: ErrorDetail` for actionable connectivity/codec failures.
- `DELETE /api/v1/cameras/{camera_id}` accepts Idempotency-Key and returns 204. It soft-deletes
  registration, stops ingest, preserves recordings and rejects cameras referenced by a saved
  layout with 409 CAMERA_IN_USE. Existing clients are unaffected; the current frontend adapter
  intentionally does not expose DELETE or the new fields until its owner integrates them.
- Existing CameraCreate `{name,source_id,cloud_analysis_allowed}` stays supported unchanged.
  RTSP URLs and credentials remain operator-only configuration, never model/browser input.
- The runtime OpenAPI will describe the additive backend extensions in a separate Phase 03
  artifact. Frozen shared v0.1.0 OpenAPI/TS/agent-tool artifacts remain unchanged.

Implementation layout: `apps/api/veyra` is the canonical backend package, migrated from
`services/api/veyra`; `services/media` owns finalization hooks, probes, sample publisher and
media tests. Update backend startup/export/test scripts for the new location. Do not touch
`apps/web`. Muse/analysis/search routes retain explicit 501 behavior.

Media design remains RTSP/TCP → MediaMTX HLS/fMP4 → finalized-segment metadata → bounded
cached MP4 with authenticated Range support. Real pull sources require both IP/port admission
and an egress guard, because initial URL validation alone cannot constrain RTSP redirects.
The trusted FFmpeg publisher is a separate explicit sample source, not a loopback exception
to the camera destination policy. Docker is unavailable locally; native acceptance must use
the real PostgreSQL, MediaMTX and FFmpeg executables and report container validation separately.
