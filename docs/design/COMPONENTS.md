# Frontend components and integration boundaries

Everything implemented in Phase 02 lives under `apps/web/`. Shared generated wire types
are imported from `@veyra/contracts`; backend schemas and routes remain unchanged.

| Component / module | Responsibility |
| --- | --- |
| `AppShell` | Persistent sidebar/header/footer, responsive navigation, preview banner and skip link |
| `WorkspaceProvider` | Real resource loading, explicit fixture mode, local preview layouts, Muse panel state |
| `Button` | Selective shadcn/ui composition using Radix Slot and cva; Veyra CSS variants |
| `Dialog` | Selective shadcn/ui/Radix structure, named description, focus trap/open/restore and Escape |
| `PageHeading`, `SectionTitle` | Consistent hierarchy, descriptions and task actions |
| `Badge`, `CameraStatus` | Text-bearing state; color is supplementary |
| `StatePanel`, `ResourceState`, `Skeleton` | Distinguish loading, actual error, unimplemented, empty, offline |
| `CameraCard`, `CameraVisual` | Camera context, connection state, privacy and useful actions |
| `SpaceArt` | Original vector preview illustration; always labeled and never camera evidence |
| `MediaPlayer` | Actual session validation/attachment, HLS/MP4, explicit media errors; no fake playback |
| `CommandPalette` | Local destination search, arrow selection, Enter navigation and Escape |
| `MusePanel`, `ActionReceipt` | Real contract request/results and separate local guide; bound confirmation decisions |
| `AvailabilityTimeline` | Finalized intervals, event markers, requested offset and keyboard range control |
| `SearchResult` | Source text, camera/time/provenance and safe typed playback destination |
| `targetHref` | Exhaustive fixed route mapping; invalid IDs/offsets produce no destination |
| Frontend `/api/v1/[...path]` | Same-origin, allowlisted server adapter; credentials never enter client code |

## Routes

`/` overview; `/cameras`; `/live`; `/recordings`; `/search`; `/events`; `/layouts`;
`/settings`; `/layouts/{layout_id}`; `/recordings/{recording_id}?offset_ms={integer}`.
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
- Camera space grouping, event pagination, indexing-job creation/polling and layout replacement
  UX are not complete. Settings offers guidance instead of inventing unavailable global APIs.
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
