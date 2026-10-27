# Video intelligence UX — Explore

VIDEO-02, October 27, 2026. Visual rules: [DESIGN.md](../../DESIGN.md). Evidence of the patterns
used: [REFERENCE_RESEARCH.md](REFERENCE_RESEARCH.md). Results: [VIDEO_02_REPORT](../qa/VIDEO_02_REPORT.md).

## Name and place

**Explore** (`/explore`) is the investigation workspace, second in navigation after Overview.
"Search" described only one control; Explore covers search, filters, timeline and evidence
review. `/search` redirects (307) to `/explore` with its query string, so Muse links, ⌘K
("Search your video for …") and bookmarks keep working. The navigation contract's
`feature_id: "search"` maps to `/explore`.

## Primary journey (no training)

1. Open Explore → the latest recorded period is already shown: lanes per camera and the newest
   analyzed moments as real frames. Nothing is paid for on load.
2. Pick a topic (People · Bicycles · Vehicles · Animals · Walking · Carrying) or a camera — or type
   a sentence and **Ask Muse**.
3. Results are frames from the actual clips. The first is selected and plays in the inspector.
4. Check the evidence: interval, what Muse saw (objects + its own evidence text), certainty,
   source and processing.
5. **Open in recording at m:ss** for full context, **Watch live**, look **Around this moment**,
   **Focus timeline ±5 min**, or **Show only <camera>**.
6. Act: **Review these cameras together** saves a view directly (explicit plan + Save), or
   **Ask Muse to propose it instead** (Muse proposal → approval → verified receipt).

## Layout

```text
Explore                                    35 of 7,724 clips analyzed · 6 of 8 cameras · 95 obs.
[✦ Describe a moment — “squirrels at the feeder”                       /   ↵ Ask Muse ]
Asking Muse uses one model request …  Topic filters read the stored analysis directly.
[All moments][People 83][Bicycles 80][Vehicles 60][Animals 1][Walking 6][Carrying 4]  [All cameras ▾]
┌ Activity across cameras ── Oct 27, 12:40–8:30 AM · America/Los_Angeles ─ legend ┐
│ Trail camera   77 observed  ████████████████████████████████▌          │  ▍    │
│ Bicycle parking 3 observed                                            ▌ [3]   │  ← clustered tick
│ …                                                         drag = focus period │
└──────────────────────────────────────────────────────────── Show as table ─────┘
24 moments · All moments · window · ⚠ 5m 45s of 21h 26m analyzed     [Review cameras together]
┌frame┐┌frame┐┌frame┐                     ┌ Inspector (sticky) ─────────────────┐
│8:09 ││8:09 ││8:09 │                     │ ▶ evidence clip (exact segment)     │
cam·date  summary  tags                    │ camera · 8:09:18–8:09:28 · 0:00–0:10 │
… Show 12 more                             │ summary / evidence / actions        │
                                           │ What Muse saw · How sure · Source   │
                                           │ Around this moment (frames)         │
                                           └─────────────────────────────────────┘
```

≥1280 px: results + 440/380 px inspector. ≤1180 px: inspector moves above results (video stays
first after selection). ≤860 px: one column, chips wrap, lanes keep a 96 px name column and
every other axis label. ≤540 px: full-width Ask button.

## Data sources — every pixel traceable

| Element | Source | Model call? |
| --- | --- | --- |
| Coverage line, topic counts | `GET /index-coverage` (new) | No |
| Lanes: recorded / analyzed / motion / observation starts | `GET /cameras/{id}/activity` per lane | No |
| Topic / camera results | `POST /index-query` (new) → same `retrieve()` as search | No |
| Ask Muse results | `POST /search` (Muse parses words once, then the same `retrieve()`) | **1 request** |
| Result frames | `GET /recordings/{id}/frame?offset_ms&segment_id` (new), decoded from the evidence segment | No |
| Inspector player | `POST /playback-sessions` with `segment_id` (exact clip) | No |
| Around this moment | `POST /index-query` (same camera, ±5 min) | No |
| Review view | `POST /layouts` with idempotency key, or Muse `layouts.create` proposal + approval | Direct: no · Muse: yes |

## Time window

The default window ends at the **latest recorded footage**, not "now" (`anchoredWindow`), and
spans at most 24 h (API limit). Reason: the demo footage was recorded Oct 27 07:46–15:28 UTC; a
"last 24 hours" default would show an empty product from Oct 28 onward. The same anchoring now
applies to Activity, the Overview, workspace events and recording moments (which query their own
recording window, paginated, instead of the global 100-event list).

## Honesty rules applied

- Frames are labelled with their interval (`8:09:18 AM · 10s`), never as detections; boxes,
  tracks or frame-exact claims are not drawn because the index stores clip-level intervals.
- Coverage is printed with every result set ("5m 45s of 21h 26m recorded here was analyzed").
- No-match copy says only analyzed clips can match and absence is not proof.
- "Vehicles" carries the note "Muse sometimes tags a bicycle as a vehicle" (observed — see
  [evaluation](../qa/VIDEO_ANALYTICS_EVALUATION.md)).
- Muse failures are named (budget reached / unavailable / not understood) with request reference.
  When a topic word is recognised, the UI *offers* "Show the “Animals” filter instead" — it never
  silently substitutes index results for a Muse answer.
- Inspector: "A model description, not verified fact… does not identify people."

## States

| State | Behaviour |
| --- | --- |
| Loading | Lane skeletons, 16:9 frame skeletons, heading "Reading stored analysis…" |
| Muse searching | Button spinner, heading "Muse is reading your words…", field stays editable |
| Success | Count, sentence of filters, coverage, Muse-understood chips (Muse mode) |
| No match / nothing analyzed | Distinct titles; full-range and all-moments recovery |
| Unsupported request | Server reason mapped to identity / demographics / intent / time copy |
| Budget / model unavailable | Named title, code + reference, optional topic offer, no retry spam |
| Index unavailable | "Results unavailable" + alert panel + Try again |
| Frame unavailable | Stage with "Preview frame unavailable"; result still usable |
| Video unavailable / offline | Existing player states (MEDIA_GAP, SOURCE_OFFLINE…); busy clip preparation retries automatically up to 4× |
| Action proposal / confirmation / completion / failure | Review dialog plan (amber) → receipt with Open view; failures show the API error; Muse path uses the existing approval card and verified receipt |

## Interaction details

- `/` focuses the ask field; ←/→/↑/↓ move through results and select; Enter on a result selects.
- Lane ticks are buttons named "camera, time: summary". Moments within 0.6 % of the axis share
  one tick with a count badge; each press advances through them (overlapping ticks were
  unreachable before).
- Drag across lanes (≥ 60 s) focuses the period; **Full range** restores it. "Focus timeline
  ±5 min" provides a keyboard path.
- URL holds `topic`, `camera` and `q` (Muse request). Filter changes compose from the live URL.
- Results page in 12s ("Show 12 more"); a timeline-selected result beyond the page is revealed.

## Other screens changed for the same journey

- **Overview:** marketing hero removed; greeting + status line (cameras sending video, clips
  analyzed, latest moment), the live film, "Recently found by Muse" with frames (one per camera
  first), **Look for** topic shortcuts with counts, saved views as real-frame mosaics.
- **Activity:** "Activity" title; Muse observations first (Movement / Both one click away);
  observation rows lead with a frame; anchored window; honest newest-first ordering across the
  whole period (server pages oldest-first).
- **Recordings:** Muse moments carry frames; moments/markers come from the recording's own window.
- Global: 24 px page titles, `--stage` behind video, stronger control borders (3.5:1).
