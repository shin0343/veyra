# Veyra — reference comparison

October 27, 2026. Each reference was used as an evaluation *lens*, not a template. No layout,
asset or branding was copied. Findings referenced by ID are in [OPUS_DESIGN_AUDIT.md](OPUS_DESIGN_AUDIT.md).

## Access log (what was actually consulted)

| Source | Accessed how | What was visible | Limitation |
| --- | --- | --- | --- |
| [awesome-design-md](https://github.com/voltagent/awesome-design-md) | Fetched the README, plus the raw `design-md/runwayml/DESIGN.md` and `design-md/sentry/DESIGN.md` | The 9-section DESIGN.md structure, an 84-file catalogue, and Runway's and Sentry's rules | These are third-party *analyses* of brand sites, not official systems. Linear/Intercom/Airtable files were read in VIDEO-02's research and not re-read here. |
| [Mobbin](https://mobbin.com/) | Fetched the home page | Marketing page: screens, flows, UI elements and website-section categories | Library, search and flows need an account and a paid plan. **No Mobbin flow or screen was inspected in this audit.** Journey judgments rely on the live walkthrough, not Mobbin data. |
| [Awwwards](https://www.awwwards.com/) | Fetched the home page | SOTD Oct 27, 2026 "Awards Racing" (7.54), nominees, recent SOTDs (A24, Forge Automotive…) | Scoring criteria aren't on the home page; individual sites weren't opened. |
| [A1 Gallery](https://a1.gallery/) | Fetched the home page | Type/Category/Style/Tech/Colour filters, a "Latest" feed of screenshot cards, collections | Thumbnails only; no site opened. |
| [Recent.design](https://recent.design/) | Fetched the home page | Design/Web Interface/Motion filters, a recent-items grid (e.g. "Halden app website", "Playful Loading Screens", "Liquid Button Hover Effect") | Item motion wasn't watched. |

## Lens 1 — awesome-design-md: is the design contract coherent?

The repository's recommended DESIGN.md has 9 sections: Visual Theme, Colour Roles, Typography,
Component Stylings, Layout, Depth/Elevation, Do's and Don'ts, Responsive, Agent Prompt Guide.

**Veyra's DESIGN.md** has 18 sections and covers all 9 except an agent prompt guide. It goes
further with states, timeline encoding, accessibility and a QA checklist. This is among the
stronger contracts I would expect from a hackathon team.

**Where implementation drifts from the contract** (contract right, product wrong):

| DESIGN.md rule | Observed | Finding |
| --- | --- | --- |
| §2.1 "the frame is the protagonist"; §18 "real frame first" | Explore player at y = 794 px; Saved views show icon tiles | P1-1, P1-7 |
| §2.5 cost stated before a model request; §11 no auto-send except "Ask Muse" | Six non-"Ask Muse" buttons auto-send | P0-2 |
| §11 receipts show the persisted resource; states distinguishable | A verified receipt sits beside "nothing saved yet" | P0-1 |
| §3 amber = "look before continuing" | Amber "medium uncertainty" on most cards | P1-3 |
| §4 type floor 11px; titles 24px | 10px text; 27px titles at 390 | P2-1 |
| §5 icon rail 541–1190 px | Labelled sidebar at 1024 | P2-1 |
| §2 "marketing copy… inside workflows" rejected | Slogan subtitles, "a little ×10" | P1-6 |

**Runway (`runwayml/DESIGN.md`):** "Let visual content (photos, videos) dominate — the UI should
be invisible"; "the only colour comes from photography"; "zero shadows"; radius 4–8px. Veyra
follows the colour, shadow and radius parts. It *doesn't yet* let video dominate on Explore or
Saved views, where chrome and empty axis come first.

**Sentry (`sentry/DESIGN.md`):** "content density takes priority because users are scanning,
comparing, and acting"; "marketing reads like prose, the product reads like a log"; "let one
[canvas] own marketing/feature pages and the other own transactional pages, with no
half-measures". Veyra's Explore density is right. Its page subtitles read like marketing prose
inside transactional screens, which is the half-measure Sentry's rule warns against (P1-6).

## Lens 2 — Mobbin: journeys, search/filter, contextual actions, empty states

Mobbin's library wasn't accessible beyond the marketing page, so this lens rests on established
product patterns and the live walkthrough. No Mobbin screen is claimed as evidence.

- **Search + filter:** Veyra's ask field plus free chips plus a single camera select is a sound,
  conventional structure. The gap is *refinement*: in Muse mode each filter tweak re-runs the
  paid parse (P0-3). Mature search products keep the interpreted query as editable state.
- **List + detail:** results + sticky inspector is the right pattern. The gap is spatial: the
  detail panel begins below the fold (P1-1), and timeline selection updates it out of view (P1-2).
- **Contextual actions:** Veyra has many (Open in recording, Watch live, Focus ±5 min, Show only
  camera, Save as view), and they work. The Muse-flavoured ones auto-send (P0-2).
- **Empty states:** Recordings opens on an empty-moments recording with a paid CTA (P1-4). The
  Muse empty state follows the generic assistant-welcome template (P1-6).
- **Navigation continuity:** evidence → recording has no "Back to results". Browser Back works but
  re-bills in Muse mode (P0-3).

## Lens 3 — Awwwards: distinctiveness and art direction, without rewarding spectacle

The current SOTD and nominees are brand and marketing sites built around motion and editorial
art direction. That standard doesn't transfer to an operational evidence tool, and Veyra is right
not to chase it (DESIGN §13).

What does transfer is **typographic and compositional confidence**. Veyra's typography (Manrope,
tabular numerals, restrained scale) is competent but undifferentiated: every screen opens with
the same 24px title + grey slogan + right-aligned buttons. Distinctiveness should come from
*content composition*: the lane strip, frame-led rows, the stage against paper. It shouldn't come
from type effects. The stage/paper contrast is already Veyra's most recognisable visual idea; use
it more consistently (Saved views, Review dialog) and stop diluting it with overlay labels
(P2-4).

## Lens 4 — A1 Gallery: layout craft, rhythm, density, proportion

A1's feed pairs one quiet filter row with dense screenshot cards. Veyra's Explore filter row
matches this well. Proportion problems in Veyra:

- **Explore lanes card:** ~400 px tall for ~5 minutes of analysed signal. The proportion is
  inverted relative to information.
- **Home live film:** a portrait source in a full-width 16:9 stage, about 60% black.
- **Cameras and Saved views:** uniform 3-column grids with identical card anatomy. This is
  acceptable on Cameras; on Saved views it makes every arrangement look the same, because the
  tiles are placeholders.
- **Recordings:** the moments list (the useful part) sits after two charts with different time
  labelling. The rhythm is chart-chart-panel-list, when it should be player-moments-strip.

## Lens 5 — Recent.design: contemporary interaction quality, restrained motion, polish

Recent's interface items lean toward playful motion ("Liquid Button Hover Effect", "Playful
Loading Screens"). Veyra correctly rejects decorative motion. Contemporary *polish* here means
the following, and the product is close on the first three:

- **State precision:** one card that changes state, not two conflicting ones (P0-1).
- **Immediate local feedback:** tick → visible change (P1-2).
- **Truthful affordances:** ↗ icons on chips that actually send a paid request (P0-2) break this.
- **Finish:** no "1 cameras", no QA names, no test patterns (P1-5).

## Summary

| Lens | Veyra today | Main gap | Findings |
| --- | --- | --- | --- |
| Design contract (awesome-design-md) | Strong, complete | Product drifts from its own rules | P0-1, P0-2, P1-1, P1-3, P1-6, P2-1 |
| Journeys (Mobbin) | Right patterns | Refinement cost, off-screen feedback, buried moments | P0-3, P1-1, P1-2, P1-4 |
| Distinctiveness (Awwwards) | Original structure, generic surface | Slogans, uniform headers, overlay labels | P1-6, P2-4 |
| Layout craft (A1) | Good filter row and cards | Inverted proportions (lanes, portrait hero, recording rhythm) | P1-1, P1-4, P1-7 |
| Interaction polish (Recent) | Restrained, accessible | State precision, truthful affordances, finish | P0-1, P0-2, P1-2, P1-5 |
