# Final E2E results — release recovery (October 27–28, 2026)

Every number below was produced in this release-recovery session. Earlier reports were not
counted. Evidence lives in [`final/release/`](final/release/) and [`final/live-muse/`](final/live-muse/).

## Environments

| Name | What it is | Muse provider | Data |
| --- | --- | --- | --- |
| **RC (scripted)** | `scripts/final_rc.py --qa-provider`: :3700 (keyless) and :3701 (scripted) | `httpx.MockTransport` on :3701 only — **not live** | Fresh PostgreSQL restored from the curated snapshot per run; recordings copied (APFS clone) |
| **Live (capped)** | `scripts/final_rc.py --live-muse-requests 4 --port 3710` | **Real Meta Model API** (`muse-spark-1.3`), hard server cap 4 requests / $0.20 reservation | Same fresh isolated copy; shut down right after the run |
| **Canonical** | `scripts/demo_videos.py` on :3200, build `h45YdTzeygibz8PyPrxR6` | Real key configured; no request made by tests (guards abort paid/mutating calls) | Preserved curated demo DB `runtime/demo` |

## Results

| Suite | Environment | Result | Notes |
| --- | --- | --- | --- |
| `make check` (ruff, format, pytest, tsc, contracts) | local, throwaway PostgreSQL clusters | **PASS** · 192 passed, 1 skipped | +6 new tests (locking, frame cache) |
| ESLint `--max-warnings=0` · Prettier · `tsc --noEmit` | apps/web | **PASS** | |
| Final integration (`final-integration.mjs`) | RC :3701, build `1VIg0vg6F777XBlxOnr7n` | **PASS · 10/10** | Muse steps scripted; DB, media, index real |
| REDESIGN-02 flows | RC :3700 / Canonical :3200 | **39/39** / **39/39** | 0 paid or mutating requests |
| REDESIGN-01 flows | RC :3700 / Canonical :3200 | **49/49** / **49/49** | Canonical first run right after cold start: 1 fail (Home stage video not yet attached) then script crash; immediate re-run 49/49. Recorded as a cold-start flake. |
| VIDEO-02 flows | RC :3700 / Canonical :3200 | **23/23** / **23/23** | No PAID/SAVE |
| Layout locking tests (pytest) | throwaway PostgreSQL | **PASS · 4/4** | Before fix: 2 lock-timeouts, 4 `DeadlockDetected` in a 4 s stress |
| Layout POST reproduction | RC :3701 API | **40/40 201** sequential, **30/30 201** parallel | Before fix: 7/40 → 503 `DATABASE_UNAVAILABLE` (`DeadlockDetected`) |
| Frame-cache tests (pytest) | local | **PASS · 2/2** | Before fix: `FileNotFoundError`, partial file evicted |
| **Live Muse Test B** — NL search → evidence playback | Live :3710 | **PASS** | see below |
| **Live Muse Test A** — agentic layout with approval | Live :3710 | **PASS** | see below |

Server errors across the clean RC run ([`server-errors.txt`](final/release/server-errors.txt)):
0 PostgreSQL deadlocks, 0 `/events` 422, 0 frame 500s. Remaining: one intended stale-PUT 409,
one retryable `live-session` 503 for a camera registered seconds earlier (UI retried and played),
one retryable `playback-sessions` 503 while another clip was being prepared.

## Final integration scenarios (RC, scripted Muse)

1. Camera registration through the UI persists; its licensed stream plays (frames advance).
2. Real layout POST, UI PUT → version 1→2, exact cells, reload shows 3 playing tiles + 1 honest
   empty slot; stale `expected_version` → 409 `VERSION_CONFLICT`; stored row unchanged.
3. Muse clarification: camera choices fill the composer, 0 extra requests.
4. Muse proposal → nothing saved before approval → double-click approval sends 1 confirmation →
   `completed_verified` → independent GET equals receipt → exactly 1 layout → 4 videos play.
5. Decline is non-mutating; unknown camera returns `CAMERA_NOT_FOUND`.
6. NL search submitted once; camera refinement, Back and reload reuse stored criteria (0 extra
   parses); result opens the exact segment and plays.
7. Legacy mixed-provenance recording stays accessible but outside curated results.
8. Suggestion chips, contextual actions and palette navigation spend 0 requests on 6 routes.
9. No-match is honest; timeline event selection plays.
10. Dialog accessibility: 0 axe violations, focus contained.

## Live Meta Muse session (paid, 28 Oct 2026 02:40 UTC)

Ledger before: 0 requests, cap 4, $0.20. Analysis jobs and indexing were blocked in the browser;
no indexing worker ran. Full record: [`final/live-muse/results.json`](final/live-muse/results.json).

| | Test B — video intelligence | Test A — agentic action |
| --- | --- | --- |
| Input | "squirrels at the feeder" | `Create a 2x2 view named "Live Muse check" with Entrance gate, Street approach, Community space and Bicycle parking.` |
| Muse interpretation | `animal_visible`, keywords "squirrels", "feeder", window 15:00–15:30 UTC, curated only | Tool calls `cameras.list` → `layouts.create` (confirmation required) |
| Result | 1 moment: Garden wildlife, "Two reddish-brown squirrels climb and jump on a small post-mounted feeder…" | Proposal for exactly the 4 named cameras, 2 columns; nothing saved before approval |
| Verification | Opened recording is Garden wildlife, segment belongs to it, video advances | Approval → `completed_verified`; independent GET equals receipt; 1 layout; 4 videos play; no contradictory text |
| Latency | 7.8 s (server 7.77 s) | proposal 3.45 s; approval 49 ms (no model call) |

Usage after: **3 provider requests** (1 search parse + 2 agent turns), **9,001 input / 1,969 output
tokens**, $0.15 reserved by admission. Actual billing is not exposed by the API ("unknown"); at the
published list price ($1.25 / $4.25 per M tokens) this is ≈ **$0.02**. The ledger counts admitted
logical requests; a bounded HTTP retry inside one would not appear separately (none is indicated).
Screenshots: [proposal](final/live-muse/a1-proposal.png) ·
[verified receipt](final/live-muse/a2-verified-receipt.png) ·
[view playing](final/live-muse/a3-view-playing.png) ·
[search understood](final/live-muse/b1-search-understood.png) ·
[evidence playback](final/live-muse/b2-evidence-playback.png).

## Not tested

- Live Muse on the canonical demo DB (deliberately: it would mutate curated data).
- `live-flows.mjs`, `demo-walkthrough.mjs` (older suites that spend requests and save views).
- Docker/Compose, physical cameras, Safari/iOS, Python dependency audit (`pip-audit` absent).
