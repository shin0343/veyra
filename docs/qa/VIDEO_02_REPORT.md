# VIDEO-02 — AI video intelligence + design-led evolution

**Verdict: complete on the native presentation stack.** October 27, 2026. Production build
`Xt58zp9KoNy6Yf99tkmGh` is running at **http://127.0.0.1:3200** against the preserved
`runtime/demo` database. No push, deployment, external message, database reset, re-import or
re-indexing. VIDEO-01 footage, cameras, recordings and indexes were reused as is.

## What was inspected first

AGENTS, HANDOFF, PRODUCT, VIDEO_LIBRARY, VIDEO_ASSET_MANIFEST, VIDEO_01_REPORT, PHASE_08_READINESS,
KNOWN_LIMITATIONS, API_CONTRACT and the frontend/back-end search, retrieval, events, media
and session code. The running app was captured before any change
([before screenshots](video02/before/)). Findings that drove the work:

1. Overview opened with a marketing hero ("Your spaces, a little clearer.") — template feel.
2. Search was a text-only list (camera icon + timecode in place of footage); every query cost a
   paid Muse parse; no way to browse what was already analyzed for free.
3. Activity was a 7,249 px list of unthumbnailed rows dominated by motion samples.
4. **Latent date bug:** Activity, its histogram, workspace events, recording moments and the
   search default all used "last 24 hours ending now". The demo footage was recorded Oct 27
   07:46–15:28 UTC, so these screens would be empty from ~07:46 UTC Oct 28 — before the Nov 4 demo.
5. Budget: the UTC-day ledger already stood at 92 requests / **$4.60 of $5.00** reserved.

## Delivered

**Design contract and research**
- [DESIGN.md](../../DESIGN.md) (root, 18 sections) — Veyra's own contract; AGENTS.md and CLAUDE.md
  now point frontend work to it; DESIGN_SYSTEM.md marked as superseded where different.
- [REFERENCE_RESEARCH.md](../design/REFERENCE_RESEARCH.md) — 9 inspected references with the
  adapted/not-copied split and inspection limits (Mobbin flows are login-gated: not inspected).
- [VIDEO_INTELLIGENCE_UX.md](../design/VIDEO_INTELLIGENCE_UX.md) — Explore journey, layout,
  data source of every element, states, interaction details.
- Contrast was measured, and three draft claims were corrected before shipping
  (`--border-strong` 2.98 → 3.52:1; no secondary text on sage; ink text on teal-wash).

**Explore workspace (`/explore`, replaces Search; `/search` redirects with its query)**
- Ask bar (Muse, cost stated), topic chips with real counts (index, free), camera filter.
- Lanes timeline per camera: recorded, analyzed-by-Muse, motion and observation layers from the
  activity API; result ticks clickable; overlapping ticks clustered with a count; drag to focus a
  period; table alternative.
- Evidence results with **real frames decoded from the evidence segment**, camera, wall time,
  interval, tags and uncertainty; paged 12 at a time; arrow-key navigation.
- Sticky inspector: exact-segment playback, interval and recording offset, what Muse saw (with
  its evidence), certainty + "not verified fact" + no identification, source/processing,
  around-this-moment frames, Open in recording / Watch live / Focus ±5 min / Show only camera.
- Review view action: explicit plan (amber) → Save (direct `POST /layouts`, idempotent) →
  receipt → Open view; or **Ask Muse to propose it instead** (genuine proposal/approval).
- Named failure states: Muse budget reached / unavailable / not understood, index unavailable,
  no match, nothing analyzed, frame unavailable; topic fallback is *offered*, never substituted.

**Other screens**: Overview (orientation header, live film, Recently found by Muse with frames,
Look-for shortcuts, saved-view frame mosaics); Activity (anchored window, observations first with
frames, honest newest-first ordering); Recordings (moments and library rows with frames,
moments from the recording's own window); plain-noun 24 px page titles everywhere; `--stage`
behind video; player auto-retries a busy clip preparation (`MEDIA_BUSY`) up to 4×.

**Backend (additive, runtime-only; frozen v0.1.0 unchanged)** — `apps/api/veyra/explore.py`:
`POST /index-query`, `GET /index-coverage`, `GET /recordings/{id}/frame`. Documented in
[API_CONTRACT](../architecture/API_CONTRACT.md); runtime artifacts regenerated;
4 regression tests in `apps/api/tests/test_video02.py`. No migration, no prompt change, no
change to Muse tools, media ingestion, recording or playback.

## Verification (actual results)

| Check | Result |
| --- | --- |
| `make check` (Ruff, pytest, typecheck, contracts) | **178 passed / 1 skipped** (was 174/1; +4 VIDEO-02); Ruff clean; frozen + runtime contracts match |
| `npm run lint` · typecheck · `prettier --check src tests` | passed, zero warnings |
| `npm run build` (production) | passed; build `Xt58zp9KoNy6Yf99tkmGh` serving :3200 |
| `tests/verify-ui.mjs` (preview fixtures, API-less dev server) | passed: 24 route/viewport checks, 31 interactions, **29 axe scans, 0 violations** |
| `tests/video02-flows.mjs` (production, real stack, no model) | **23/23 passed, 0 page errors** — [flows.json](video02/flows.json) |
| Same, with one real direct save (`SAVE=1`) | 23/23; saved and opened "Review · People (VIDEO-02 QA)", four films playing — [flows-save-run.json](video02/flows-save-run.json) |
| Genuine Muse (`PAID=1`) | 25/25: Muse search + Muse layout proposal → approval → verified → opened — [paid/flows.json](video02/paid/flows.json) |
| Responsive 1440/1280/1024/768/390 × 8 routes | 0 px horizontal overflow on all 40 |
| axe on real Explore / Overview / Activity | 0 violations each |

Covered by the flows: real index load (8 lanes, 12 frames), Animals → the actual squirrel clip
playing, camera filter, cluster stepping, drag-to-focus and reset, `/` and arrow keys, Open in
recording (plays at the exact segment), review dialog, Overview frames + live film, Activity
frames. **Simulated** (one intercepted browser response each, labelled in the report): Muse budget
exhausted + topic offer, no match, index unavailable, slow search, frame unavailable. Actual
camera offline / buffering / recovery states were verified in VIDEO-01 and the player code for
them is unchanged; they were not re-staged here.

### Genuine Muse (single observed samples, not benchmarks)

| Action | Outcome |
| --- | --- |
| Explore → Ask Muse "squirrels at the feeder" | Understood: *Animal visible*, keyword *feeder*; 1 moment, Garden wildlife, real frame and playback; 14.9 s |
| Review these cameras → Ask Muse to propose | Proposal "Garden review" (1 column, Garden wildlife) → approved in the UI by the test harness → "Saved and verified" → opened and played |

### Performance observed

Index query 0.80–1.44 s server time (verifies ~7,700 segment files); frame decode ~40 ms cold,
~10 ms cached; 88 cached frames = 1.5 MB. Single local samples.

## Budget and data preservation

| Measure | Before VIDEO-02 | After |
| --- | ---: | ---: |
| Model requests (UTC-day ledger) | 92 | **95** (1 search parse + 2 agent turns) |
| Reserved admission estimate | $4.60 / $5.00 | **$4.75 / $5.00** |
| Video uploaded | — | 0 bytes (no indexing) |
| Cameras · recordings · segments | 8 · 10 · 7,724 | 8 · 10 · 7,724 |
| Muse observations · indexed clips | 95 · 35 | 95 · 35 |
| Saved views | 5 | 7 (two deliberate test saves: direct and Muse) |

All development and QA used index reads (no model). The stack was restarted four times through
the documented `scripts/demo_videos.py` path (stop owned controller → start); every restart
reported `newly_captured_sources: []` and queued no cloud jobs. Reservations are admission
estimates, not invoices; billing is unknown.

## Before / after

| Screen | Before | After |
| --- | --- | --- |
| Overview | [before](video02/before/home-1440.png) | [after](video02/after/overview-1440.png) · [390](video02/after/overview-390.png) |
| Search → Explore | [before](video02/before/search-1440.png) | [after](video02/after/explore-1440.png) · [Muse search](video02/paid/after/muse-search.png) · [1024](video02/after/explore-1024.png) · [768](video02/after/explore-768.png) · [390](video02/after/explore-390.png) |
| Activity | [before (7,249 px)](video02/before/events-1440.png) | [after](video02/after/activity-1440.png) |
| Recordings | [before](video02/before/recordings-1440.png) | [after](video02/after-pages/recordings-1440.png) · [evidence playback](video02/after/evidence-recording.png) |
| Other pages | [before](video02/before/) | [after](video02/after-pages/) |
| States | — | [animals](video02/after/explore-animals.png) · [focused range](video02/after/explore-focused-range.png) · [review dialog](video02/after/review-dialog.png) · [saved](video02/after/review-saved.png) · [view playing](video02/after/review-view-playing.png) · [budget](video02/after/state-budget_exhausted.png) · [no match](video02/after/state-no_match.png) · [service down](video02/after/state-index_unavailable.png) · [searching](video02/after/state-searching.png) · [frame missing](video02/after/state-frame_unavailable.png) · [Muse proposal](video02/paid/after/muse-proposal.png) · [verified](video02/paid/after/muse-verified.png) |

Full-page captures of long lists can show black rotated rectangles near the bottom: a Chromium
full-page-capture artifact with lazy images. A real scroll to the same rows renders every
frame (`is-ready`); verified in the browser, not a product defect.

## Anti-slop evaluation

| # | Question | Answer and evidence |
| --- | --- | --- |
| 1 | Distinctive or template? | Distinctive in structure: lanes timeline + evidence grid + inspector is domain-specific; no hero, KPI row, gradient or glow remains. The sidebar Muse card is the one generic-feeling element left (kept: it is the panel's entry point). |
| 2 | Video the protagonist? | Yes — live film on Overview, real frames on every result/moment/library row/saved view, inspector player. |
| 3 | Reflects video-analysis tasks? | Yes — find (ask/filters) → locate in time (lanes) → verify (inspector) → act (review view). |
| 4 | Primary action in seconds? | The ask bar plus visible topic chips with counts; results and a playing clip are present on load. |
| 5 | Muse useful, not decorative? | Muse parses a sentence into visible constraints and proposes a real saved view that is verified; ✦ only on Muse entry points. |
| 6 | Screens vary by purpose? | Overview orients, Explore is dense, Activity is a feed, Recordings a player workstation. |
| 7 | Colour/effects restrained? | One accent (teal), ink marks, amber only for review/uncertainty; motion only for loading. |
| 8 | Results traceable to evidence? | Every card → recording + segment + interval; frames from the same file; provenance in the inspector. |
| 9 | Welcoming, not childish? | Plain titles, calm sage paper, no mascots; copy is direct. |
| 10 | Credible for operators? | Per-camera lanes with recorded/analyzed/motion layers, coverage everywhere, table alternative, clustering, drag-to-focus. Gaps: no zoom presets, no multi-select cameras, no export — see limitations. |

## Remaining limitations

- Evaluation is small and descriptive ([VIDEO_ANALYTICS_EVALUATION](VIDEO_ANALYTICS_EVALUATION.md));
  Muse tags bicycles as vehicles (UI note added); Entrance gate person/walking claims unconfirmed.
- Only 35 of 7,724 clips are analyzed; Trail dominates broad topics (People/Bicycles/Vehicles hit
  the 50-result cap). "All moments" includes two genuine observations of a synthetic test pattern.
- Muse search wording is unchanged (Codex-owned prompt); latency ~15 s per search; ambiguity
  clarification still relies on the server's unsupported/ambiguous responses.
- Explore filters are single-select (one topic, one camera). No saved searches, export or alerts.
- `/events` still pages oldest-first server-side; Activity reads up to 1,000 events per period
  to sort honestly and says so if truncated.
- Index queries take ~1 s because retrieval stats every segment file; acceptable at this scale.
- 5 paid calls ($0.25) remain for this UTC day. Safari/iOS, Docker and physical cameras remain
  untested (unchanged from VIDEO-01).
