# Video indexing worker

Run `make index-worker` from repository root after `make migrate`, or use Compose's `worker`
service. The process uses the same Python dependency lock and shared backend services.
No API background task or in-memory queue owns indexing work.

Finalized segments receive waiting checkpoints automatically. An operator must enable camera
cloud consent and POST `{recording_id,allow_cloud_upload:true}` to `/api/v1/analysis-jobs`
with idempotency. Each request snapshots at most 30 segments/300 seconds; new segments await
another acknowledgment. Default clip selection is at most 10 seconds, 640px wide, silent H264,
20 MiB maximum, focused by cheap 2fps grayscale change. Sampling and motion threshold are
configurable. One worker processes clips sequentially; a DB-backed two-inference limit applies
across workers and search requests.

Configure private `MODEL_API_KEY`, `MODEL_DAILY_BUDGET_USD>0` and
`MODEL_REQUEST_RESERVE_USD>0`. The default zero monetary limits disable paid inference.
`MODEL_DAILY_REQUESTS` defaults to 100 (maximum 1000); estimates use optional account-verified
`MODEL_INPUT_USD_PER_MILLION` / `MODEL_OUTPUT_USD_PER_MILLION`. A reservation is a configured
admission estimate, not a provider-guaranteed bill cap. Unknown/failed request costs retain the
reservation; actual charges remain unknown. Input/output sizes, calls and attempts are bounded.

Jobs use SKIP LOCKED, 60-second fenced leases renewed every 15 seconds, at most three attempts
and bounded exponential retry delays. Completed segments are not reanalyzed on retry. Consent,
source presence/hash and observation timestamps are checked again before publication. Files
are deleted remotely in finally and expire after one hour as a crash backstop. Cleanup failures
appear in usage records. SIGINT/SIGTERM stops after the bounded current operation.

See [operation/API/evaluation](../../docs/architecture/PHASE_05_INDEXING.md) and
[handoff](../../docs/HANDOFF.md). No live-Muse success is claimed by scripted acceptance tests.
