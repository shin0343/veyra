# Veyra — UX priorities and improvement plans (for Codex)

Source findings and evidence: [OPUS_DESIGN_AUDIT.md](OPUS_DESIGN_AUDIT.md). Screenshots:
`docs/design/opus-audit/`. Visual contract: [DESIGN.md](../../DESIGN.md), which stays
authoritative. Nothing here changes tokens.

## 1. Implementation order (impact ÷ cost)

| # | ID | Change | Impact | Cost | Owner/area |
| :-: | --- | --- | :-: | :-: | --- |
| 1 | P0-2 | `openMuse(prompt)` pre-fills only; the send button reads "Ask Muse · 1 request"; "Connection help" / "Where can I…" go to the free feature guide; "Plan with Muse" opens the direct Create-view dialog | High | S | `workspace-provider.tsx`, `muse-panel.tsx`, 6 callers |
| 2 | P0-1 | After a decision, the proposal card becomes a past-tense summary; the pre-decision Muse text collapses; the receipt is primary | High | S | `muse-panel.tsx` |
| 3 | P1-5 | Demo hygiene: rename/delete QA views (operator, via the app); hide dev test sources by default; source label not ID; drop the preview footer link outside preview; pluralize | High | S | data + `cameras-screen`, `recordings-screen`, `app-shell` |
| 4 | P1-6 | Slogans → live facts; remove the sidebar Muse card, footer slogan and duplicate workspace block; Muse empty state with real-data prompts | High | S | `app-shell`, page headings, `muse-panel` |
| 5 | P0-3 | Muse mode: reuse the parsed `constraints` for camera/window refinements via `/index-query`; persist per query for Back/reload; make the palette "Search your video" truthful | High | M | `explore-screen.tsx`, `app-shell.tsx`; optional Codex contract addition |
| 6 | P1-1 | Explore: compact lane strip (fit to moments by default), results + inspector immediately under the filters, results first on phones | High | M | `explore-screen`, `camera-lanes`, `explore.css` |
| 7 | P1-2 | Tick hit areas ≥ 24 px; tick activation brings the inspector or a popover into view | Med | S | `camera-lanes.tsx` |
| 8 | P1-4 | Recordings: default to a recording with moments; moments directly under the player; one merged time strip; moment counts in the library | Med | M | `recordings-screen`, `activity-histogram` |
| 9 | P1-7 | Saved views: real-frame mosaics (reuse Home's); whole card is the link | Med | S | `layouts-screen` |
| 10 | P1-3 | Certainty wording neutral, amber only for "high"; evidence sentence primary in "What Muse saw"; drop the repeated per-card date | Med | S | `explore-screen`, `evidence-frame` |
| 11 | P1-8 | Activity: chart matches the list's camera scope (lane strip); one focusable chart + table; provenance once | Med | S | `events-screen` |
| 12 | P2-1…4 | 11px floor, h1 ≤ 24px, rail or amend DESIGN; named denominators; Review dialog frames and camera choice; one demo label below the stage | Low | S | various |

Do 1–4 first: they are one small batch, cover every P0 except the medium-cost P0-3, and need no
paid verification except one final Muse proposal run. Then 5–7 as the Explore batch, then 8–11.
Re-run `tests/video02-flows.mjs`, `verify-ui.mjs` and one `PAID=1` run at the end only.

### Acceptance criteria summary (copy into the implementation PR)

- [ ] Clicking every Muse-flavoured button except one labelled "Ask Muse" → 0 `POST /agent/messages`.
- [ ] Composer and ask field show "1 request" before sending.
- [ ] A verified, declined or expired turn shows no pre-decision strings without expanding.
- [ ] After one Muse search: camera change, window drag, Open in recording → Back produce 0 `/search` calls.
- [ ] At 1440 × 900 on `/explore`: the inspector player and first result row are fully above the fold.
- [ ] At 390 on `/explore?topic=animals`: the first result frame top is < 900 px.
- [ ] Clicking any lane tick changes something visible in the current viewport.
- [ ] No "QA", "VIDEO-0x", "sample_", colour-bar thumbnails or "1 cameras" on the default demo path.
- [ ] "a little" appears 0 times; every page subtitle contains live data or is removed.
- [ ] `/recordings` default has ≥ 1 moment, with the first moment above the fold.
- [ ] No computed text < 11px in `main`; h1 ≤ 24px at every width.
- [ ] axe WCAG 2.2 AA: still 0 violations; no horizontal overflow at 1440/1280/1024/768/390.

---

## 2. Improvement plans

### A. Home (Overview)

**Intended benefit:** in five seconds, a newcomer sees *what Veyra found* in their video and how
to ask for more, without a greeting or slogans.

```text
Overview                                  6 connected · 8 cameras · 35 clips analyzed · latest 8:09 AM
[✦ Find a moment — "bicycles at the gate"                         Ask Muse · 1 request ]
  Look for:  People 83 · Bicycles 80 · Vehicles 60 · Animals 1 · Walking 6 · Carrying 4   (free)

Latest moments found by Muse                                          Open Explore →
┌frame┐ ┌frame┐ ┌frame┐ ┌frame┐        ← one per camera, 16:9, interval label, click = Explore
cam·time cam·time cam·time cam·time      with that moment selected and playing
2-line summary …

Live now (4 of 8)                         Open Live view →     Saved views          All →
┌──────┬──────┐                                                ┌mosaic┐ Garden review
│ live │ live │  small 2×2, landscape sources first            ┌mosaic┐ Morning check-in
├──────┼──────┤                                                [+ Create a view]
│ live │ live │
└──────┴──────┘
```

- **Hierarchy:**
  1. The status line (facts).
  2. The ask field and free topics.
  3. **Moments row**: the value proposition, as frames.
  4. Live 2×2.
  5. Saved views.
- **Primary interaction:** clicking a moment opens Explore with that moment selected and playing.
- **Important states:** nothing analyzed ("No clips analyzed yet · Open a recording to make it
  searchable"); cameras offline (honest stage); Muse budget reached (ask field says so, topics
  remain).
- **Remove:**
  - "Good afternoon.";
  - "Your everyday view / A familiar place to check in.";
  - the "Try asking" chips (they auto-send; the moments row teaches better);
  - the "Your space. Your say." card (keep one privacy link in the status line);
  - the footer slogan;
  - the duplicated stage label.
- **Keep:** the demo banner, the status-line facts, topic shortcuts with counts, and saved-view
  frame mosaics.
- **Avoid:** a single portrait source as the hero film. If one live film is kept, prefer a
  landscape camera.

### B. Video Intelligence (Explore)

**Intended benefit:** search, see and verify in one viewport. A beginner types a sentence; a
professional narrows camera and time instantly and for free.

```text
Explore · 35 of 7,724 clips analyzed · times in America/Los_Angeles
[✦ Describe a moment                                   /   Ask Muse · 1 request ]
[All][People 83][Bicycles 80][Vehicles 60][Animals 1][Walking 6][Carrying 4]   [All cameras ▾]
┌ compact lanes (fit to moments 8:08–8:11 AM) ── Full period · Expand lanes ──────────────┐
│ Trail camera     ▍▍▌▍▍ …                    │  6 analyzed cameras, 28 px rows            │
│ Bicycle parking        ▍ ▍ ▍                │  +2 not analyzed                            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
48 moments · All · 8:08–8:11 AM · 5m 45s of 21h analyzed            [Save as a view]
┌frame┐┌frame┐┌frame┐                 ┌ Inspector (sticky) ──────────────────┐
│     ││     ││     │                 │ ▶ exact evidence clip (16:9)         │
cam·time  2-line summary               │ camera · 8:09:18–8:09:28 · 0:00 in rec│
Muse is fairly sure                    │ Open in recording · Watch live        │
                                       │ What Muse saw (evidence first)        │
                                       │ How sure · Source · Around this moment│
                                       └───────────────────────────────────────┘
```

- **Hierarchy:**
  1. Ask and filters (one band, ~150 px).
  2. Compact lanes (≤ 160 px).
  3. Results + inspector, above the fold at 1440 × 900.
- **Primary interaction:** select a moment (card, tick or arrow key) → the inspector plays it in
  view. "Open in recording" is the one filled button.
- **Muse mode:** after one Ask, the "Muse understood" chips become the refinement state. Removing
  a chip or changing camera or window re-queries the index for free ("Refined from Muse's
  understanding · no new request"). Only editing the sentence costs a request.
- **Important states:** loading (lane and frame skeletons); Muse parsing (field editable, "Muse is
  reading your words…"); no match (what was searched, coverage, "not proof"); nothing analyzed;
  budget reached (the topic filter is offered, never substituted); frame or video unavailable
  (honest stage).
- **Phone (≤ 860 px):** results first, then the inspector as a sheet on selection, with lanes
  behind a "Timeline" toggle.
- **Remove:** the full-height default lanes for unanalyzed cameras, "newest 48", the per-card
  date, amber on medium certainty, and the stage overlay label.
- **Keep:** the cost line, free topic chips with counts, coverage sentence, inspector content
  model, cluster badges, drag-to-focus, table alternative, `/` and arrow keys, and URL state.

### C. Muse

**Intended benefit:** Muse removes steps inside real workflows. It never spends money or acts
without an explicit "Ask Muse", and its outcome is unambiguous.

```text
Header:  [⌘K  Search or ask Muse]      ← single persistent entry (palette has "Ask Muse" row)

Muse panel (empty):
  Ask about your cameras, recordings and views          1 request per question
  Try:  "Bicycles at Bicycle parking this morning"      ← built from live data, pre-fill only
        "Save Garden wildlife and Street approach as a view"
  [Ask in your own words…                           Ask Muse · 1 request]

Turn lifecycle (one card that changes state, never two contradicting ones):
  Suggestion  →  Awaiting your approval (amber)  →  Saving…  →  Saved and verified (receipt, Open)
                                                 ↘  Declined · nothing changed (neutral)
                                                 ↘  Expired · nothing changed (neutral)
                                                 ↘  Failed · <reason> · ref (error, Retry)
  Unsupported: "Muse can't do that in Veyra" + the closest real control
  Needs info:  one question + chips of real names (cameras, views)
```

- **Hierarchy:** the turn's *current* state is its headline. History collapses ("What Muse
  proposed", "What Muse did · 2 steps").
- **Primary interaction:** context actions (inspector "Save these cameras as a view", Recording
  "Find moments like this") **pre-fill** Muse with real names. The person presses Ask Muse.
- **Important states:** as in the lifecycle above. Each one has a distinct badge text, plus a
  colour that is never the only cue.
- **Remove:**
  - the sidebar Muse promo card;
  - auto-send from `openMuse`;
  - the 30px welcome heading, sparkle tile and "You're in control" pill;
  - the stale proposal text after a decision;
  - the duplicate "Ask Muse about this" footer in the palette (its first row already does this).
- **Keep:** the amber proposal card with exact items and expiry, the server-bound approval, the
  "re-read from the database" receipt, "Actions come from Veyra's own receipts, not from Muse's
  wording", and the conversation thread surviving panel close.

---

## 3. Explicitly out of scope before submission

New navigation/IA, dark theme, new visualisation types, multi-select filters, saved searches,
export, and alerts. VIDEO-02 lists these as limitations, and they are fine to leave as such.
