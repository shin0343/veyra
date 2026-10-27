# Frontend components and integration boundaries

Everything implemented in Phase 02 lives under `apps/web/`. Shared generated wire types
are imported from `@veyra/contracts`; backend schemas and routes remain unchanged.

| Component / module | Responsibility |
| --- | --- |
| `AppShell` | Sidebar (rail on Explore and ≤980px), 56px top bar with page title and demo-footage flag, preview banner, skip link. No footer. |
| `WorkspaceProvider` | Real resource loading, explicit fixture mode, local preview layouts, Muse panel state, `openMuse(text, { send })` (pre-fill unless `send`), `showTestSources` preference |
| `lib/demo.ts` | Development test-source rule: synthetic cameras, their recordings and views containing them are hidden on demo surfaces unless shown; nothing is deleted |
| `Button`, `Dialog` | shadcn/ui/Radix composition with Veyra CSS; dialogs float with a flat dim overlay (no blur) |
| `PageHeading` | Serif screen title + a line of live facts (never a slogan) + the screen's actions |
| `Badge`, `CameraStatus` | Text-bearing state; colour is supplementary |
| `StatePanel`, `ResourceState`, `Skeleton` | Distinguish loading, actual error, unimplemented, empty, offline |
| `CameraFrame` (`camera-card.tsx`) | A camera's video-derived poster, an illustration labelled as such in preview, or an honest no-preview block; never proof of live video |
| `SpaceArt` | Original vector preview illustration; always labelled and never camera evidence |
| `MediaPlayer` | Session validation/attachment, HLS/MP4, explicit media errors; no fake playback. Screens restyle it onto the dark stage |
| `EvidenceFrame` | Frame decoded from the exact evidence segment, labelled by interval |
| `Timeline` | Explore's lanes under the player: playhead, selected band, 24px ticks, drag-to-focus, table alternative |
| `ViewMosaic` | A saved arrangement drawn with real frames at saved positions (Saved views, Home, editor) |
| `LayoutEditor` | Create or edit a view: frame picker in order, columns, live mosaic preview, review step, `POST /layouts` or `PUT /layouts/{id}` with `expected_version`, receipt with version |
| `CameraPanel` (Cameras) | The opened camera: live player, status, actions, facts, views it belongs to, footage credit, settings |
| `LiveScreen` wall | Edge-to-edge tiles with one caption strip; 1 / 2×2 / 3×3 or saved arrangement; focus strip for the chosen camera |
| `RecordingsScreen` | Library (left) · player + dark transport · merged strip · moments · about/indexing/chart |
| `EventsScreen` log | Day-grouped rows (mono time · frame · serif sentence) that expand to play their evidence clip |
| `CommandPalette` | Free matches for pages, cameras and saved views; Muse options last, each stating "1 request" |
| `MusePanel` | Page-aware suggestions (fill only, labelled read vs change), cost on send, free page shortcuts, single past-tense state after a decision |
| `AvailabilityTimeline` | Recording's finalized intervals, moment markers, playhead and keyboard range control |
| `targetHref` | Exhaustive fixed route mapping; invalid IDs/offsets produce no destination |
| Frontend `/api/v1/[...path]` | Same-origin, allowlisted server adapter; credentials never enter client code |

## Routes

`/` Home; `/explore` (`?topic`, `?camera`, `?q`, `?run=1`, `?moment`); `/cameras` (`?camera=` opens a
camera); `/live` (`?camera_id=`); `/recordings`; `/recordings/{recording_id}?offset_ms={integer}&segment_id=`;
`/events`; `/layouts`; `/layouts/{layout_id}`; `/settings`. `/search` redirects to `/explore`.
Unknown routes/invalid UUIDs have a real not-found screen. Root loading/error boundaries
provide understandable recovery. The backend feature enum is unchanged; Settings is a
local application destination, not an invented tool capability.

## Data and error states

`Resource<T>` is a frontend-only loading/ready/error union; wire entities remain the
generated types. Cameras, recordings, events and layouts load independently so a failed
resource does not erase another successful response. Errors preserve request IDs internally
and show plain next-step language. No API failure silently enables fixture mode.

Fixtures use the same Camera/Recording/Layout/Event/SearchHit/AnalysisJob shapes. Sample
camera space grouping is a separate display map because the frozen Camera schema has no
space field. Real cameras use “Workspace” rather than an invented grouping. The preview
mode never performs registration, recording, cloud upload or agent execution.

## Frontend server adapter

The route handler is a frontend boundary over the existing FastAPI API, not a new backend
service. It forwards only known GET/POST/PATCH/PUT routes, supported query keys, typed JSON
bodies, idempotency keys and valid byte ranges. It rejects unknown paths and redirects.
The fixed server API origin comes only from server configuration. Origin, Host and Fetch
Metadata checks restrict browser access to the approved local origin. Auth stays server-side.
Upstream media responses preserve range/content headers; the backend still owns session
authorization, file mapping and HLS-manifest rewriting.

`WEB_ORIGIN` must match the development host/port (default localhost/127.0.0.1:3000).
`API_INTERNAL_URL` and `VEYRA_DEV_TOKEN` are server environment variables. The frontend
never requests MODEL_API_KEY and has no arbitrary URL/code/SQL tool.

## Deliberately unfinished integration

- Existing product API routes return 501 until the backend workstream implements them.
  The pages and mutation callers are present; actual camera/layout persistence is not claimed.
- HLS/MP4 attachment is implemented, but no real app media session was available in this phase.
  The earlier standalone media feasibility evidence is not a test of this new UI player.
- Muse response/confirmation/success/failure rendering follows the contract. Actual inference,
  orchestration and server authorization remain backend-owned. Isolated contract-rendering
  fixtures test these states and visibly state that they are not model output.
- Layout replacement UI (REDESIGN-02) calls `PUT /layouts/{id}` with `expected_version`; its save
  path was **not executed against the real API** during REDESIGN-02 verification (mutations were
  blocked to preserve demo data). Event pagination remains oldest-first server-side.
- Local preview views and appearance preferences are intentionally session/tab-local.
- Public deployment still requires actual user sessions and hardened authorization beyond
  the single-operator local boundary. This phase does not change that architecture decision.

## Verification commands

```sh
npm run lint --workspace @veyra/web
npm run typecheck --workspace @veyra/web
npm run build
WEB_ORIGIN=http://127.0.0.1:3100 npm run start --workspace @veyra/web -- --port 3100
npm run qa --workspace @veyra/web
```

The QA script uses Playwright and axe, writes screenshots and a machine-readable report
under `docs/design/verification/`, and fails on overflow, interaction failures, browser errors
or audited WCAG A/AA issues. See `VERIFICATION.md` for actual executed results and limits.
