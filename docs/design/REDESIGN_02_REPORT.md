# REDESIGN-02: one art direction, carried across the product

October 27, 2026 · frontend owner (Claude Opus 5.5) · branch `redesign-02`.

**Build history**
- **Starting point:** REDESIGN-01, committed as `4cd5c11`.
- **Before captures:** production build `lV6rQ2mbl57RzWjMpbGsE`.
- **After:** production build `8Ljcda0FKDR9A1APIKC-3`, served at **http://127.0.0.1:3600** (`VEYRA_DIST_DIR=.next-qa`) against the same `runtime/demo` API, database and media. :3200 still serves the older VIDEO-02 build.

**Scope and safety**
- Only `apps/web/**`, `DESIGN.md` and `docs/**` changed. Backend, contracts, migrations and media are untouched.
- 0 model requests and 0 workspace mutations: every paid or mutating request was blocked at the network layer, and none was attempted.

Art direction and its rationale: [REDESIGN_01_DIRECTION.md](REDESIGN_01_DIRECTION.md). Contract:
[DESIGN.md](../../DESIGN.md) (§5, §8, §11, §17 and the new §19). Components:
[COMPONENTS.md](COMPONENTS.md).

## 1. What was wrong before this phase

Home and Explore had the new language. Every other screen still had VIDEO-02 bones in the new
colours:

- **Cameras:** a uniform 3-column card grid with overlay labels and "…" menus. Two synthetic test cameras sat in the default grid. The subtitle was a slogan ("A little connection to the places that matter").
- **Live:** every tile had a white header bar (camera icon, name, status, expand), plus a separate "Selected camera" card and a footnote.
- **Recordings:**
  - It opened on a 24 s Garden clip with **0 moments**.
  - Moments came last, under an availability card, a 3-bar activity chart and a blue indexing card.
  - There was a paid "Find with Muse" header button.
- **Activity:** a 4,495 px stack of large bordered cards, each with a "Review moment" button, under a mostly empty 72-bar chart.
- **Saved views:** pastel icon tiles instead of footage, while Home already showed real frames. Three of the seven views include test patterns. "1 cameras · 1 columns". There was no edit.
- **Settings:** slogan headings ("Your video, your choice", "A few useful shortcuts"), a callout card and a Muse "Find privacy controls" button.
- **Muse panel:** the welcome repeated itself (dialog description, a context line, then the same sentence as a heading). The prompts were the same on every page.
- **Palette:** "garden" offered only the two paid Muse options, even though a "Garden wildlife" camera and a "Garden review" view exist. It had a blurred, glass-like backdrop.

## 2. What each screen is now

Same tokens, type voices (serif for footage and titles, sans for the tool, mono for time), hairline
regions and dark stage. **Different composition per job:**

| Screen | Composition | Key changes |
| --- | --- | --- |
| **Cameras** | Library + inspector | Real frames grouped by space (contact sheet, no card chrome) with status, location and moment counts. Selecting a camera (`?camera=`) opens a sticky panel with its live player, status and check time, Live view / Latest recording / N moments, facts (group, location, recordings, the views it belongs to, analysis) and the footage credit. "Camera settings" opens the existing settings, privacy and remove dialog unchanged. Test sources are hidden with a count and a switch. The settings dialog shows the source title, not its ID. |
| **Live view** | Dark wall | Tiles edge to edge on the stage with one caption strip each (dot, name, "Demo stream", expand). Layouts are 1, 2×2 and 3×3 (all six real cameras at once), with paging. A focus strip under the wall gives the chosen camera's next steps. **Save as a view** opens the editor pre-filled with the connected cameras. The saved-view route uses the same wall and adds **Edit view**. |
| **Recordings** | Library + player workspace | The library sits left, with frames, mono times, lengths and "earlier ingest" when a recording has no credit. It **opens on the recording that holds the newest Muse observation** (Bicycle parking, 3 moments). The player has a dark transport row (position, ±10 s, ‹ Moment / Moment ›, mm:ss, auto-continue) and the recorded/moment strip directly beneath. Below that, moments (serif sentences, the current one highlighted) sit beside "About this recording": facts, credit, indexing (the existing confirmation flow, unchanged) and the motion chart as a disclosure. |
| **Activity** | Review log | Day-grouped rows: mono time, real frame, serif sentence, camera, kind and in-recording offset. **Watch** expands the row and plays the evidence clip in place, with the "not verified fact" note; Open recording links out. The type filter shows counts (Muse observations 86 · Movement 73 · Both 159). The chart is a disclosure. Wording is severity-neutral: "Muse observation" and "Movement · pixel change". |
| **Saved views** | Frame gallery | Mosaics drawn from real camera frames **at saved positions**; the whole item opens. Each lists its camera names, columns and version, plus Edit. Views with test sources are hidden (3) behind a switch. |
| **View editor** (new) | Dialog | Name, a frame picker that numbers cameras in order, 1/2/3 columns and a live mosaic preview. A review step names what will be created or replaced. Saving calls `POST /layouts`, or `PUT /layouts/{id}` with `expected_version` so a concurrent edit is rejected rather than overwritten. The receipt shows the version and an Open link. "Write it for Muse instead" pre-fills Muse and sends nothing. |
| **Settings** | Section nav + rows | Sections are Display, Privacy and analysis, Recording and Keyboard. Real switches, including the new **Show development test sources**. Plain facts. A **per-camera privacy table** (status, cloud analysis, Change → that camera's panel), today's usage from `GET /analysis-usage`, and keyboard shortcuts that match the product (`/`, arrows, Esc). |
| **Muse panel** | Floating panel | No repeated welcome. **Suggestions for this page** are built from real camera names, and each says "Reads your workspace" or "Prepares a change for your approval". They fill the composer only. Proposal and receipt surfaces got the system's amber/teal left rules; the past-tense decision states from REDESIGN-01 are kept. |
| **Palette** | Dialog | **Cameras and saved views match locally for free** ("No request") and open directly (camera → its panel, view → its wall). Muse options come last and state "1 request". The backdrop is a flat dim, with no blur. |
| **Shared** | — | `PageHeading` takes live facts, never a slogan. Switches look like switches (native checkbox, `role="switch"`). Segmented controls, selects and badges are retuned (11 px floor). Dialog titles use the serif. `CameraFrame` and `ViewMosaic` are reused across Cameras, Live, Saved views, Home and the editor. |

Home follows the same test-source rule ("2 test sources hidden") and uses `ViewMosaic`.

## 3. Before / after screenshots

Captured with `apps/web/tests/redesign02-capture.mjs`. All routes are at 1440×900, 1024×768 and
390×844 (viewport plus full page), and the Muse panel and ⌘K palette are included. Paid and mutating
requests were blocked; 0 were attempted.

- Before: [`redesign-02/screenshots/before/`](redesign-02/screenshots/before/) ([report.json](redesign-02/screenshots/before/report.json))
- After: [`redesign-02/screenshots/after/`](redesign-02/screenshots/after/) ([report.json](redesign-02/screenshots/after/report.json))
- Side by side: [`redesign-02/screenshots/compare/`](redesign-02/screenshots/compare/) (27 images: 9 screens × 3 widths)

| Screen | 1440 comparison |
| --- | --- |
| Cameras | [compare](redesign-02/screenshots/compare/cameras-1440.png) |
| Live view | [compare](redesign-02/screenshots/compare/live-1440.png) |
| Recordings | [compare](redesign-02/screenshots/compare/recordings-1440.png) |
| Activity | [compare](redesign-02/screenshots/compare/events-1440.png) |
| Saved views | [compare](redesign-02/screenshots/compare/layouts-1440.png) |
| Saved view (detail) | [compare](redesign-02/screenshots/compare/layout-detail-1440.png) |
| Settings | [compare](redesign-02/screenshots/compare/settings-1440.png) |
| Muse panel | [compare](redesign-02/screenshots/compare/muse-panel-1440.png) |
| Palette ("garden") | [compare](redesign-02/screenshots/compare/palette-1440.png) |

Interaction states from the flow run: [camera opened](redesign-02/checks/cameras-open.png) ·
[3×3 wall](redesign-02/checks/live-3x3.png) · [view editor](redesign-02/checks/view-editor.png) ·
[Activity row playing](redesign-02/checks/activity-watch.png) ·
[Muse suggestions](redesign-02/checks/muse-suggestions.png).

| Measured (1440×900) | Before | After |
| --- | ---: | ---: |
| Cameras page height | 1,485 px | 1,073 px |
| Live page height | 1,226 px | 1,053 px |
| Activity page height (phone) | 4,495 px (8,817) | 3,407 px (7,658) |
| Saved views page height | 1,111 px | 900 px |
| Recordings default: moments shown | 0 (Garden clip, unanalyzed) | 3 (newest observed recording) |
| Saved-view previews with real frames | 0 | 13 frames across 4 views |
| Palette "garden": free matches | 0 | 2 (a camera and a view) |
| Phone: player top on Recordings / Live | 350 / 346 px | 294 / 267 px |
| Horizontal overflow, 12 states × 3 widths | 0 | 0 |

## 4. Verification (production build, real stack)

| Check | Result |
| --- | --- |
| `npm run lint` · `tsc --noEmit` · `prettier --check src tests` · `next build` | pass |
| `node tests/redesign02-flows.mjs http://127.0.0.1:3600` (new) | **39/39** — [flows.json](redesign-02/checks/flows.json) |
| `node tests/redesign01-flows.mjs http://127.0.0.1:3600` (Home/Explore/Muse) | **49/49** — [flows.json](redesign-02/checks/redesign01/flows.json) |
| `node tests/video02-flows.mjs http://127.0.0.1:3600 …` (free mode) | **23/23**, 0 page errors — [flows.json](redesign-02/checks/video02/flows.json) |
| `tests/verify-ui.mjs` (preview fixtures, API-less dev server, run from a scratch cwd so committed captures weren't overwritten) | passed: 24 routes, 31 interactions, 29 axe scans, **0 violations** |
| axe WCAG 2.2 AA on real Cameras (+ opened), Live, Saved views, editor, Recordings, Activity, Settings, Muse | 0 violations on each |

**Flows the brief asked for, as the 39 checks cover them**
- **Open a camera:** the panel opens and plays live, and the credit is shown. Live view from the panel opens single mode and plays.
- **Live wall:** 2×2 shows 4 tiles playing; 3×3 shows all 6.
- **Open saved layouts:** test views are hidden (4 of 7 shown), there are 13 real frames, a view opens and plays, and Edit opens with its cameras chosen. It was not saved.
- **Play a recording:** it defaults to one with moments, plays, the strip sits under the player, and choosing a moment seeks.
- **Search result → playback:** Explore → Open in recording plays at the evidence segment.
- **Muse suggestions:** they fit the page, each is labelled read or change, and choosing one fills the composer only.
- **Palette:** the camera and view match free, and Enter opens the camera.
- **Activity:** Watch plays the evidence in place, and the Movement filter works.
- **Settings:** the privacy table lists 6 cameras, usage is read, and the test-source switch reveals 8 cameras on Cameras and is then switched back.
- **Safety:** no paid or mutating request, no page errors.

**Spend and data:** the network guard blocked `POST/PUT/PATCH/DELETE` on cameras, layouts, agent,
search and analysis-jobs. **0 requests were attempted.** No model call, no reindexing, no save. The
test-source switch is a browser preference (localStorage), not data.

**Not verified**
- **The view editor's real save.** The `PUT /layouts/{id}` path was not executed against the API, because it would bump a demo view's version. It is type-checked against the generated contract and follows the same idempotent `mutationOptions` path as create. Run `node tests/live-flows.mjs` (creates one view) to exercise create.
- **The suites that spend or write.** `live-flows.mjs` and `demo-walkthrough.mjs` were ported to the new selectors but **not run**, because they save views and spend Muse requests.
- **Safari/iOS and physical cameras.** Unchanged from earlier phases.

## 5. Components and files changed

| File | Change |
| --- | --- |
| `screens/cameras-screen.tsx` | New library and `CameraPanel`; connect and settings dialogs kept; settings shows the source title |
| `camera-card.tsx` | `CameraCard`/`CameraVisual` replaced by `CameraFrame` |
| `screens/live-screen.tsx` | Rewritten as the wall: 1/2×2/3×3/saved, focus strip, Save as a view, Edit view |
| `screens/layouts-screen.tsx` | Rewritten: gallery, `ViewMosaic`, `LayoutEditor` (create + `PUT` edit) |
| `screens/recordings-screen.tsx` | Recomposed: library left, transport, strip, moments + about. Default to the newest observed recording; test recordings hidden. Playback, seek and indexing logic unchanged |
| `screens/events-screen.tsx` | Rewritten as the review log with inline playback and counted filters |
| `screens/settings-screen.tsx` | Rewritten: sections, switches, privacy table, usage, test-source switch |
| `screens/home-screen.tsx` | Test-source rule and `ViewMosaic` |
| `muse-panel.tsx` | Page-aware suggestions (read vs change); the duplicated welcome and the dead `suggestedPrompts` removed |
| `app-shell.tsx` | Palette matches cameras and views for free; honest title; pluralised |
| `workspace-provider.tsx`, `lib/demo.ts` (new) | `showTestSources` preference; the data-driven test-source rule |
| `ui/primitives.tsx` | `PageHeading` takes facts; description optional |
| `styles/product.css` (new) | Shared vocabulary + Cameras, Live, Saved views, Recordings, Activity, Settings, Muse, palette |
| `styles/*.css` | 110 orphaned selectors pruned (~525 lines); the old 104 px `.view-mosaic` rule removed |
| `tests/redesign02-capture.mjs`, `tests/redesign02-flows.mjs` (new) | Capture + 39 checks with paid/mutation guard |
| `tests/verify-ui.mjs`, `video02-flows.mjs`, `live-flows.mjs`, `demo-walkthrough.mjs` | Selectors ported to the new structure |

## 6. For Codex: backend-dependent issues, with reproduction steps

1. **A long Trail recording mixes a test pattern with real footage and carries no provenance.**
   - **Reproduce:** `GET /api/v1/recordings/05636b39-cb53-59a1-aa49-4a117421ea4d` returns `"source_media": null`, while its camera `82f995cb…` (Trail camera) has `source_media.kind = "prerecorded"`. Then `GET /api/v1/recordings/05636b39-…/frame?offset_ms=5000` returns an 11.8 KB JPEG of colour bars. Yet 86 Muse observations of real trail footage fall inside the same recording (12:49–12:51 AM local).
   - **Effect:** the UI can only say "earlier ingest… may include development test patterns". It can't hide the bars or credit the film.
   - **Ask:** per-segment (or per-interval) provenance, or split the recording at the source change.
2. **The usage ceiling isn't exposed.**
   - **Reproduce:** `GET /api/v1/analysis-usage` returns `{"requests":95,"reserved_usd":4.75,"estimated_usd":null,"billing":"unknown"}`, with no configured daily limit.
   - **Ask:** add `limit_usd` / `remaining_requests`, so cost lines can say "1 request · 5 left today" instead of a bare count.
3. **`/events` still pages oldest-first.**
   - **Reproduce:** `GET /api/v1/events?limit=100&start=…&end=…` returns the earliest first, and `next_cursor` walks forward.
   - **Effect:** Activity reads up to 10 pages to sort newest-first. Add `order=desc`.
4. **Activity is one request per camera.**
   - **Reproduce:** Recordings' chart and Explore's lanes call `GET /cameras/{id}/activity` once per camera.
   - **Ask:** add a multi-camera form.
5. **Camera frame size is unknown.** Home and Saved views draw portrait films letterboxed because `source_media` has no `width`/`height`. Add them, or an orientation field. (Repeated from REDESIGN-01 §6.)
6. **QA-named saved views (operator action, not code).** "Review · People (VIDEO-02 QA)" and "Video 01 patrol" use real cameras, so the data rule keeps them visible. Rename or delete them in the app (Saved views → Edit) before a demo.

## 7. Honest assessment

**What's coherent now:** one visual system on every route. That means warm paper, a single teal, the
dark stage, serif for footage and titles, mono for time, hairline regions, and no slogans. Each screen
still has its own shape: library + panel, wall, library + player, log, gallery, rows. Real frames
are on every screen that represents video, and test fixtures are out of the default path without
being destroyed.

**Still generic or unfinished**
- The Cameras library at 1440 leaves a lot of empty space when a group has one camera (Outdoors).
- The Recordings transport row is dense on phones.
- The motion chart (`ActivityHistogram`) keeps its VIDEO-02 internals, now inside a disclosure rather than redesigned.
- The connect-camera and settings dialogs keep their VIDEO-02 forms, now in the new type and colours.
- The view editor's real `PUT` is unexercised (see §4).
