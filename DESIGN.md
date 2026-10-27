# Veyra — DESIGN.md

The visual and interaction contract for `apps/web`. Engineering rules (ownership, truth,
safety, contracts) live in [AGENTS.md](AGENTS.md); this file decides how Veyra looks,
reads and behaves. It supersedes the Phase 02 notes in
[docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) where they differ, and keeps
their tokens. Evidence for each decision: [REFERENCE_RESEARCH](docs/design/REFERENCE_RESEARCH.md)
and [VIDEO_INTELLIGENCE_UX](docs/design/VIDEO_INTELLIGENCE_UX.md).

**REDESIGN-01 (Oct 27, 2026)** replaced the tokens, type system, shell, Home and Explore. Rationale
and references: [REDESIGN_01_DIRECTION](docs/design/REDESIGN_01_DIRECTION.md); evidence:
[REDESIGN_01_BEFORE_AFTER](docs/design/REDESIGN_01_BEFORE_AFTER.md). Where this file and older
design notes differ, this file wins.

---

## 1. Personality and atmosphere

**An editorial video workspace: the precision of a creative tool, the warmth of a good desk.**

Veyra is the quiet desk beside a window, not a control room. Warm paper surrounds a dark video
stage; the footage carries the colour, the interface carries the order. Explore is built like a
media editor (browser · stage · inspector · timeline); Home is a wall of your spaces beside a
journal of what Muse noticed. It should feel
like an editor’s tool for understanding what happened: precise, legible, unhurried, and kind
to someone who has never used a VMS.

| We are | We are not |
| --- | --- |
| Bright, welcoming, confident | Militarised, neon, “threat”-coded |
| Editorial: hierarchy through type and space | Decorative: hierarchy through effects |
| Video-first: real frames carry each screen | Illustration-first or icon-first |
| Honest about uncertainty and coverage | Implying the AI saw everything |
| Dense where the task is dense (timeline, results) | Uniformly airy or uniformly packed |

## 2. Principles and anti-patterns

1. **The frame is the protagonist.** Every result, moment and camera shows a real video-derived
   frame or the live/recorded player. If no real frame exists, show an honest empty stage — never
   an illustration that could pass for footage.
2. **Evidence before narrative.** Muse text sits *under* the frame it describes, with camera,
   wall-clock interval, uncertainty and provenance one glance away.
3. **One primary action per region.** A region (header, result, inspector) has at most one
   teal-filled button. Everything else is secondary or a text link.
4. **Chat is an accelerator, not the interface.** Every Muse capability has a visible, direct
   control (filter, button, link). Muse proposes; the person approves; the app shows the
   persisted result.
5. **Cost and coverage are part of the UI.** Actions that spend a model request say so before
   they run. Coverage (“11 of 7,724 clips analyzed”) is shown wherever results appear.
6. **Screens differ by job.** Overview orients, Explore investigates, Live watches, Recordings
   reviews one film, Saved views arrange. Do not stamp one grid on all of them.

**Rejected (do not ship):** gradient hero bands inside the app; glowing AI orbs; sparkle icons
used as decoration (✦ is reserved for the Muse identity: Ask Muse, Muse panel, Muse-authored
text); identical KPI card rows; purple/blue gradients; glassmorphism; neon accents; pill-shaped
everything; shadows on in-flow cards; stock illustrations standing in for footage; fake charts;
pulsing “live AI” indicators; marketing copy (“unlock”, “supercharge”) inside workflows; JSON,
UUIDs or millisecond integers in primary UI.

## 3. Colour tokens

Source of truth: `apps/web/src/styles/tokens.css` (REDESIGN-01). Contrast values are measured.

| Token | Value | Role |
| --- | --- | --- |
| `--canvas` | `#F5F3EE` | Warm paper: app background, sidebar, top bar |
| `--panel` | `#FAF9F6` | Workspace panes (results browser) — a surface step, not a card |
| `--surface` | `#FFFFFF` | Inspector, timeline, inputs, dialogs |
| `--sage` / `--sage-light` | `#DCE9E1` / `#EAF1EC` | Recorded-availability fill; quiet hover wash |
| `--teal` / `--teal-hover` | `#1C6B62` / `#155850` | The only accent: primary action, focus, links, selection, playhead. 5.69:1 on canvas |
| `--teal-wash` | `#E4EFE9` | Selected row/chip; ink on it 13:1, teal on it 5.35:1 |
| `--ink` | `#1D2724` | Text, observation ticks, the active topic chip |
| `--text-secondary` | `#5B625C` | Secondary text: 5.66:1 on canvas, 6.28:1 on surface |
| `--border` / `--border-soft` | `#E4E1D8` / `#EDEBE4` | Region hairlines / gridlines |
| `--border-strong` | `#7C8178` | Control boundaries, recorded baseline: 3.99:1 on surface (never body text) |
| `--blue` / `--blue-ink` | `#EAF1F6` / `#3D647C` | Information: demo-footage flag, provenance |
| `--amber`, `--amber-light`, `--amber-ink` | `#E6B56E`, `#FBF3E4`, `#8A5A1F` | Look before continuing: approval needed, "Muse is unsure", unsent ask |
| `--error` / `--error-bg` | `#9B4C35` / `#FCF0EA` | Failed operation only |
| `--stage` / `--stage-raised` / `--stage-line` | `#121513` / `#1B201D` / `#2C322F` | Video stage, the transport strip on it, its dividers |
| `--stage-text` / `--stage-muted` | `#E9EDE9` / `#A9AEA6` | Text on the stage (muted 8.1:1) |

Semantic rules: teal = "you can act / this is current"; ink = "Muse observed this"; amber =
"look before continuing"; red only for failure. Status always pairs colour with text.

## 4. Typography

Three voices, each with a job. All self-hosted; no external font requests.

| Voice | Family | Use |
| --- | --- | --- |
| Interface | **Manrope Variable** | Navigation, controls, labels, facts, buttons |
| Observation | **Newsreader Variable** (serif) | Muse-authored descriptions (result summaries, inspector title and evidence, "What Muse saw", journal) and screen titles. *Serif speaks for the footage; sans runs the tool.* |
| Timecode | `ui-monospace` stack (`--font-mono`) | Clock times, intervals, counts in chips, axis labels |

| Role | Size / weight | Use |
| --- | --- | --- |
| Screen title | Newsreader 26–32px / 500 / −0.4px | Home "Your spaces"; workspace screens use the top-bar title + an sr-only h1 |
| Observation title | Newsreader 22px / 500 | Inspector headline |
| Observation body | Newsreader 14.5–15px / 400, lh 1.32–1.55 | Summaries (2-line clamp in lists), evidence |
| Region label | Manrope 12–13px / 700 | "Timeline", "Latest moments", "What Muse saw" |
| Body | Manrope 13–14px / 450 | Notes, states |
| Meta | Manrope 12px / 500–650 | Camera names, facts |
| Timecode | Mono 11–12px, tabular | Times, counts |
| Eyebrow | Manrope 11px / 650 / +0.5px uppercase | Inspector kind ("MUSE OBSERVATION") only |

Floor: 11px. Never title-case raw model labels as headings; categories are quiet meta text.

## 5. Spacing and layout

4px base; rhythm 4/8/12/16/20/28. Page gutter 32px desktop, 16px phone.

- **Shell:** 216px labelled sidebar on paper → 60px icon rail at ≤980px **and on Explore at every
  width >540px** (workspace mode) → menu dialog ≤540px. Top bar 56px with the page title and an
  inline "Demo footage" flag; no footer.
- **Explore (workspace mode):** one viewport tall, no page scroll ≥861px. Grid
  `browser 316px | stage minmax(0,1fr) | inspector 356px` under a full-width ask bar. The centre
  column is stage (flex) → transport (50px) → timeline (≤48%). Panes scroll independently.
- **Home:** title + facts → find field (max 880px) → `wall minmax(0,1fr) | journal 340px` split by a
  hairline → saved-views strip. The wall is a 16:9 live stage over a tile grid of every camera.
- Density is per screen (§17).

## 6. Component geometry

| Element | Radius | Height |
| --- | --- | --- |
| Buttons, inputs, selects, chips | 6px | 36px (sm 32px, chips 28px) |
| Frames, tiles, stage | 4–6px | 16:9 media |
| Panels that float (dialog, palette, Muse panel) | 14px | — |
| Status dots | 50% | 7px |

Pills are not a default shape. Regions inside a workspace have no radius at all: they are
separated by hairlines.

## 7. Borders, shadows, elevation

Depth is carried by surface change (paper → white → stage) and hairlines, not shadows.

| Level | Treatment | Use |
| --- | --- | --- |
| 0 | none | Page sections, headings |
| 0.5 | paper → `--panel` → white, separated by 1px hairlines | Workspace regions (browser, inspector, timeline, Home wall/journal) — no radius, no card |
| 1 | white + 1px `--border` | Inputs, standalone objects on other screens |
| 2 | white + 1px `--border-strong` | Hover/focus of interactive objects |
| 3 | `--shadow-popover` | Dialogs, command palette, Muse panel, menus — floating only |

## 8. Navigation and information architecture

Primary: **Home · Explore · Cameras · Live view · Recordings · Activity · Saved views**, Settings at
the bottom. ⌘K ("Go to, find or ask…") opens the command bar; the "Muse" button opens the panel.
There is no other always-visible Muse entry (no sidebar card). `/search` redirects to Explore.
`/explore?moment=<segment_id>` opens Explore with that moment selected; `?q=` pre-fills a Muse
search and reuses a cached reading; only `?run=1` (set by an action labelled "Ask Muse · 1
request") spends a request on arrival.

## 9. Video-first composition

- Video sits on `--stage`; footage is never cropped (letter/pillarbox), never filtered, never
  overlaid with fake CCTV chrome, timestamps or bounding boxes we did not compute.
- The frame stays clean. Provenance lives beside it: Explore's transport strip ("… in recording ·
  prerecorded demo footage"), Home's caption, and the footage credit (title · creator · licence ·
  source · changes) under Home's stage and in the inspector's "Source and processing".
  Thumbnails carry at most one label (duration).
- A thumbnail is a *preview frame*: decoded server-side from the exact evidence segment
  (`GET /recordings/{id}/frame`). It is labelled by its interval, not as “the moment”.
- A camera preview poster is never presented as proof that a camera is online.

## 10. Search and filtering

- One ask field per screen. Its button always says **"Ask Muse · 1 request"**. Pressing it is the
  only way Explore spends a request.
- Topic chips and the camera select query the stored index (free). Applied scope reads as a line
  above results ("48 moments · All moments · newest 48") with coverage beneath.
- **Muse's reading is reusable.** After one Ask, its parsed constraints are kept (state +
  sessionStorage). Camera, period, retry, reload and Back re-query `/index-query` for free and say
  "Reusing Muse's reading · no new request". If the reading includes colour/clothing the index
  can't express, the UI says so and offers "Ask Muse again · 1 request".
- Words that name a page navigate for free (Home find field, Muse composer, ⌘K) — "No request".
- Default window is anchored to the latest recorded footage, not "now".
- No-match copy states what was searched and that absence is not proof. Coverage always shown.
- If Muse cannot run, say why and *offer* the closest free topic — never substitute silently.

## 11. Muse interaction patterns

- ✦ appears only on Muse entry points and Muse-authored content.
- **Hand-over pre-fills, never sends.** `openMuse(text)` writes into the composer; only a control
  labelled "Ask Muse" sends. Starter prompts and context actions ("Find moments like this", "Write
  it for Muse instead") fill and focus. Every send control states "1 request".
- Muse's understanding shows as chips under the query.
- **One card per turn that changes state**, never two that contradict: *Awaiting your approval*
  (amber, exact items, expiry) → *Saving…* → *Saved and verified* / *Saved · not verified* /
  *Declined · nothing changed* / *Expired · nothing changed* / *Failed · nothing confirmed*. After a
  decision the receipt leads; Muse's earlier text and the proposal collapse under "What Muse
  proposed" with a past-tense badge.
- The model cannot approve itself; approval is a person's click bound to a server confirmation.

## 12. Timeline and analytics visualization

Three layers, always in this order and encoding, only from server data:

| Layer | Source | Encoding |
| --- | --- | --- |
| Recorded availability | activity bucket `coverage_ms` | `--sage` fill (context) + 2px `--border-strong` baseline (3.5:1); gaps are empty paper |
| Analyzed by Muse | `analyzed_ms` | 3px `--teal` underline beneath the lane |
| Motion (pixel change) | `motion_ms / motion_sampled_ms` | `--teal` bar height within the lane |
| Muse observations | event starts / hits | `--ink` 2px tick; selected = teal 3px with ring |

The timeline sits **directly under the player**. While the selected clip plays, a 2px teal
**playhead** (with a cap on the axis) tracks it, and the selected moment's interval is a teal
**band** on its lane. Ticks have 24×24px hit areas; ←/→ moves between them; a cluster steps on
each press. Cameras with no Muse observations fold into one "N more cameras … not analyzed" line.
"Fit" zooms to the moments when they occupy <60% of the axis. Click a tick or result to select;
drag across the axis to narrow the time window; Escape or "Full range" restores it. Every chart has a text summary and a table alternative. Empty bins
mean “no data”, never “nothing happened”. Times use the viewer’s time zone, named once per
screen. No animation of data.

## 13. Interaction and motion

Motion only communicates state: 120ms colour/border transitions, 160ms panel slide, skeleton
shimmer while loading. No parallax, no scroll-jacking, no looping decoration. Respect
`prefers-reduced-motion` and the local Reduce-motion setting. Hover never reveals essential
information that keyboard/touch users cannot reach.

## 14. States

| State | Pattern |
| --- | --- |
| Loading | Skeletons with the final geometry (frames 16:9); `aria-busy`; no fake frames |
| Searching (Muse) | Field stays editable; button shows progress; “Muse is reading your words…” |
| Empty (no data) | One sentence of fact + one next step (“Open a recording to analyze it”) |
| No match | What was searched, coverage, and “this doesn’t prove it didn’t happen” |
| Partial coverage | Inline note with counts; never hidden |
| Indexing | Labelled progressbar with actual clip counts |
| Error | `role="alert"`, plain sentence, stable code + request reference, Retry |
| Offline / unavailable video | Stage with camera-off icon and reason; no player chrome |
| Success / receipt | Persisted resource name + Open link; neutral, no confetti |

## 15. Responsive behaviour

- **≥1280:** Explore three panes; Home wall + journal side by side.
- **861–1279:** Explore two panes — the side pane switches between *Moments* and *Details*; the
  stage + timeline stay in the centre. Home journal narrows to 290px.
- **≤860:** Explore is one column: ask → stage (16:9) → transport → sticky switch (*Moments ·
  Details · Timeline*) → chosen panel. Home stacks; the spaces wall becomes a horizontally
  scrolling row inside its own region (the page never scrolls horizontally).
- **≤540:** menu dialog, 16px gutters, full-width ask buttons; Home's stage runs edge to edge.

## 16. Accessibility

WCAG 2.2 AA. Text ≥ 4.5:1, meaningful graphics/control boundaries ≥ 3:1. 3px teal focus ring
with offset. Every chart has a text summary + table. Result lists are lists; the selected result
has `aria-current`. Timeline ticks are buttons with full accessible names (camera, time,
summary). Keyboard: `/` focuses the ask field on Explore, ←/→ moves between timeline ticks,
Escape clears the time selection. Status never relies on colour. Video has accessible labels.

## 17. Screen density guidelines

| Screen | Density | Protagonist |
| --- | --- | --- |
| Home | Medium | Live stage of one space + the wall of all spaces; journal beside |
| Explore | **High** (workspace) | The stage, with results left, evidence right, timeline below |
| Cameras | Medium | Video-derived preview tiles |
| Live view | Low chrome | Video grid; controls collapse to one bar |
| Recordings | Medium–high | Player + availability/motion/moment layers (next to move to workspace grammar) |
| Activity | Medium | Moments with frames grouped by day |
| Saved views | Medium | Arrangements as real-frame mosaics |
| Settings | Low | Plain forms and honest statements |

## 18. Visual QA checklist

- [ ] Is a real frame or player the first thing the eye lands on (except Settings)? On Explore at
      1440×900, is the player and the first result above the fold?
- [ ] At most one filled teal button per region?
- [ ] No sparkle/✦ outside Muse entry points? No gradients, glows, glass, neon?
- [ ] Every result shows camera, wall-clock interval, uncertainty and a play action?
- [ ] Coverage and model-request cost visible where relevant?
- [ ] No UUIDs, JSON or raw milliseconds in primary UI?
- [ ] Muse's words in the serif, interface in sans, times in mono?
- [ ] Every control that spends a model request says "1 request"; hand-overs only pre-fill?
- [ ] 1440/1280/1024/768/390 widths: no horizontal page scroll, no clipped labels?
- [ ] Keyboard path through ask → filter → result → play → action, with visible focus?
- [ ] Loading, empty, no-match, partial, error and offline states all reachable and honest?
- [ ] axe: zero violations on the screen.
