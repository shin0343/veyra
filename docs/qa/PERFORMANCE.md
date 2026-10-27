# Phase 07 measured performance

These are observed local timings, not before/after performance improvements or production SLOs.
Use the final `system.json`/`browser.json` linked in HANDOFF for raw samples. Earlier failed
runs remain in `evidence/` and are included in the reliability discussion.

## Measurement conditions

One macOS arm64 development host; loopback HTTP and RTSP; PostgreSQL 15.19; MediaMTX 1.21.3;
FFmpeg 8.0.1; production Next 16.4.3; Playwright Chromium 1.64.1. Three 640×360 H264 synthetic
publishers and one short licensed cycling replay. The licensed source is stopped after roughly
11 seconds, producing two finalized clips, to bound cloud use. No physical camera, WAN media
transport, sustained multi-user load, large corpus or isolated benchmark host was tested.
Native QA/model processes sometimes ran concurrently; OS/browser/media caches were warm.

| Metric | Definition / sample size |
| --- | --- |
| Live startup | Three full page navigations to the actual camera; navigation start to a decoded frame (`readyState >= 2`, nonzero width), then playback advancement checked. Uses DOMContentLoaded rather than a forced 500 ms network-idle wait. |
| Recording retrieval | Three new two-second playback sessions plus a 128-byte Range 206 fetch. Includes export/preparation and HTTP; excludes transfer of a full recording. Same recording/offset, warm source caches. |
| NL search | Three distinct positive queries, browser submit to completed API response, including real Muse intent parsing and PostgreSQL retrieval. These are correlated queries over one repeated scene. |
| Indexing per clip | Real worker `processing_ms`: media checks/sampling/extraction, upload/inference/delete and publication. Two clips; job wall time also includes polling/scheduling. |
| Agent operations | Feature navigation, camera-context navigation, approved layout creation and expanded Muse search/navigation are counted separately. Tool-call success is not substituted for completion of the requested route or persistent mutation. |
| Manual comparison | One automated manual-UI layout creation versus one Muse proposal/approval/open workflow, same four cameras. Excludes human typing, reading, deliberation and discovery; includes automation and screenshot overhead. Not a user study. |

## Final observed samples

Source: [final system report](evidence/20261027T072125917447Z/system.json),
[browser report](evidence/20261027T072125917447Z/browser.json).

| Measure | n | Raw samples | Median | Maximum |
| --- | --- | --- | --- | --- |
| Live decoded-frame startup | 3 | 114, 75, 76 ms | 76 ms | 114 ms |
| Two-second recording preparation + Range retrieval | 3 | 35, 35, 34 ms | 35 ms | 35 ms |
| Natural-language search | 3 | 7,490, 4,239, 3,015 ms | 4,239 ms | 7,490 ms |
| Indexing a 10,000 ms clip | 1 | 28,324 ms | — | — |
| Indexing a 1,067 ms clip | 1 | 20,743 ms | — | — |

The two-clip job took **51,526 ms** end to end and succeeded on its first leased attempt.
Decoded playback position differed from the requested offset by **228 ms** in scenario A and
**3 ms** for exact search evidence. Both are media-seeking measurements, not model boundary error.

Genuine feature navigation completed in **3,029 ms**, camera-context navigation in **1,797 ms**;
Muse 2×2 creation/approval/open in **2,240 ms**; Muse video search proposed a grounded action in
**3,935 ms**, then its exact-segment link opened and played. **4/4 requested agent operations
completed in the final run.** This is four tasks in one rehearsal, not a long-term success estimate.

The manual-UI layout task took **330 ms** versus **2,240 ms** with Muse (one sample each).
The automated manual path was faster under these conditions. No human time saving is established.
Earlier browser runs included two actual failed Muse searches due to invalid nullable arguments,
plus a failed diagnostic replay before the optional-filter correction; they remain failures.
Other early case failures included harness setup and the subsequently fixed playback race.

Across the **six retained browser development runs**, **19/21 attempted agent tasks completed
(90.5%)**: 12/12 feature/camera navigations, 6/6 persisted-and-opened layouts, 1/3 Muse video
searches. One additional Muse-search case stopped on its failed indexing precondition and made
no agent request, so it is not counted as an attempted task. The first layout's later axe harness
failure does not erase its independently verified database/route completion. API-only diagnostic
probes and separate acceptance-gate tests are outside this browser cohort. These runs used
different code revisions; the aggregate is development history, not a post-fix reliability estimate.

## Cost

Final application run: **15 logical inference calls** (9 agent turns, 4 search parses,
2 video analyses), **45,701 input / 11,549 output tokens**, **507,835 uploaded bytes**,
and **$0.75 reserved**. Both uploaded files were deleted successfully according to the provider
responses. Estimated dollar cost: **unknown**; actual billed dollar cost: **unknown**.

The application ledger records logical `agent_turn`, `video_analysis` and `search_intent` calls,
token counts when supplied, upload bytes, elapsed time and failures. Final raw usage is in
`system.json`. The operator configured a $0.05 reservation per call and a $5 daily per-database
admission budget; these values are not Meta prices. Verified token prices were not configured,
so monetary cost estimates and actual billed cost remain unknown/null. Standalone smoke tests
and disposable databases have separate accounting; the report does not claim an account total.

## Interpretation and limits

- Report raw samples, count, median and maximum; three measurements cannot establish a useful
  tail-latency percentile, capacity bound or long-term reliability rate.
- Player seek error measures the requested media offset against decoded playback position.
  It does not measure model observation-boundary accuracy or scene-detection recall.
- Genuine quality evaluation uses three licensed clips from one film and six expected-result
  queries. The broader five-scene/ten-query product evaluation is still open. Repeated clips
  and multiple observations are not independent scenes.
- The manual UI is expected to be fast for an automated operator who already knows the path.
  A successful Muse task does not imply a speed advantage. No improvement claim is made.
- Bounded model rejection and tool-argument failures occurred in prior live runs. Successful
  final-run samples must be read together with those failures, not as a 100% reliability claim.
