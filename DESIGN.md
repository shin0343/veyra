# Veyra — DESIGN.md

The visual and interaction contract for `apps/web`. Engineering rules (ownership, truth,
safety, contracts) live in [AGENTS.md](AGENTS.md); this file decides how Veyra looks,
reads and behaves. It supersedes the Phase 02 notes in
[docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) where they differ, and keeps
their tokens. Evidence for each decision: [REFERENCE_RESEARCH](docs/design/REFERENCE_RESEARCH.md)
and [VIDEO_INTELLIGENCE_UX](docs/design/VIDEO_INTELLIGENCE_UX.md).

---

## 1. Personality and atmosphere

**Calm technology × human-centered safety × modern creative software.**

Veyra is the quiet desk beside a window, not a control room. Light sage paper surrounds dark
video stages; the footage carries the colour, the interface carries the order. It should feel
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

Source of truth: `apps/web/src/styles/tokens.css`. Baseline palette preserved from Phase 02;
VIDEO-02 adds stage, selection and mark roles only.

| Token | Value | Role |
| --- | --- | --- |
| `--canvas` | `#F7F9F6` | App background (“paper”) |
| `--surface` | `#FFFFFF` | Objects: results, inspector, dialogs, inputs |
| `--sage` | `#DCECE5` | Selected navigation, recorded-availability fill |
| `--sage-light` | `#ECF3EE` | Quiet wash: hover, filter bar, table stripes |
| `--teal` | `#207A70` | Primary action, focus ring, links, selected state, motion marks |
| `--teal-hover` | `#17675E` | Primary hover/pressed |
| `--teal-wash` | `#E3F0EC` | Selected result / chip background; its text is **ink** (10.2:1), border teal — teal text on it is only 4.4:1 |
| `--ink` | `#253B36` | Headings, essential text, observation marks |
| `--text-secondary` | `#5D6D64` | Secondary text: 5.17:1 on canvas, 4.85:1 on sage-light. **Not on `--sage`** (4.48:1) — selected rows use ink |
| `--blue` / `--blue-ink` | `#E8F1F7` / `#3D647C` | Information: preview/demo disclosure, provenance |
| `--amber` | `#E6B56E` | Attention marks (approval needed, uncertainty “high”) — graphic only |
| `--amber-light` / `--amber-ink` | `#FCF2E3` / `#78501D` | Consequential-action review surface/text |
| `--error` / `--error-bg` | `#9B4C35` / `#FCF0EA` | Failure text and surface |
| `--border` | `#E0E7E0` | Hairline object boundaries |
| `--border-strong` | `#7A8D84` | Inputs, controls and the recorded-availability baseline (3.52:1 on white; was `#879A90` at 2.98:1) |
| `--stage` | `#101513` | Video stage behind letter/pillar-boxed footage |
| `--stage-text` | `#E9F0EC` | Labels drawn on the stage (≥ 15:1) |

Semantic rules: teal means “you can act / this is selected”; ink means “Muse observed this”;
amber means “look before continuing”; error red only for a failed operation. Status always pairs
colour with text (Connected, Offline, Not checked, Paused). No screen introduces its own accent.

## 4. Typography

One family: **Manrope Variable**, self-hosted. Timecodes and counts use
`font-variant-numeric: tabular-nums` so columns do not jitter.

| Role | Size / weight / tracking | Use |
| --- | --- | --- |
| Display | 30px / 650 / −0.9px | Overview greeting only |
| Page title | 24px / 650 / −0.6px | Every workspace screen (operational, not hero) |
| Section | 16px / 650 / −0.3px | Region headings |
| Item title | 14px / 600 | Result summaries, camera names |
| Body | 14px / 450, line-height 1.55 | Paragraphs, Muse text |
| Meta | 12px / 500 | Times, camera, counts |
| Micro label | 11px / 600, +0.2px | Legends, overline labels on the stage |

Max reading measure 72ch. Never pair an oversized heading with 11px body. Summaries clamp to two
lines in lists and expand in the inspector.

## 5. Spacing and layout

4px base; component rhythm 4/8/12/16/24/32. Page gutter 32px desktop, 24px tablet, 16px phone.

- Shell: 224px labelled sidebar (>1190px) → 76px icon rail (541–1190px) → menu dialog (≤540px).
- Explore at ≥1280px: `results (minmax(0,1fr)) | inspector (440px, sticky)`. Below 1180px the
  inspector stacks above the results and becomes the first thing after selecting a moment.
- Information density is per screen (see §17), not global.

## 6. Component geometry

| Element | Radius | Height |
| --- | --- | --- |
| Buttons, inputs, selects, chips | 8px | 36px (sm 30px) |
| Result frames, camera tiles | 10px | 16:9 media |
| Object surfaces (inspector, panels) | 14px | — |
| Dialogs, command palette | 20px | — |
| Status/legend dots | 50% | 7–8px |

Pills are not a default shape. Only the camera-count badge and toggle switches are fully round.

## 7. Borders, shadows, elevation

Depth is carried by surface change (paper → white → stage) and hairlines, not shadows.

| Level | Treatment | Use |
| --- | --- | --- |
| 0 | none | Page sections, headings |
| 1 | white + 1px `--border` | Results, panels, inspector |
| 2 | white + 1px `--border-strong` | Hover/focus of interactive objects |
| 3 | `--shadow-popover` | Dialogs, command palette, Muse panel, menus — floating only |

## 8. Navigation and information architecture

Primary: **Overview · Explore · Cameras · Live view · Recordings · Activity · Saved views**,
Settings at the bottom. *Explore* is the investigation workspace (search + filters + timeline +
evidence). `/search` redirects there with its query so Muse/feature links keep working.
⌘K opens the command bar from anywhere; Ask Muse opens the side panel. Breadcrumb shows location;
headings never repeat the breadcrumb word-for-word plus a slogan.

## 9. Video-first composition

- Video sits on `--stage`; footage is never cropped (letter/pillarbox), never filtered, never
  overlaid with fake CCTV chrome, timestamps or bounding boxes we did not compute.
- Stage labels are factual only: source kind (“Demo recording · Prerecorded footage”), camera,
  and a timecode. Max two labels on a frame.
- A thumbnail is a *preview frame*: decoded server-side from the exact evidence segment
  (`GET /recordings/{id}/frame`). It is labelled by its interval, not as “the moment”.
- A camera preview poster is never presented as proof that a camera is online.

## 10. Search and filtering

- One ask field. Typing a sentence and pressing Enter asks Muse to interpret it (one model
  request, stated next to the button). Topic chips query the stored index directly, with no model.
- Filters live in one quiet row under the field: topic chips · camera · time window. Applied
  filters read as a sentence above results (“24 moments · Bicycles · All cameras · Oct 27,
  12:40 AM–8:30 AM”).
- Default window is anchored to the latest recorded footage, not “now”: a demo or an idle
  camera must not produce an empty “last 24 hours”.
- No-match copy says what was searched and that absence is not proof. Coverage is always shown.
- If Muse cannot run (budget, outage), say why and offer the closest index filter explicitly —
  never silently substitute keyword results for a Muse answer.

## 11. Muse interaction patterns

- Muse’s identity mark (✦) appears only on Muse entry points and Muse-authored content.
- Muse output shows its *understanding* as editable chips (camera, objects, actions, time).
- Proposals that change the workspace use the amber review surface, list exactly what will be
  created, and require an explicit person’s Approve. Receipts show the persisted resource with
  an Open link. Declines are neutral.
- Context actions (in inspector, recording, camera) pre-fill a Muse request with real names.
  They never send automatically except when the person clicked an action that says “Ask Muse”.

## 12. Timeline and analytics visualization

Three layers, always in this order and encoding, only from server data:

| Layer | Source | Encoding |
| --- | --- | --- |
| Recorded availability | activity bucket `coverage_ms` | `--sage` fill (context) + 2px `--border-strong` baseline (3.5:1); gaps are empty paper |
| Analyzed by Muse | `analyzed_ms` | 3px `--teal` underline beneath the lane |
| Motion (pixel change) | `motion_ms / motion_sampled_ms` | `--teal` bar height within the lane |
| Muse observations | event starts / hits | `--ink` 2px tick; selected = teal 3px with ring |

Click a tick or result to select; drag across the axis to narrow the time window; Escape or
“Full range” restores it. Every chart has a text summary and a table alternative. Empty bins
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

1440/1280: two-column Explore; 1024: inspector stacks above results, rail navigation; 768: one
result column, filter chips scroll horizontally inside their row (the page never scrolls
horizontally); ≤540: menu dialog, 16px gutters, full-width ask field, sticky Explore actions.

## 16. Accessibility

WCAG 2.2 AA. Text ≥ 4.5:1, meaningful graphics/control boundaries ≥ 3:1. 3px teal focus ring
with offset. Every chart has a text summary + table. Result lists are lists; the selected result
has `aria-current`. Timeline ticks are buttons with full accessible names (camera, time,
summary). Keyboard: `/` focuses the ask field on Explore, ←/→ moves between timeline ticks,
Escape clears the time selection. Status never relies on colour. Video has accessible labels.

## 17. Screen density guidelines

| Screen | Density | Protagonist |
| --- | --- | --- |
| Overview | Low–medium | One live film + latest found moments (frames) |
| Explore | **High** | Results with frames + inspector player + lanes timeline |
| Cameras | Medium | Video-derived preview tiles |
| Live view | Low chrome | Video grid; controls collapse to one bar |
| Recordings | Medium–high | Player + availability/motion/moment layers |
| Activity | Medium | Moments with frames grouped by day; motion collapsed |
| Saved views | Medium | Arrangements as real-frame mosaics |
| Settings | Low | Plain forms and honest statements |

## 18. Visual QA checklist

- [ ] Is a real frame or player the first thing the eye lands on (except Settings)?
- [ ] At most one filled teal button per region?
- [ ] No sparkle/✦ outside Muse entry points? No gradients, glows, glass, neon?
- [ ] Every result shows camera, wall-clock interval, uncertainty and a play action?
- [ ] Coverage and model-request cost visible where relevant?
- [ ] No UUIDs, JSON or raw milliseconds in primary UI?
- [ ] Page title 24px on workspace screens; tabular numerals on times?
- [ ] 1440/1280/1024/768/390 widths: no horizontal page scroll, no clipped labels?
- [ ] Keyboard path through ask → filter → result → play → action, with visible focus?
- [ ] Loading, empty, no-match, partial, error and offline states all reachable and honest?
- [ ] axe: zero violations on the screen.
