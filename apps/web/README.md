# Veyra frontend

The Next.js application. Read `../../docs/design/` and the root engineering agreement before
editing. Backend and generated contracts are owned by the API workstream.

## Wire types

Runtime types come from the API owner's generated Phase 05 file
`docs/architecture/api-phase05.d.ts`, imported through the `@veyra/runtime-contract` alias in
`tsconfig.json` (see `src/lib/types.ts`). The frozen v0.1.0 `@veyra/contracts` package is not
edited. When the backend regenerates its runtime artifacts, rerun `npm run typecheck`.

## Server-side adapter

`src/app/api/v1/[...path]/route.ts` is the only path to the API. It allowlists routes, validates
request bodies with zod, attaches the server-only `VEYRA_DEV_TOKEN`, forwards idempotency and
range headers, and preserves the API's error body and `X-Request-ID`. Upstream timeouts are
70s for Muse agent calls (the backend run budget is 60s), 60s for natural-language search, 30s
for media/playback preparation and 15s otherwise. `MODEL_API_KEY` is never read by the web
app; it lives only in the API/worker environment.

## Run against the real stack

From the repository root, after `make install` and with a private `.env` holding the Meta
key and positive model budgets:

```sh
.venv/bin/python -E scripts/vms_native.py --mediamtx /absolute/path/to/mediamtx --runtime runtime/vms-dev
npm run build
node --env-file=runtime/vms-dev/web.env node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1
# Video indexing needs the worker, pointed at the same database and recordings directory:
DATABASE_URL=… RECORDINGS_ROOT=$PWD/runtime/vms-dev/recordings .venv/bin/python -E services/worker/main.py
```

Open `http://localhost:3000`. Default pages read the real service. Missing service, 501 or
dependency responses are shown with their code and request reference; sample data never
becomes an implicit fallback. `?preview=1` opens the explicitly labeled sample workspace,
whose Muse panel is a local feature guide that says it is not Muse.

## Checks

```sh
npm run lint --workspace @veyra/web
npm run typecheck --workspace @veyra/web
npm run build
```

- `tests/verify-ui.mjs` — preview-fixture layout/accessibility QA on port 3100
  (`npm run qa --workspace @veyra/web`).
- `tests/live-flows.mjs` — real-stack acceptance (no mocks): recorded playback and histogram
  navigation, UI layout creation, Muse feature navigation, Muse layout proposal → approval →
  verified layout, consented indexing, natural-language search → exact evidence playback,
  and failure states. Run from `apps/web` with the stack above:
  `VEYRA_QA_URL=http://127.0.0.1:3000 FLOWS=2,3,4,5,6i,6,7 node tests/live-flows.mjs`.
  Flow `6i` and `6` spend real Muse requests. Screenshots and `report.json` go to
  `docs/design/verification/phase06/`.
- `tests/demo-walkthrough.mjs` — the continuous Phase 08 demo on the real stack (overview, cameras,
  live, ⌘K → Muse layout approval → verified view, Muse search → exact evidence, search, context
  pages). Spends genuine Muse requests and saves one layout; set `LAYOUT` to an unused view name.
  `VEYRA_QA_URL=http://127.0.0.1:3000 node tests/demo-walkthrough.mjs` writes
  `docs/demo/screenshots/`.
