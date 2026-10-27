# VIDEO-02 reference research

October 27, 2026. Purpose: inform Veyra's design contract ([DESIGN.md](../../DESIGN.md)) and the
Explore workspace ([VIDEO_INTELLIGENCE_UX.md](VIDEO_INTELLIGENCE_UX.md)) with real, inspected
product and design patterns — then adapt them, not copy them.

## How sources were inspected (and what could not be)

| Source | Method | Limitation |
| --- | --- | --- |
| [awesome-design-md](https://github.com/voltagent/awesome-design-md) | Read the README; downloaded the actual `design-md/<name>/DESIGN.md` files for Linear, Notion, Intercom, Airtable, Runway and Superhuman through the GitHub API and read their layout, elevation, shape and do/don't sections. | The getdesign.md catalogue pages only show one-line summaries; values come from the repository files. These are third-party *analyses* of brands, not official design systems. |
| [Mobbin](https://mobbin.com/) | Playwright (Chromium, 1440 px) on public pages: `/explore/web`, `/explore/web/screens`, `/explore/web/ui-elements`, `/explore/web/flows`, and the public element galleries `search-bar` and `filter-panel-ui`, scrolled and screenshotted. | Logged-out access shows gallery thumbnails and category counts only. Individual screens at full size, flows, animations and search require an account and a paid plan; **no flow was inspected**. A guessed command-palette URL returned 404. |
| [Awwwards](https://www.awwwards.com/) | WebFetch of the home page; Playwright screenshot of `/websites/ui-design/`. | Individual Site-of-the-Day sites were not opened; observations are limited to the listing UI and thumbnails. |
| [A1 Gallery](https://a1.gallery/) | WebFetch + Playwright screenshot of the home gallery. | Thumbnails only; no individual site opened. |
| [Recent.design](https://recent.design/) | WebFetch + Playwright screenshot of `?category=interface`, plus one item page (Halden app website). | Item pages are short descriptions + media; interaction details for motion pieces were inferred from titles, not watched. |

Screenshots were taken for private reference only and are **not committed**: they contain
third-party branding and imagery. No third-party asset, font, logo, illustration or exact screen
was reused. Everything below cites the observable pattern and where it went in Veyra.

## Selected references (9)

### 1. Linear — surface ladder and role-based radii
- **Source:** `design-md/linear.app/DESIGN.md` in awesome-design-md.
- **Observed:** depth via a *surface ladder plus 1px hairlines*, "resists drop shadows almost
  entirely"; 4px base unit; radii assigned by role (4 chips · 6 tags · 8 buttons/inputs ·
  12 cards · 16 product panels); "product screenshots… are the protagonist".
- **Why relevant:** dense operational software that still feels calm.
- **Adapted:** DESIGN.md §6–§7 — radius by job (8 controls, 10 media, 14 surfaces, 20 dialogs),
  elevation levels 0–3 with shadows reserved for floating layers; Explore's dense timeline.
- **Not copied:** near-black canvas, lavender accent, ultra-minimal dark marketing composition.

### 2. Intercom — one reserved AI accent, lift by surface change
- **Source:** `design-md/intercom/DESIGN.md`.
- **Observed:** a single accent ("Fin Orange") *reserved for the AI brand*; cream canvas with
  white tiles for depth; "no atmospheric gradients, no spotlight cards, no pastel section blocks".
- **Why relevant:** Muse needs an identity without turning the app into an "AI dashboard".
- **Adapted:** the ✦ Muse mark appears only on Muse entry points and Muse-authored content
  (DESIGN.md §2, §11); Veyra's sage paper → white surface → dark stage ladder (§7).
- **Not copied:** orange accent, Saans typeface, 96px marketing section rhythm.

### 3. Airtable — colour-block first, shadow second; artifacts at native ratio
- **Source:** `design-md/airtable/DESIGN.md`.
- **Observed:** "colour-block first, shadow second"; demo grids keep product screenshots at
  their native aspect ratio; card sizes deliberately uneven "to dodge a uniform spec-sheet feel".
- **Why relevant:** structured data + filtering without template sameness.
- **Adapted:** evidence frames are always 16:9 `object-fit: contain` (never cropped);
  screens get different compositions (§17); topic chips show real counts.
- **Not copied:** coral/forest signature cards, pill CTAs, long-scroll marketing bands.

### 4. Runway — imagery replaces decoration
- **Source:** `design-md/runwayml/DESIGN.md`.
- **Observed:** "images replace whitespace", "zero shadows", "the only colour comes from
  photography", radius 4–8px, "the UI should be invisible".
- **Why relevant:** the closest analogue to a video-first product.
- **Adapted:** `--stage` token for video; "the footage carries the colour, the interface carries
  the order" (DESIGN.md §1, §9); no decorative colour on result cards.
- **Not copied:** all-dark cinematic UI, uppercase navigation, film-festival drama — Veyra stays
  light-first and welcoming.

### 5. Mobbin · Navattic "Visitors" — list + detail inspector with an event timeline
- **Source:** Mobbin public gallery, Filter Panel UI (`/explore/web/ui-elements/filter-panel-ui`),
  thumbnail tagged "Table · Dashboard".
- **Observed:** a filterable list on the left; selecting a row opens a right-hand panel with a
  summary block, tabs and a chronological event list, without leaving the list.
- **Why relevant:** investigation needs comparison *and* depth at once.
- **Adapted:** Explore's results grid + sticky **inspector** (player, interval, what Muse saw,
  certainty, provenance, "around this moment"). Selecting never navigates away.
- **Not copied:** table layout, tab chrome, CRM content.

### 6. Mobbin · Shop — structured filters beside a natural-language request
- **Source:** same Mobbin gallery, thumbnail tagged "Filtering & Sorting".
- **Observed:** a chip row of structured filters across the top and a free-text request field
  ("I want coffee beans that have a hint of dark chocolate.") operating on the same results.
- **Why relevant:** Veyra has both deterministic index filters and Muse interpretation.
- **Adapted:** one ask bar (Muse, one model request, stated) above topic chips (stored index,
  no model); both drive one result list, and the sentence above results says which one is active.
- **Not copied:** commerce sort controls, product cards.

### 7. Mobbin · Exa — explicit constraints next to results
- **Source:** Mobbin Search Bar gallery (`/explore/web/ui-elements/search-bar`), Exa thumbnail.
- **Observed:** search parameters (date range, include/exclude text, result category) are shown
  as explicit, editable fields alongside results instead of being hidden in the query.
- **Why relevant:** AI search is only trustworthy when its interpretation is visible.
- **Adapted:** **Muse understood** chips (objects, actions, keywords) with latency and "no new
  video uploaded"; the time window and coverage are always printed with results.
- **Not copied:** developer-console density, dark output pane.

### 8. Recent.design · Interface feed — the artifact *is* the card
- **Source:** `recent.design/?category=interface`.
- **Observed:** category filter tabs at the top; each card is almost entirely the visual artifact
  with minimal chrome (small avatar, one action affordance).
- **Why relevant:** evidence results should lead with the frame, not with text.
- **Adapted:** result card = frame (with a factual time label) → camera/date → two-line summary →
  at most three tags. Overview "Recently found by Muse" rows lead with frames.
- **Not copied / rejected:** masonry layout, sponsored tiles, playful motion studies
  (liquid hover, 3D infinite scroll) — they communicate no state change in an operational tool.

### 9. A1 Gallery and Awwwards listings — one quiet filter row with counts
- **Source:** `a1.gallery` home; `awwwards.com/websites/ui-design/`.
- **Observed:** A1 places icon chips (All, Agency, Blog…) and a "Latest" sort on one line;
  Awwwards groups filters in a tinted bar and shows counts ("Websites 48K · UI design 8704").
- **Why relevant:** filters must be discoverable without dominating the screen.
- **Adapted:** Explore's single filter row (topic chips with real observation counts + camera
  select); Overview "Look for" shortcuts with counts.
- **Not copied / rejected:** dark gradient hero text, WebGL/3D showcase aesthetics of the featured
  sites (Awwwards SOTD thumbnails) — explicitly excluded from operational UI by DESIGN.md §13.

Also read but not adopted: **Notion** (`design-md/notion/DESIGN.md`) is described as
illustration-rich with pastel feature cards and a navy hero — useful as a counter-example of
marketing language that must not enter workflows. **Superhuman** was skimmed only for its
two-zone (editorial hero / quiet body) split; nothing was taken from it.

## Which references shaped which screens

| Screen / artifact | References applied |
| --- | --- |
| DESIGN.md tokens, elevation, radii | 1 Linear, 2 Intercom, 3 Airtable, 4 Runway |
| Explore: ask bar + chips | 6 Shop, 9 A1/Awwwards, 7 Exa |
| Explore: results + inspector | 5 Navattic, 8 Recent, 3 Airtable (native ratio) |
| Explore: "Muse understood", coverage line | 7 Exa, 2 Intercom (reserved AI mark) |
| Overview: found moments, Look for | 8 Recent, 9 counts |
| Activity / Recording moments with frames | 8 Recent, 4 Runway |
