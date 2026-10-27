# Claude handoff

Follow [AGENTS.md](AGENTS.md) as the shared engineering agreement.
Own `apps/web/` and product UX/design/accessibility. Follow [DESIGN.md](DESIGN.md) for all visual and interaction decisions. Read `docs/HANDOFF.md` and the frozen v0.1.0 contract in `docs/architecture/API_CONTRACT.md` first.
Import wire types from `@veyra/contracts`; use server-side API access in `src/lib/api.ts`. Keep credentials on the server.
Create a calm, legible, keyboard-accessible VMS with honest loading, empty, offline, permission and failure states. Do not fabricate working feeds or AI results.
Implement against contract types; contract-only routes deliberately return 501 until Codex delivers their service implementations. Coordinate contract changes before changing shared interfaces.
