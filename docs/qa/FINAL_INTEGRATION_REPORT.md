# Final integration report — release recovery

Branch `release-recovery-20261027` (from `final-integration-20261027`). Checkpoint `65e4a80`
preserved the 39 uncommitted final-integration changes as found; the release commit (tag
`veyra-rc1`) adds the fixes below. Results: [FINAL_E2E_RESULTS](FINAL_E2E_RESULTS.md).

## 1. PostgreSQL deadlock on layout save (P1) — fixed

**Symptom.** `POST /layouts` intermittently returned 503 `DATABASE_UNAVAILABLE`; PostgreSQL logged
`deadlock detected`: process A `SELECT id FROM cameras WHERE id=ANY($1) … FOR SHARE`, process B
`UPDATE cameras SET status=…,last_observed_at=… WHERE id=$5`. Reproduced: 7/40 requests 0.5 s apart.

**Root cause.** The media reconciler (`pipeline.py`) updates every camera row each tick inside
one transaction (ordered by `created_at` without a tiebreak), holding row locks until commit.
`save_layout` share-locked the selected cameras in arbitrary scan order, and the agent approval
path locked them one by one in `id` order. Two different orders over the same rows → lock cycle.
Restored snapshots make heap order differ from creation order, so it happened every few seconds.

**Fix (smallest correct).**
- `store.save_layout`: `FOR KEY SHARE … ORDER BY created_at,id`. KEY SHARE does not conflict with
  the reconciler's non-key `UPDATE`, but still conflicts with `delete_camera`'s `FOR UPDATE`, so a
  camera can never be deleted under an in-flight layout (test proves delete waits, then 409
  `CAMERA_IN_USE`).
- `store.share_cameras`: one `FOR SHARE … ORDER BY created_at,id` query; the agent approval path
  uses it, so enabled/snapshot checks stay stable until commit and lock in the reconciler's order.
- `pipeline.py`: `ORDER BY created_at,id` (deterministic tiebreak, same order).

No exception suppression or retry was added. Authorization, disabled-camera checks and
confirmation snapshots are unchanged. Tests: `apps/api/tests/test_layout_locking.py`
(non-blocking both directions, delete serialization, 4 s concurrent stress with reconciler +
three savers doing POST then versioned PUTs + agent locker, version-sum and orphan checks).

| | Before | After |
| --- | --- | --- |
| Open status update ↔ layout save | `LockNotAvailable` both directions | no wait |
| 4 s stress | 4 × `DeadlockDetected`, 3 saves | 0 errors, >20 saves, consistent versions |
| 40 sequential POSTs (RC API) | 7 × 503 | 40 × 201 |
| 30 parallel POSTs | — | 30 × 201 |

## 2. Other defects fixed

| Defect | Kind | Fix |
| --- | --- | --- |
| Frame endpoint 500 `FileNotFoundError` | app (race) | `_evict` skips in-progress `.<uuid>.jpg` partials and tolerates vanished entries; `test_frame_cache.py` reproduces both |
| `/events` 422 `INVALID_TIME_RANGE` on every page load | app (frontend) | workspace event window is exactly 24 h ending 1 s after the last recording |
| Duplicate "Full range" control (empty zoomed state) | app (frontend) | empty state keeps one "Show all moments" that also resets the range |
| Unused `onDecision` prop | lint | removed from `LayoutProposalCard` |
| `.next-rc` linted as source | config | added to ESLint ignores |
| Scripted fixture chose disabled "Garden" inside "Garden wildlife" | test fixture | longest whole-word camera-name matching |
| `.live-tile`, exact `getByLabel` on a wrapping label, first-`<video>` sampling, no wait for navigation | obsolete/racy tests | `.wall-tile:has(video)` + empty-slot assertion, `combobox` role, all videos sampled, `waitForURL` |
| "1 request" cost copy assertions | obsolete tests | assert the current honest copy ("may use several model requests" for the agent, "1 request" for Explore) |
| VIDEO-02 "≥ 6 lanes" and fixed-fraction drag | data-dependent tests | lanes must equal cameras with analyzed moments (coverage API); drag spans the first moment |

No assertion was removed; each replaced check is at least as strict as before.

## 3. Real frontend/backend integration (isolated, mutable)

Camera registration, live and recorded playback (frames advance), seek to moments, layout
POST/PUT/409/persistence, Muse tool execution through the existing adapter, approval and
verified receipts, NL search over stored metadata, search-to-playback and timeline/event
navigation all passed on fresh restored copies with real media (scripted Muse), and the two
core Muse workflows passed once against the **live** Meta Model API.

## 4. Muse implementation (for reviewers)

- Model `muse-spark-1.3` through the Meta Model API (`https://api.meta.ai/v1`, chat with tool
  calls, JSON-schema final message, `max_completion_tokens` 2048, ≤ 8 turns per message).
- 13 allowlisted typed tools; only `layouts.create` mutates and it always requires a
  server-bound, expiring, single-use confirmation. The model cannot approve itself.
- Results are re-read from PostgreSQL before "Saved and verified" is shown.
- Video intelligence: a worker analyses bounded, consented clips with Muse into grounded
  observations; search makes one Muse call to turn words into typed constraints, then retrieves
  deterministically from PostgreSQL. Refinements reuse the parsed constraints for free.
- Admission: per-UTC-day request and reservation caps in the database, bounded concurrency.

## 5. Remaining

See [FINAL_RELEASE_GATES](FINAL_RELEASE_GATES.md): Docker, physical cameras, Safari and
`pip-audit` are NOT TESTED; official submission rules are not yet published.
