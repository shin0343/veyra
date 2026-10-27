# REDESIGN-01 — Before / after

Direction and rationale: [REDESIGN_01_DIRECTION.md](REDESIGN_01_DIRECTION.md).

- **Before:** production build `Xt58zp9KoNy6Yf99tkmGh`, still serving the demo at http://127.0.0.1:3200.
- **After:** production build `lV6rQ2mbl57RzWjMpbGsE` (`VEYRA_DIST_DIR=.next-qa`), served at http://127.0.0.1:3600 against the **same** `runtime/demo` API, database and media.
- **Capture:** both captured by `apps/web/tests/redesign01-capture.mjs`, Chromium, America/Los_Angeles, with paid endpoints aborted (0 attempted).
- **Checkpoint:** commit `d8bbf20` on branch `redesign-01` holds the pre-redesign tree and the before captures.

## Side by side

| Screen | Comparison | Before | After |
| --- | --- | --- | --- |
| Explore 1440×900 | [compare](redesign-01/screenshots/compare/explore-1440.png) | [before](redesign-01/screenshots/before/explore-1440.png) · [full](redesign-01/screenshots/before/explore-1440-full.png) | [after](redesign-01/screenshots/after/explore-1440.png) |
| Explore, Animals | [compare](redesign-01/screenshots/compare/explore_topic_animals-1440.png) | [before](redesign-01/screenshots/before/explore_topic_animals-1440.png) | [after](redesign-01/screenshots/after/explore_topic_animals-1440.png) |
| Explore 1024×768 | [compare](redesign-01/screenshots/compare/explore-1024.png) | [before](redesign-01/screenshots/before/explore-1024.png) | [after](redesign-01/screenshots/after/explore-1024.png) |
| Explore 390×844 | [compare](redesign-01/screenshots/compare/explore-390.png) | [before full](redesign-01/screenshots/before/explore-390-full.png) | [after](redesign-01/screenshots/after/explore-390.png) · [full](redesign-01/screenshots/after/explore-390-full.png) |
| Home 1440×900 | [compare](redesign-01/screenshots/compare/home-1440.png) | [before full](redesign-01/screenshots/before/home-1440-full.png) | [after](redesign-01/screenshots/after/home-1440.png) · [full](redesign-01/screenshots/after/home-1440-full.png) |
| Home 1024×768 | [compare](redesign-01/screenshots/compare/home-1024.png) | [before](redesign-01/screenshots/before/home-1024.png) | [after](redesign-01/screenshots/after/home-1024.png) · [full](redesign-01/screenshots/after/home-1024-full.png) |
| Home 390×844 | [compare](redesign-01/screenshots/compare/home-390.png) | [before full](redesign-01/screenshots/before/home-390-full.png) | [after full](redesign-01/screenshots/after/home-390-full.png) |

Raw metrics: [before/report.json](redesign-01/screenshots/before/report.json), [after/report.json](redesign-01/screenshots/after/report.json).

## Measured differences

| Measure | Before | After |
| --- | ---: | ---: |
| Explore 1440 · player top / first result top | 794 px / 854 px | **111 px / 327 px** |
| Explore 1440 · page height | 2,078 px (scrolls) | **900 px** (one viewport; panes scroll) |
| Explore 1440 · player size | ≈ 418 × 234 px, read from the capture (inspector column) | **708 × 496 px** stage (measured; centre) |
| Explore 1024 · player / first result | 941 / 1,859 px | **111 / 393 px** |
| Explore 390 · player / first result | 1,194 / 2,521 px | **153 / 702 px** |
| Explore · timeline height | ~400 px card, 8 full-height lanes | ~240 px under the player; idle cameras folded into one line |
| Explore · tick hit area | 3–4 × 29 px | **24 × 24 px** |
| Home 1440 · live video top | 503 px (portrait clip, ~60% black) | **293 px** (landscape source chosen automatically) |
| Muse buttons that auto-send | 6 | **0** |
| Requests for: Ask → change camera → reload → open recording → Back | 4 `/search` (paid) | **1** `/search`, then `/index-query` (free) |

## Layouts replaced

**Explore.** Replaced: the stacked document of title + subtitle, ask bar, cost paragraph, chip row, 400px "Activity across cameras" card, a results grid of 12 cards, and a sticky inspector holding the player.

New: a single-viewport workspace.
- **Left:** results browser with chips, camera, Watch together and compact rows.
- **Centre:** dark stage, transport (camera · interval · in-recording offset · previous/next · Open in recording) and the timeline with playhead and selected band.
- **Right:** inspector (serif observation, facts, actions, What Muse saw, Around this moment, How sure, Source and footage credit, Find moments like this).
- Below 1280 px the inspector shares the side pane through a Moments/Details switch. Below 860 px: stage → transport → switch (Moments / Details / Timeline).

**Home.** Replaced: "Good afternoon.", the status line, the auto-sending "Try asking" chips, "Your everyday view / A familiar place to check in.", a portrait spotlight film, the "Recently found by Muse" list, the "Your space. Your say." card, the 2-card saved views row with "Make it your own", and the footer slogan.

New:
- "Your spaces" serif title with a factual status line.
- A local-first find field: Go for pages (free), Ask Muse · 1 request for moments.
- The live stage with a footage credit.
- A wall of every camera with honest status and moment counts; choosing one puts it on the stage.
- A journal of latest moments grouped by minute, each opening Explore with that moment selected and playing.
- Look-for topics (free).
- A saved-views strip of real-frame mosaics.

**Shell.** Removed:
- the sidebar Muse promo card;
- the duplicate workspace blocks;
- the 44px demo band, which is now an inline "Demo footage" flag;
- the footer slogan and the preview footer link (preview stays at `?preview=1`).

Changed:
- The top bar is 56 px.
- The labelled sidebar is 216 px. It becomes a 60 px rail on Explore and at ≤ 980 px.
- "Overview" is renamed "Home".

## Components changed

| File | Change |
| --- | --- |
| `src/components/screens/explore-screen.tsx` | Rewritten: workspace layout, transport, results browser, inspector without player, cached Muse reading plus free index refinement, `?moment=` selection, `run=1` handling, headings for states, preview label and indexing state kept. |
| `src/components/timeline.tsx` (new; replaces `camera-lanes.tsx`) | Compact lanes, playhead, selected band, 24px ticks with ←/→, idle cameras folded, Fit, drag-to-focus, table alternative. |
| `src/components/screens/home-screen.tsx` | Rewritten: spaces wall, landscape-preferring stage, journal, local-first find, look-for, saved-views strip. |
| `src/components/muse-panel.tsx` | Prefill-only hand-over, cost on the send button, starter prompts fill, free local shortcuts, past-tense decided turns, expired/failed states. |
| `src/components/workspace-provider.tsx` | `openMuse(query, { send })`: prefill unless explicitly sent. |
| `src/components/app-shell.tsx` | Shell simplification, workspace mode, honest palette costs, "Home" naming. |
| `src/styles/tokens.css`, `src/styles/redesign.css` (new) | New tokens and the system for the shell, Home, Explore, timeline and Muse. |
| `components.css`, `screens.css`, `integration.css`, `explore.css` | 309 selectors that no source referenced were removed (old Explore/Home/shell), about 1,550 lines. |
| `src/app/layout.tsx`, `package.json` | Self-hosted `@fontsource-variable/newsreader@5.3.0` (OFL). |
| `tests/redesign01-capture.mjs`, `tests/redesign01-flows.mjs` (new) | Capture plus 49 interaction checks with a paid-request guard. |
| `tests/video02-flows.mjs`, `tests/verify-ui.mjs` | Selectors ported to the new structure. The paid flow now presses Send explicitly after pre-filling. |

## Workflows verified (production build, real stack)

| Suite | Result |
| --- | --- |
| `node tests/redesign01-flows.mjs http://127.0.0.1:3600` | **49/49** — [flows.json](redesign-01/checks/flows.json) |
| `node tests/video02-flows.mjs http://127.0.0.1:3600 …/video02-ported` (no model) | **23/23**, 0 page errors — [flows.json](redesign-01/checks/video02-ported/flows.json) |
| `VEYRA_QA_URL=… node tests/verify-ui.mjs` (preview fixtures, API-less dev server; run from a scratch cwd so the committed `docs/design/verification` captures were not overwritten) | **passed**: 24 routes, 31 interactions, 29 axe scans, **0 violations** |
| `npm run lint`, `tsc --noEmit`, `prettier --check src tests`, `next build` | pass |

What the 49 checks cover:
- **Home:** the live stage plays above the fold; choosing a space puts it on the stage; footage credit shown; journal frames; "recordings" plus Enter navigates without Muse; a journal entry opens Explore with that moment selected; axe passes.
- **Explore:** player and first result above the fold; timeline directly under the player; the clip plays; playhead drawn; selection updates the transport; stepper works; a tick selects a visible row; 24px ticks; free topic filter; drag-to-focus and Escape; "Find moments like this" writes and doesn't send; `/` focuses the field; axe passes.
- **Muse refinement:** one Ask → one `/search`; a camera change, reload and Back → 0 further `/search`. This used a labelled local fixture for `/search` built from real index hits; nothing reached Meta.
- **Muse panel:** starter prompts fill; the cost is on the send button; local shortcuts; every Muse-flavoured button on Cameras, Saved views, Settings, Live and Recordings → **0 paid requests**; palette costs.
- **Responsive:** 0 px horizontal overflow on Home and Explore at 1280/1024/768/390; phone switch panels.

**Model spend:** 0 requests. No paid Meta call was made or attempted (the network guard counted 0 aborted paid requests). No reindexing, and no data written: the save-view and Muse-proposal paths were not executed. The genuine Muse proposal → approval flow was **not re-run** in this phase, so the new past-tense receipt rendering is verified by type-checking and code review only. Run `PAID=1 node tests/video02-flows.mjs` (≈3 requests) to see it with a real response.

## Remaining integration issues

- **:3200 still serves the old build.** I didn't restart the demo's Next process. To promote, stop it and run `npm run build` in `apps/web`, then start it the way `scripts/demo_videos.py` does, or serve `.next-qa` as above.
- **Muse refinement has limits.** It cannot apply colour or clothing attributes, and it says so (backend note 1 in the direction doc). The reading is cached per browser session, not shared.
- **The other six routes are not redesigned.** Cameras, Live, Recordings, Activity, Saved views and Settings inherit the new tokens, shell and type, but keep their VIDEO-02 layouts. Several hard-coded colours in `screens.css` predate the tokens; axe reports 0 violations, but the visual consistency is partial.
- **Timeline clustering is data-driven.** On "All moments" the window spans 12:40–8:30 AM and most moments fall at 8:09, so their ticks cluster. "Fit" appears only when moments occupy less than 60% of the axis. Drag-to-focus is the general tool.
- **Home's stage choice probes thumbnails.** It decodes each prerecorded camera's thumbnail to avoid putting portrait films on the stage (backend note 3).
- **Demo data.** QA-named saved views are still visible (operator rename needed).

## Honest assessment of originality

**What genuinely changed:** the information architecture of both screens, not their skin.
- Explore went from a scrolling report about video to a workspace *around* video. The player is centred and 3× larger, and the timeline is bound to playback by a playhead and a selected band, which the old lanes never had. The inspector explains rather than hosts.
- Home went from "greeting + widgets" to a place you can *look around* (the spaces wall) and *catch up on* (the journal).
- The serif-for-observations rule is a real semantic device, not decoration: it makes Muse's words visually distinct from the interface everywhere they appear.

**What is borrowed, honestly:** the three-pane browser/preview/inspector + timeline model is the standard grammar of media editors (Sequence, Corte and every NLE). It was chosen *because* it is familiar to anyone who has edited video. The originality is in adapting it to evidence: coverage on every result set, uncertainty wording, footage credits, a transport that states the in-recording offset, and free refinement of a paid reading. It is not in inventing a new layout.

**Still generic, or not yet good enough:**
- the topic chips are a conventional chip row;
- the sidebar is a conventional labelled list;
- the six non-redesigned routes still look like the previous product;
- the timeline, when moments cluster, still shows a lot of empty sage.

A next phase should bring Recordings (player + one merged strip) and Saved views onto the same workspace grammar.
