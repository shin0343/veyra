# Veyra — independent design, UX and anti-slop audit

Reviewer: Claude Opus 5.5 (independent review; no application code changed).
Date: October 27, 2026. Companion documents:
[OPUS_UX_PRIORITIES.md](OPUS_UX_PRIORITIES.md) (implementation order and improvement plans) ·
[OPUS_REFERENCE_COMPARISON.md](OPUS_REFERENCE_COMPARISON.md) (reference lenses).

---

## 1. What was audited and how

**Build verified.** Production build `Xt58zp9KoNy6Yf99tkmGh` served at `http://127.0.0.1:3200`
(Next.js) against the preserved `runtime/demo` stack (API on loopback :54214, PostgreSQL, MediaMTX).
`apps/web/.next/BUILD_ID` = `Xt58zp9KoNy6Yf99tkmGh`; no file under `apps/web/src` is newer than the
build, so the running app reflects current source.

**Method.**
- Playwright (Chromium, `America/Los_Angeles`) drove the real app: 8 routes × 1440 / 1024 / 390 px,
  plus full-page captures at 1440, plus targeted interaction flows.
- Computed-style measurement of text size, contrast and hit areas. axe-core with `wcag2a/aa,
  wcag21aa, wcag22aa` was run on `/explore`, `/`, `/recordings`, `/events` and `/cameras`.
- Source was read wherever a behaviour had to be confirmed without spending money (Muse send
  paths, Explore re-query keys, Activity histogram selection).
- **Zero model requests were made.** A request listener flagged any `POST` to `/agent/messages`,
  `/search`, confirmations or indexing, and counted 0 across every run. No reindexing was started
  and no data was mutated: the review dialog was opened and closed without saving.
- Muse states that need a paid call (proposal, approval, verified receipt, Muse search) were
  reviewed from VIDEO-02's genuine paid captures in `docs/qa/video02/paid/after/`. Those captures
  come from a real run. I did not re-execute it.

**Routes inspected (live):** `/` (Overview), `/explore` (+ `?topic=animals`, `?topic=bicycles`,
cluster selection, table alternative, review dialog), `/cameras` (+ camera settings dialog),
`/live`, `/recordings`, `/recordings/{id}?offset_ms&segment_id` (opened from evidence),
`/events` (Activity), `/layouts`, `/layouts/{id}`, `/settings`, the ⌘K command palette (empty
and typed), and the Muse panel (empty state). `/search` is a 307 redirect to `/explore`
(documented). Saved-view detail and evidence playback were confirmed to play
(`readyState 4`, `currentTime` advancing, native controls).

**Not verified live:** the Muse proposal, approval and receipt; Muse search; refusals and
clarifications; budget-exhausted. All of these need paid calls or staged failures. They are
evaluated from the paid evidence captures and from source.

**Screenshot evidence:** `docs/design/opus-audit/`.

| File pattern | Content |
| --- | --- |
| `{route}-1440.png`, `{route}-1440-full.png`, `{route}-1024.png`, `{route}-390.png` | All 8 routes |
| `flow-explore-typed.png`, `flow-explore-animals*.png`, `flow-explore-bicycles.png` | Explore ask/topic states |
| `flow-explore-cluster-click.png`, `flow-explore-table.png`, `flow-explore-review-dialog.png` | Timeline, table, act |
| `flow-recording-from-evidence*.png` | Evidence → recording playback |
| `flow-palette-empty.png`, `flow-palette-typed.png`, `flow-muse-panel-empty.png` | Command bar and Muse |
| `flow-layout-detail.png`, `flow-camera-menu.png`, `flow-focus-slash.png` | Detail and dialogs |
| `flow-explore-390-animals-full.png` | Phone Explore |

---

## 2. The central question: designed product or AI-generated frontend?

**Verdict: about two-thirds designed product, one-third template residue.**

The *structural* ideas are original and domain-right. They are:
- per-camera lanes with recorded / analyzed / motion / observation layers;
- evidence frames decoded server-side from the exact segment;
- an inspector that pairs the clip with interval, recording offset, Muse's evidence, an
  uncertainty explanation and "not verified fact";
- coverage printed beside every result set;
- an amber proposal card that lists exactly what will be created, with an expiry;
- a usage ledger in Settings (requests, MB uploaded, reserved budget).

No conventional surveillance console and no generic AI dashboard does these things. The token
palette is restrained, and gradients, glows and glass are absent.

The *surface* still reads as generated in specific, fixable places:

1. **Soft-copy layer.** "A little …" appears 10 times in UI strings (`app-shell.tsx:165,261`,
   `muse-panel.tsx:138,246`, every page subtitle). Every page heading has a slogan, not a fact:
   - "A little connection to the places that matter."
   - "Your recordings, with a little more context."
   - "Save an arrangement that feels right for your day."
   - "A few thoughtful preferences. Always in your control."

   This is the strongest single AI-slop signal in the product.
2. **Three always-visible Muse entry points**: the sidebar promo card ("A little help, right
   here. … Meet Muse"), the header ⌘K bar and the header Ask Muse button. Home adds a fourth (the
   big ask field) and a fifth ("Try asking" chips). The sidebar card is the classic
   AI-assistant upsell tile. VIDEO-02's own anti-slop table flagged it and kept it.
3. **Generic assistant empty state.** The Muse panel opens to a 30px "What would make your day a
   little easier?", a sparkle tile, a "You're in control" pill and three prompt cards. This is
   the default chat-assistant welcome pattern.
4. **Uniform 3-column card grids** on Cameras and Saved views with identical anatomy. Saved views
   uses pastel camera-icon placeholders where Home already shows real frame mosaics.
5. **Demo data that looks like test data**: "Review · People (VIDEO-02 QA)", "Video 01 patrol",
   a "Development test sources" tab, two "Camera paused" synthetic cameras, SMPTE colour-bar
   recordings labelled "Trail camera" / "Garden" / "Front entrance", "Source sample_4", and a
   footer link "Explore a preview workspace" on every page.

None of these needs a redesign. They are removals and replacements (see P1-5, P1-6).

---

## 3. First-time-user walkthrough (live, 1440 × 900)

| Step | What happened | Friction |
| --- | --- | --- |
| 1 Open Veyra | Demo banner, "Good afternoon.", status line "6 of 6 cameras sending video · 35 clips analyzed by Muse · Latest moment Oct 27, 8:09 AM", ask field, three "Try asking" chips, a live film. | The value ("find moments in your video") is legible, but the film is a **portrait** squirrel clip in a 16:9 stage, about 60% black. "Recently found by Muse" sits to the right with frames: good. |
| 2 Understand product | Status line plus "Recently found by Muse" explain it within ~5 s. | The greeting and "Your everyday view / A familiar place to check in." add nothing. |
| 3 Find cameras | Sidebar → Cameras: 8 tiles, 6 connected and 2 "Camera paused" dev sources. | "6 of 6" (Home) vs "8 cameras" (Cameras) vs "6 of 8 cameras" (Explore) use unlabelled denominators. |
| 4 Open a meaningful recording | Recordings opens on **Garden wildlife, 8:27 AM, 24 s, 0 of 3 clips searchable, 0 moments**. | The default recording has no Muse analysis, and the main CTA is "Make this recording searchable", a paid indexing action. The library includes 7-hour colour-bar recordings. |
| 5 Search naturally | Explore: ask field, cost line, topic chips with counts. Typing works; `/` focuses the field. | **No video above the fold**: the inspector player starts at y = 794 px, below the 400 px lanes card. |
| 6 Review results | Topic "Animals" → 1 moment, real frame, inspector auto-plays the clip. | Excellent evidence chain once scrolled to. "What Muse saw" lists **"Brown Object", "Brown Object", "Stationary Object"**. |
| 7 Play matching clip | Inspector plays the exact segment. "Open in recording at 00:00" opens `/recordings/{id}?offset_ms=0&segment_id=…`, playing, with an "Exact evidence clip" badge. | The recording page buries "Moments in this recording" at y ≈ 1650, below two charts and an indexing panel. There is no "Back to results"; browser Back is the only path (see P0-3 for its cost in Muse mode). |
| 8 Explore activity timeline | 8 lanes over 12:40–8:30 AM. 47 of 48 moments sit in the last ~1% of the axis (8:09 AM), drawn as 3–4 px clusters with count badges. | Clicking a tick selects a result **off-screen**: the viewport doesn't change and only the tick ring shows feedback. |
| 9 Ask Muse for a VMS action | Not executed (paid). From code and evidence: Saved views "Plan with Muse" sends a canned "Create a 2×2 saved view named 'Everyday' …" **immediately**. | See P0-2. |
| 10 Verify result | From the paid capture: the receipt shows "Saved and verified · Open saved layout". | The **same turn** still says "No layout has been created" and "Proposed change · nothing saved yet" (P0-1). |

---

## 4. Findings

Severity: P0 = misleading AI state, broken core value or cost hazard; P1 = significant friction,
hierarchy or template aesthetics; P2 = polish. Each finding is high-confidence. Its evidence is
either live or code-confirmed, as stated.

### P0-1 — Muse receipt contradicts itself after approval

- **Route/component:** Muse panel. `muse-panel.tsx:917` (proposal card badge) and the turn's
  original Muse message, rendered unchanged after the decision. `DecisionStatus` at `:640`
  updates only the badge.
- **Problem:** after "Approve and save", the turn shows all of the following at once:
  - the badge "Approved · saved and verified";
  - Muse's pre-approval text "…then approve to save. **No layout has been created.**";
  - the proposal card still badged "**Proposed change · nothing saved yet**";
  - "Your decision was sent.";
  - the green "Saved and verified" receipt.

  Evidence: `docs/qa/video02/paid/after/muse-verified.png`.
- **User impact:** the demo's proof moment states success and non-success in the same view. A
  judge or operator can't tell which is true without reading carefully. This defeats DESIGN §11,
  which requires the interface to distinguish *awaiting confirmation* from *completed*.
- **Rationale:** stale state is the most damaging kind of AI-UI ambiguity. The verified receipt
  is Veyra's strongest trust feature, and right now it's undercut.
- **Change:**
  1. Once a decision exists, rewrite the proposal card header to past tense: "You approved this
     · 2:14 PM" or "You declined · nothing changed".
  2. Hide the Approve/Decline row and the expiry.
  3. Collapse Muse's pre-decision message under "What Muse proposed".
  4. Render the receipt as the turn's primary content.
- **Acceptance:** for any turn with `verified_results`, `executed_operations` or a decline, no
  string from the pre-decision state ("nothing saved yet", "No layout has been created",
  "Waiting for your approval", expiry countdown) is visible without expanding a disclosure.
  Covered by a fixture test for the approved, declined and expired variants.
- **Regression risk:** low. The change is presentational and inside one component. The paid flow
  test (`video02-flows.mjs` with `PAID=1`) asserts "Saved and verified", so update its selectors.

### P0-2 — Buttons that look like navigation or help spend a model request and auto-send canned prompts

- **Route/component:** `workspace-provider.tsx:93–98`. `openMuse(query)` calls
  `museSender(query)` immediately. Callers:
  - Home "Try asking" chips: `home-screen.tsx:119`, rendered with an ↗ "open" arrow.
  - Cameras **"Connection help"**: `cameras-screen.tsx:56`. No Muse mark, no cost.
  - Recordings "Find with Muse": `recordings-screen.tsx:133`.
  - Saved views **"Plan with Muse"**: `layouts-screen.tsx:40`. Sends "Create a 2×2 saved view
    named 'Everyday' with Trail camera, Entrance gate, Street approach and Garden wildlife",
    which is a create request with a name and cameras the user never chose.
  - Live "Find a moment": `live-screen.tsx:333`.
  - Settings "Find privacy controls": `settings-screen.tsx:243`.
- **Problem:** each click is one billed `POST /agent/messages` (~15 s), and none states a cost.
  DESIGN §2.5 ("actions that spend a model request say so before they run") and §11 ("context
  actions… never send automatically except when the person clicked an action that says 'Ask
  Muse'") are both violated.
- **User impact:** the daily admission budget is already **$4.75 of $5.00** (Settings, live).
  About five exploratory clicks during a rehearsal can exhaust Muse before the demo. Questions a
  static feature guide could answer for free ("Where can I change a camera's settings?") spend
  money.
- **Change:**
  1. `openMuse(prompt)` **pre-fills** the composer and focuses it. It does not send.
  2. The composer's submit reads "Ask Muse · 1 request".
  3. Navigation-type questions ("Where can I…", "How do I connect…") resolve through the existing
     free feature discovery / local guide. The palette already distinguishes "Go somewhere" from
     Muse.
  4. "Plan with Muse" opens the direct Create-view dialog with a "Let Muse propose it · 1
     request" secondary.
- **Acceptance:** a Playwright run that clicks every button listed above records **0** `POST
  /agent/messages`. A request is sent only after a control whose accessible name contains "Ask
  Muse" is pressed. The composer shows the cost before sending.
- **Regression risk:** low–medium. The ⌘K "Ask Muse: '…'" option *should* still send, because
  its label says Ask Muse. Keep that path and its test.

### P0-3 — Explore in Muse mode re-bills on every refinement, reload and Back

- **Route/component:** `explore-screen.tsx:183–215`. `resultKey` includes `cameraId`,
  `windowStart` and `windowEnd`, and in Muse mode every key change calls `POST /search`, which
  always runs `provider.parse_search` (`retrieval.py:136–168`, no cache). The query lives in the
  URL (`?q=`), so reload, Back from "Open in recording" and a shared link all re-parse. The
  command palette's **"Search your video for '…'"** (`app-shell.tsx:326–328, 415–423`) is
  described as "Find recorded moments Muse has already analyzed", but it routes to `?q=` and is
  billed exactly like "Ask Muse".
- **Evidence:** code-confirmed. Deliberately **not** exercised live, to avoid spend.
- **User impact:** the professional refinement loop costs 1 request and ~15 s per step: ask →
  narrow camera → drag a period → open recording → Back. That is about 4 paid parses for one
  question. The palette offers two options for one query that cost the same but are described
  differently.
- **Rationale:** Muse should parse words once. Refinement should be free and instant, which
  VIDEO-02 already achieves for topic chips.
- **Change:**
  1. *Frontend-only:* keep the first response's `constraints` (returned in `SearchResponse`).
     For camera and window refinements, re-query `POST /index-query` with the mapped
     `categories`, `event_types` and `keywords`. Label the result "Refined from Muse's
     understanding · no new request".
  2. When constraints carry attributes or apparel that `IndexQuery` can't express, show "Refine
     with Muse · 1 request" instead of silently dropping them.
  3. Persist the parsed constraints in session state keyed by query, so Back and reload don't
     re-parse.
  4. Make the palette "Search your video" route to the index with keyword matching, or rename it
     honestly.
  5. *Better, needs Codex contract coordination:* let `/index-query` accept a full
     `StructuredSearch`.
- **Acceptance:** after one Ask, changing camera, dragging the window, opening a recording and
  pressing Back produce **0** additional `/search` requests. Palette descriptions match cost.
- **Regression risk:** medium. Retrieval parity between `/search` and `/index-query` must be
  checked on the 10 evaluation queries in `VIDEO_ANALYTICS_EVALUATION.md`.

### P1-1 — Explore: video is below the fold and the timeline spends ~400 px on empty axis

- **Route:** `/explore` at all widths.
- **Problem:**
  - At 1440 × 900 the title, ask bar, cost line, chips and a 400 px lanes card come first. The
    inspector player starts at **y = 794** and result frames at ~860 (`explore-1440.png`).
  - At 390 px the first result frame is at **y = 2528**. After choosing a topic, the player is at
    1194 and results at 2494 (`flow-explore-390-animals-full.png`).
  - The lanes axis spans 12:40–8:30 AM while analysis covers **5 m 45 s**. Six cameras' moments
    are compressed into the last ~1% of the axis. Two lanes are "Not analyzed" but drawn at full
    height. The result is a large sage field with almost no signal.
- **User impact:** this contradicts DESIGN §2.1 / §18 ("Is a real frame or player the first thing
  the eye lands on?"). The most distinctive surface reads as an empty chart, and the evidence
  needs scrolling.
- **Change:**
  1. Default the lanes card to a **compact strip**: one 28 px row per *analyzed* camera,
     unanalyzed cameras collapsed into a "+2 not analyzed" line, ~150 px total, with an
     "Expand lanes" toggle.
  2. Add a "Fit to moments" axis preset as the default when observations cover less than 10% of
     the window, with "Full period" one click away.
  3. Move results + inspector directly under the filter row.
  4. At ≤860 px, show results first and put lanes behind a "Timeline" toggle.
- **Acceptance:** at 1440 × 900 the inspector player and the first row of result frames are fully
  above the fold. At 390 the first result frame is above y = 900 after a topic is chosen. When
  moments exist, ticks are ≥ 24 px apart unless genuinely simultaneous.
- **Reference:** Runway DESIGN.md, "Let visual content dominate — the UI should be invisible"
  (awesome-design-md).
- **Regression risk:** medium. Drag-to-focus and cluster logic in `camera-lanes.tsx` must keep
  working on the new axis. Update `video02-flows.mjs` geometry assumptions.

### P1-2 — Timeline selection gives no visible feedback and targets are 3–4 px wide

- **Route:** `/explore` lanes.
- **Problem:** tick buttons measure **3–4 × 29 px** (measured). They pass axe because of the
  spacing exception, but they're hard to hit. Clicking one selects a result and updates the
  inspector **below the fold**, and the viewport doesn't move (`flow-explore-cluster-click.png`).
- **Change:**
  1. Give each tick an invisible ≥ 24 × 24 hit area.
  2. On tick activation, either scroll the inspector into view (honouring reduced motion) or open
     an anchored popover with the evidence frame, camera, time and "Play".
  3. Cluster badges open a list popover rather than stepping blindly.
- **Acceptance:** clicking any tick produces a visible change inside the current viewport within
  200 ms. Keyboard ←/→ still steps through ticks.
- **Regression risk:** low.

### P1-3 — Result cards and inspector over-signal uncertainty and expose raw model labels

- **Route:** `/explore` cards and inspector, `/recordings` moments.
- **Problem:**
  - Most cards carry an amber "medium uncertainty" chip, and some "high uncertainty". Amber is
    defined as "look before continuing" (DESIGN §3), so a near-universal amber chip becomes
    noise.
  - The inspector's "What Muse saw" leads with the model's class labels **"Brown Object",
    "Brown Object", "Stationary Object"**, which reads as raw machine output.
  - Every card repeats "Oct 27", which the frame label and filter sentence already give.
- **Change:**
  1. Neutral certainty wording ("Muse is fairly sure" / "Muse is unsure"). Use amber only for
     high uncertainty.
  2. In "What Muse saw", make the evidence sentence primary and the category a quiet meta tag.
     Number repeated objects ("Object 1 · 2").
  3. Drop the per-card date when every result shares it.
- **Acceptance:** fewer than 25% of cards in the default "All moments" set show amber. No
  title-cased generic labels appear as primary text in the inspector.
- **Regression risk:** low. The uncertainty value still renders, so the honesty rule is preserved.

### P1-4 — Recordings opens on an unanalyzed clip and buries the Muse moments

- **Route:** `/recordings`, `/recordings/{id}`.
- **Problem:**
  - The default selection is the newest recording, a 24 s Garden clip with **0 moments**. Its
    most prominent action is the paid "Make this recording searchable".
  - "Moments in this recording", the bridge from AI to footage, sits at y ≈ 1650 under the
    availability scrubber, a 3- to 14-bin activity chart and the indexing panel
    (`recordings-1440-full.png`, `flow-recording-from-evidence-full.png`).
  - Availability (00:00–02:13) and activity (8:09–8:11 AM wall clock) are two stacked time
    visualisations with different labelling.
  - Library rows don't show which recordings have moments. Three 7-hour colour-bar recordings
    carry real camera names.
- **Change:**
  1. Default to the most recent recording **with analyzed moments**.
  2. Put moments directly under the transport controls, or as a tab beside the library.
  3. Merge availability and activity into one strip with moment markers, sharing one axis and one
     playhead.
  4. Add a "3 moments" meta badge on library rows.
  5. Filter development test sources out of the default library list.
- **Acceptance:** `/recordings` loads a recording with ≥ 1 moment, and its first moment is above
  the fold at 1440 × 900. A single time axis is visible under the player.
- **Regression risk:** medium (recording-screen layout). Player and seek logic are unchanged.

### P1-5 — Demo data hygiene: QA artifacts and test sources look like product content

- **Routes:** `/`, `/layouts`, `/cameras`, `/recordings`, camera dialog, global footer.
- **Problem:**
  - Saved views "Review · People (VIDEO-02 QA)" and "Video 01 patrol" appear on Home and Saved
    views.
  - The Cameras filter has a "Development test sources" tab, and the grid shows two
    "Camera paused" cards.
  - Colour-bar recordings appear under real camera names.
  - The camera dialog shows "Source sample_4", a raw identifier.
  - Every page footer has "Explore a preview workspace ↗" (`app-shell.tsx:266`).
  - "1 cameras · 1 columns" appears on Home, Saved views and the Muse proposal ("Save 1 columns,
    1 cameras").
- **User impact:** a judge reads these as unfinished. They erode the strong honesty work around
  them.
- **Change:**
  - Data, operator action through the app: rename or delete the two QA views.
  - UI changes:
    1. Hide paused dev sources from default grids behind "Show test sources (2)".
    2. Show the source *label*, not its ID.
    3. Remove the preview footer link when not in preview.
    4. Pluralize with `Intl.PluralRules`.
- **Acceptance:** no "QA", "VIDEO-0x", "sample_", "test pattern" or colour-bar thumbnail visible
  on the default demo path. No "1 cameras" or "1 columns" anywhere.
- **Regression risk:** low. Keep the paused cameras reachable, because they demonstrate honest
  offline states.

### P1-6 — Template copy and redundant Muse chrome

- **Routes:** global shell, every page header, Muse panel.
- **Problem:**
  - Slogan subtitles on every page, and 10 "a little" strings (see §2).
  - The footer tagline "A little clarity for your everyday."
  - Two workspace identity blocks ("Personal workspace / Your everyday spaces" at the top,
    "Your workspace / Local environment" at the bottom).
  - The sidebar Muse promo card.
  - The Muse empty state at 30px, which the DESIGN type scale reserves for the Overview greeting.
- **Change:**
  1. Replace subtitles with **live facts**:
     - Cameras: "8 cameras · 6 connected · 2 paused".
     - Recordings: "10 recordings · newest Oct 27, 8:27 AM · times in America/Los_Angeles".
     - Saved views: "7 views".
     - Live: "4 of 8 cameras · ~3 s delay · muted".
     - Settings: no subtitle.
  2. Delete the sidebar Muse card and the footer slogan.
  3. Keep one workspace block.
  4. Muse empty state:
     - a 16px section title ("Ask about your cameras, recordings and views");
     - three prompts that **use real current data** ("Bicycles at Bicycle parking this morning");
     - the cost line.
- **Acceptance:** no page subtitle without a number or a noun from live data. "a little" appears
  0 times. One persistent Muse entry in the header (⌘K + Ask Muse may share one control).
- **Reference:** Intercom DESIGN.md: one reserved AI accent, "no spotlight cards". Sentry
  DESIGN.md: "the product reads like a log".
- **Regression risk:** very low.

### P1-7 — Saved views uses placeholder tiles while Home shows real frames

- **Route:** `/layouts`.
- **Problem:** each card is a grid of pastel tiles with a camera icon and name, including an
  off-token tan fill. Home renders the *same objects* as real-frame mosaics (`home-1440-full.png`
  vs `layouts-1440-full.png`). The card title isn't the link target, so clicking "Morning
  check-in" text did not navigate. Only the ↗ icon or preview does.
- **Change:** reuse Home's frame-mosaic component (latest preview frame per camera, honest stage
  when none). Make the whole card one link. Drop the dashed "Create another view" tile, because
  the header already has "Create a view".
- **Acceptance:** every saved view card shows real frames or an honest "no preview" stage. Click
  anywhere on a card opens it.
- **Regression risk:** low.

### P1-8 — Activity: the "All cameras" chart silently shows one camera, and empty bins are focusable

- **Route:** `/events`.
- **Problem:**
  - With "All cameras" selected, the histogram charts only the camera with the most recent
    activity ("Latest recorded period · Bicycle parking · most recent activity",
    `events-screen.tsx:99–159`), while the list below covers all cameras.
  - 47 ten-minute bins span the period, almost all "no recorded video", and **each bin is a
    button**: 47 tab stops of empty data.
  - Every row repeats an "Observation" chip in the Observations tab, plus "Indexed with
    muse-spark-1.3".
- **Change:**
  1. Reuse the Explore compact lane strip for "All cameras" (one row per camera).
  2. Make the chart a single focusable region with a table alternative; empty bins are not
     buttons.
  3. State provenance once in the section header.
- **Acceptance:** the chart and the list describe the same camera scope. Tab from the filter to the
  first row takes ≤ 3 stops.
- **Regression risk:** low.

### P2-1 — Type floor, inverse title scaling and rail breakpoint

- Computed **10px** text exists on 30 elements on `/cameras` (including the per-card "Open view"
  link, 69 × 16 px), 67 on `/events` and 23 on `/recordings`. DESIGN §4's floor is 11px.
- Page titles are 24px at 1440 but **27px at 390**: they scale up on the smaller screen.
- The labelled sidebar persists at 1024, while DESIGN §5 specifies the icon rail for 541–1190 px.
- **Change:** raise to the 11/12px roles, cap titles at 24px, and either apply the rail or amend
  DESIGN.md.
- **Acceptance:** no computed font-size < 11px in `main`, and h1 ≤ 24px at all widths.
- **Risk:** low.

### P2-2 — Inconsistent counts and microcopy

- "6 of 6 cameras sending video" (Home), "6 of 8 cameras" (Explore, which actually means
  *analysis allowed*) and "8 cameras" (Cameras).
- "48 moments · newest 48".
- **Change:** name the denominator ("6 connected · 8 total", "6 of 8 cameras allow analysis"),
  and replace the moments line with "Showing 12 of 48".
- **Risk:** none.

### P2-3 — The Review-view dialog previews empty black tiles and silently picks cameras

- **Route:** Explore → "Review these cameras together" (`flow-explore-review-dialog.png`).
- **Problem:** four empty `--stage` tiles stand in for previews even though frames exist.
  "Only the first four connected cameras are included" is chosen by result order, so in "All
  moments" Trail camera (most results) is excluded. The button label doesn't say it *saves a
  view*.
- **Change:** use real frames, pick the cameras with the most results, let the user toggle
  cameras, and label the button "Save as a view".
- **Risk:** low.

### P2-4 — Triple demo disclosure, overlaid on footage

- The global banner, a stage overlay ("Demo recording · Prerecorded footage") on every frame,
  live tile and inspector, and the same text again under the stage.
- The overlay covers the top-left of the footage (`live-1440-full.png`, `explore-1440-full.png`).
- **Change:** keep the banner and one quiet label *below* the stage. Leave the footage clean.
  Stage labels stay factual (DESIGN §9 allows two; use one).
- **Risk:** none. Honesty is preserved by the banner.

---

## 5. Strengths to preserve (do not redesign)

- **Evidence chain**:
  - real frames decoded from the exact segment (`/recordings/{id}/frame`);
  - inspector playback of that segment;
  - "Open in recording at m:ss" → the recording page with an "Exact evidence clip" badge.

  This is the product's core credibility and it works.
- **Coverage honesty**: "35 of 7,724 recorded clips analyzed", "5m 45s of 21h 26m recorded here
  was analyzed", and "absence is not proof" copy.
- **Inspector content model**: interval and recording offset, Muse's evidence text, "How sure is
  this?" with an explanation, "A model description, not verified fact… does not identify
  people", Source and processing, and Around this moment.
- **Proposal → approval → verified receipt** architecture (amber card, explicit plan, expiry,
  re-read-from-database receipt), once P0-1's stale text is fixed.
- **Command palette**: "Muse acts only after you choose", separate Go-somewhere vs Muse rows,
  keyboard hints, and good focus handling.
- **Free topic chips with real counts** beside a clearly costed ask field.
- **Licensing and attribution** line under each recording (source, licence, excerpt, encode
  facts).
- **Settings usage ledger** (requests today, MB uploaded, reserved budget, "not Meta's bill").
- **Tokens**: sage paper → white → stage ladder, a single teal accent, no gradients/glass/glow,
  and Manrope with tabular numerals.
- **Accessibility baseline**: axe WCAG 2.2 AA reports 0 violations on 5 routes (measured), skip
  link, `/` shortcut, arrow-key result navigation, visible focus, and no horizontal overflow at
  1440/1024/390 on any route.

## 6. Areas that need no further work

The colour token set and contrast; the dialog and command-palette components; the
error/no-match/budget state set (VIDEO-02 staged these); the recording attribution line; the
Settings usage block; responsive overflow; and player state handling (offline, busy retry).

## 7. Risks of excessive redesign

- **Deadline:** November 4, 2026, 21:00 America/New_York. That's 8 days. The P0s and P1-5/6 are
  small, contained edits. A new shell, dark mode or new chart types would be churn.
- **Budget:** about $0.25 of reserved Muse admission remains for this UTC day. Any redesign that
  needs paid re-verification of Muse flows competes with rehearsal.
- **Test coupling:** `tests/video02-flows.mjs` (23 checks) and `verify-ui.mjs` (29 axe scans)
  assert current geometry and copy. Change layout in Explore deliberately and update the tests in
  the same change.
- **Don't replace the lanes model.** Compress and zoom it (P1-1). It is the most domain-specific
  idea in the product.
- **Don't add spectacle.** The Awwwards and recent.design lenses reward motion and 3D. None of
  that belongs in an evidence tool (DESIGN §13 is right).

## 8. Final judgment (1–5, evidence-based)

| Dimension | Score | Why |
| --- | :-: | --- |
| Visual originality | **3** | The lanes + evidence grid + inspector composition and the stage/paper ladder are original. The shell, uniform card grids, slogan subtitles, sidebar AI card and generic Muse welcome are template residue. |
| Professional product quality | **3** | Components are well-crafted, but QA-named data, colour-bar recordings, "1 cameras" plurals and a near-empty default timeline undercut finish. |
| Human-centered approachability | **4** | Calm, plain nouns, honest states, nothing militarised. The copy tips into saccharine. |
| AI Video Intelligence usability | **3** | Once reached, the evidence chain is excellent. Video sits below the fold, the timeline carries little signal at default zoom, and Muse refinement re-bills. |
| Muse integration | **2** | The proposal/approval/receipt architecture is right, but there are five unlabelled auto-sending buttons, a self-contradictory receipt, three parallel entry points and a generic welcome. |
| Technical-product credibility | **4** | Provenance, coverage, licensing, budget ledger and exact-segment playback. It loses a point for colour bars under camera names and test sources in default views. |
| Accessibility and clarity | **4** | Measured 0 axe violations, keyboard paths and focus. Against that: 10px text, 3–4 px timeline targets and 47 empty-bin tab stops. |
| Hackathon demo readiness | **3** | The full journey works live. P0-1/P0-2/P0-3 can each derail a live demo (contradictory receipt on screen, budget burn from a "help" click, a 15 s re-parse on Back). |

**Three highest-impact improvements before submission:**
1. **Muse integrity pass (P0-1, P0-2, P0-3):** prefill instead of auto-send, cost on every send,
   a past-tense receipt with no stale proposal text, and refine-without-re-parse. Small code,
   largest trust and budget gain.
2. **Explore composition (P1-1, P1-2):** player and first result row above the fold, a compact
   lane strip fitted to analyzed moments, and visible feedback on tick selection.
3. **Hygiene and copy pass (P1-5, P1-6, P1-7):** remove QA/test artifacts from default views,
   replace slogans with live facts, delete the sidebar Muse card, and use real frames on Saved
   views. Less than a day of work, and the largest perceived-quality gain.
