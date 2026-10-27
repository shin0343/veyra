# REDESIGN-01 — Direction: an editorial video workspace

October 27, 2026 · frontend owner (Claude Opus 5.5) · branch `redesign-01`.
Before/after evidence: [REDESIGN_01_BEFORE_AFTER.md](REDESIGN_01_BEFORE_AFTER.md). Contract:
[DESIGN.md](../../DESIGN.md) (updated for this phase).

## 1. Why incremental styling had failed

The VIDEO-02 build was well-intentioned but its *architecture* produced a dashboard:

| Assumption in the old code | What it forced |
| --- | --- |
| Every screen is a scrolling document inside `.page-content` (max-width, 34px padding, footer) | Explore stacked title → ask → chips → 400px lanes card → results → inspector. The player sat at **y = 794** on a 900px screen. |
| Every region is a white card with a 14px radius (`StatePanel`, `SectionTitle`, `.result-card`) | Results, lanes and inspector all read as interchangeable widgets of equal weight. |
| The inspector owns the player | The video lived in a 440px side column. It was never the centre of anything. |
| The timeline is a chart on the page | It wasn't connected to playback: no playhead, no selected-interval band. Clicks changed things off-screen. |
| Home = greeting + status + chips + "everyday view" + list + privacy card + saved views | Slogans and equal-weight sections. The hero film was a **portrait** squirrel clip in a 16:9 frame, about 60% black. |
| `openMuse(query)` sends immediately | Every "help" button was a hidden paid request (audit P0-2). |
| Muse mode re-runs `/search` whenever any key changes | Camera, period, Back and reload each cost a request (P0-3). |

## 2. References: what each one actually contributed

| Source | Accessed | Used for | Decision it drove |
| --- | --- | --- | --- |
| [Sequence editor interface](https://sequence.film/docs/get-started/editor-interface) | Fetched | Panel model: Browser (left), Preview (centre), Inspector (right), Timeline (bottom); the inspector follows the selection; scrubbing the timeline changes the preview | Explore's three regions. The **inspector follows the selected moment**, and the **timeline hangs directly under the player** with a playhead. |
| [Corte editor overview](https://help.corte.so/editor/editor-overview/) | Fetched | Media panel ↔ preview ↔ inspector ↔ timeline; layout presets; the agent panel as one panel, not the interface | Muse stays a side panel and contextual actions, not a chat-first layout. At narrower widths, panels **switch** (Moments / Details / Timeline) instead of stacking. |
| [awesome-design-md](https://github.com/voltagent/awesome-design-md) (README + `linear.app/DESIGN.md`; Runway/Sentry/Intercom read in earlier phases) | Fetched | Linear: surface ladder over shadows, one chromatic accent, hairline borders, 8px controls, a dense product canvas. Runway: "let visual content dominate". | Paper → panel → white → stage surface ladder. Radius 6/10/14. Teal stays the *only* accent. Sections separate by hairlines, not cards. |
| [Awwwards](https://www.awwwards.com/) | Home page fetched (SOTD Oct 27 "Awards Racing"; A24 and Forge Automotive among recent SOTDs) | Typography-led composition. "Typography is currently playing a central role" (Awwwards blog). | A serif voice (Newsreader) for footage descriptions and titles. Distinctiveness comes from type and composition, not effects. |
| [A1 Gallery](https://a1.gallery/) | Home page fetched (filters, latest feed) | The rhythm of large image-led entries beside a quiet, dense index | Home's journal: frame + camera + serif sentence, grouped under a timestamp. The spaces wall is image-led; filters stay quiet. |
| [Recent.design](https://recent.design/) | Home page fetched | Contemporary interaction detail; the only editor-like item was a "scene editor" | Precise state feedback: the selected band and playhead, the list auto-scrolling to the timeline selection, cost on the button itself. Decorative motion rejected. |
| [Mobbin](https://mobbin.com/) | Home page fetched | **Not inspected.** The library needs an account; no app flow or screen was viewed. | No Mobbin-derived claims. Search/filter/list-detail decisions rest on the editor references and the live audit. |

Nothing was copied: no layout, asset, brand colour or screen from any source.

## 3. Concepts considered

### Explore (the most important screen)

**A. Three-pane editor (selected)**
```
┌ ✦ Describe a moment ……………… /  [Ask Muse · 1 request]   35 of 7,724 clips analyzed ┐
├ Browser 316 ──────┬ Stage (dark, flexes) ─────────────────┬ Inspector 356 ────────┤
│ All People 83 …   │                                       │ MUSE OBSERVATION      │
│ [All cameras ▾]   │            ▶ evidence clip            │ Serif summary (22px)  │
│ 48 moments · cov  │                                       │ evidence paragraph    │
│ ▣ cam  8:09:18 AM ├ transport: cam · 8:09:18–28 · ‹ 3/48 › [Open in recording]   │
│   serif summary   ├ Timeline · lanes · playhead · band ──┤ What Muse saw · Around│
│ ▣ …               │ Trail ▍▍▍▍   Garden    ▍  ↑playhead   │ How sure · Source     │
└───────────────────┴───────────────────────────────────────┴───────────────────────┘
```
**B. Filmstrip.** The player and inspector sit on top, and results run as a horizontal filmstrip under the player with the timeline below it. *Rejected:* a filmstrip shows about 5 results without scrolling, hides summaries, and puts three horizontal bands between the player and its timeline.

**C. List/detail with a timeline drawer.** Results on the left, and a detail column with the player and inspector stacked. The timeline opens as a drawer. *Rejected:* it repeats the old problem: a player in a narrow column and a timeline separate from playback.

A wins because it is the only concept where search, results, player, timeline and evidence are all visible at once at 1440×900. Each region does one job, and the relationships are spatial: select left → plays centre → explains right → locates below.

### Home

**A. Front page.** One large live film, a dated headline, and a "today" journal column. *Close, but* it still makes one camera the whole story and offers no way to *look around* your spaces.

**B. Spaces wall + journal (selected).** A live stage (landscape source preferred) with a wall of real camera tiles beneath it. Choosing a tile puts that space on the stage. A journal of Muse's latest moments sits on the right. One find field sits above, and a saved-views strip below.

**C. Day timeline first.** All cameras as lanes across the day, with frames popping above. *Rejected:* this duplicates Explore and is intimidating as a first screen for non-experts.

B is the most *useful immediately*. You see what's happening (live), what exists (every camera, honestly paused or connected), what Muse found (journal), and one short path into investigation (journal entry → Explore with that moment selected and playing).

## 4. The visual system (what changed and why)

| Layer | Before | After | Rationale |
| --- | --- | --- | --- |
| Paper | `#F7F9F6` cool sage | `#F5F3EE` warm paper; `--panel #FAF9F6` | Warmth without colour; panes read as regions by surface step, not cards. |
| Ink / secondary | `#253B36` / `#5D6D64` | `#1D2724` / `#5B625C` | Deeper ink for the serif. Secondary text is 5.66:1 on paper. |
| Accent | `#207A70` | `#1C6B62` | 5.69:1 on paper, 5.35:1 on the selection wash; still the only accent. |
| Stage | `#101513` | `#121513` + `--stage-raised #1B201D` (transport) | The dark block is the protagonist; the transport belongs to it. |
| Type | Manrope only | Manrope (interface) + **Newsreader** (Muse's descriptions, screen titles) + system mono (timecodes, counts) | *Serif speaks for the footage; sans runs the tool.* A reader can tell model narrative from interface at a glance. The mono gives editors' timecodes. |
| Radius | 8 / 10 / 14 / 20 | 6 / 6 / 10 / 14 | Less "card", more instrument. |
| Shell | 224px sidebar, 76px top bar, a 44px demo band, sidebar Muse promo, footer slogan | 216px sidebar (60px rail in Explore and ≤980px), 56px top bar, inline "Demo footage" flag, no promo card, no footer | Returned ~170px of vertical space to video; removed three of five Muse entry points and every slogan. |

Explicitly not used: gradients, glows, glass, shadows on in-flow content, pill-everything, KPI tiles, illustrations standing in for footage.

## 5. Muse: interaction rules implemented

| Defect (audit) | Now |
| --- | --- |
| P0-2: `openMuse(prompt)` auto-sent from six buttons | `openMuse(prompt)` **fills the composer only**. Sending needs `{ send: true }`, used only by the ⌘K row labelled "Ask Muse: …, 1 request". The composer button reads **"Ask Muse · 1 request"**. Starter prompts fill and focus the box ("Fills the box · sends nothing"). |
| Local navigation through Muse | The composer, the Home find field and ⌘K show **"Go to … · No request"** matches from the local feature guide as you type. On Home, a page word plus Enter navigates without Muse. |
| P0-1: the receipt contradicted "nothing saved yet" | Once a decision exists, the turn leads with the outcome badge and the receipt. Muse's original text and the proposal collapse under **"What Muse proposed"**, and the proposal badge is past tense ("You approved this · saved" / "You declined · nothing changed" / "You approved this · it failed"). An unanswered proposal past its expiry shows **"Expired · nothing changed"**. A failed decision no longer reads as "Declined". |
| P0-3: refinements re-bill | Muse's reading (`SearchResponse` minus items) is kept per query in state and `sessionStorage`. Camera, period, Retry, reload and Back then query **`/index-query`** with the mapped categories, event types, keywords and motion flag, labelled *"Reusing Muse's reading · filtered in the stored index · no new request"*. If the reading had colour or clothing attributes the index can't express, the UI says so and offers **"Ask Muse again · 1 request"**. A `?q=` URL without a cached reading only pre-fills the field ("ready to ask · 1 request"). Only `run=1`, set by the explicitly labelled ⌘K/Home actions, runs it. |
| Palette honesty | "Find '…' in your video" and "Ask Muse: '…'" both read "Ask Muse · 1 request". Places read "No request". |
| Contextual Muse | Inspector → "Find moments like this" *writes* a question into the ask field. Review dialog → "Write it for Muse instead" pre-fills the panel. Neither sends. |

States remain distinct with text plus colour: Awaiting your approval (amber) → Saving… →
Saved and verified / Saved · not verified / Declined · nothing changed / Expired · nothing changed / Failed · nothing confirmed.

## 6. For Codex (backend; nothing was changed there)

1. **`/index-query` cannot express object attributes or apparel.** The free refinement drops them and says so. Accepting `objects: ObjectConstraint[]` (or a full `StructuredSearch`) in `IndexQuery` would make refinement exact. The retrieval function already takes `StructuredSearch`.
2. **No server-side reuse of a parse.** A `parse_id` (or caching `parse_search` by normalized query + model + prompt version) would let a shared link reuse a reading across browsers. Today reuse is per browser session.
3. **No orientation or size on cameras/recordings.** Home detects portrait sources by decoding each camera's thumbnail client-side. A `width`/`height` on `source_media` or on the recording would remove that probe.
4. **Remaining Muse requests aren't exposed.** The UI states "1 request" but can't show "3 left today". A read-only `GET /usage/today` would let the cost line be exact.
5. **Activity per camera is one request per lane.** A multi-camera `/activity?camera_ids=` would cut 6–8 requests per timeline window to 1.
6. **Data hygiene** (operator action, not code): saved views "Review · People (VIDEO-02 QA)" and "Video 01 patrol" still appear on Home. They should be renamed or deleted in the app.
