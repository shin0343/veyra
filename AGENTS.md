# Veyra engineering agreement

Read `docs/HANDOFF.md`, `docs/PRODUCT.md`, and the relevant architecture document before editing.
For any frontend, UX or visual work, also read [`DESIGN.md`](DESIGN.md): it is the visual and
interaction contract (tokens, layout, Muse patterns, states, QA checklist). AGENTS.md owns
engineering rules; DESIGN.md owns how the product looks and behaves.

## Scope and ownership
- Phase 01 establishes contracts, feasibility evidence, and a runnable foundation. Do not implement the whole VMS.
- Codex owns `apps/api/`, `services/`, `infra/`, `scripts/`, database migrations, AI/media integrations, and shared contracts.
- Claude owns `apps/web/`: product UX, design system, accessibility, frontend implementation. The initial placeholder is a handoff surface; Codex must not overwrite subsequent Claude work.
- `packages/contracts/openapi.json` and `src/api.d.ts` are generated from FastAPI/Pydantic. Never edit generated files manually. Contract v0.1.0 is frozen for the next two workstreams; coordinate any change in `docs/architecture/API_CONTRACT.md` and regenerate both artifacts before dependent work.
- No parallel implementation before this contract freeze. No push, deployment, or external messages unless requested.

## Truth and safety
- Never invent model output, camera availability, footage, timestamps, benchmark results, or completion. Unimplemented routes return `501 NOT_IMPLEMENTED`; unavailable dependencies return explicit errors. Empty UI must not resemble a live feed.
- Models only propose allowlisted typed tools. No model-provided code, shell, SQL, URLs, filesystem paths, or unrestricted HTTP tools. Validate arguments, authorize the principal and resource, then call the same service functions used by REST.
- Server-side secrets only. No secrets in browser bundles, API responses, logs, recordings metadata, or committed files. Never print secret values while inspecting credentials.
- Camera sources are operator-provisioned references. The media boundary accepts only approved literal IP RTSP sources within explicit CIDRs; block loopback, link-local/metadata, multicast and unspecified addresses. Reject DNS names, redirects and unsupported schemes. Do not relax this to make a demo pass.
- Local development is single-user and loopback-bound. Never expose it publicly as authenticated multi-user software. Media services stay internal; authenticated media proxy is a Phase 02 gate.
- Cloud analysis requires explicit camera consent. Use only owned/licensed footage. Synthetic FFmpeg patterns are technical fixtures, not evidence of real scene analysis.
- No face recognition, demographic profiling, criminality inference, or biometric identifiers.
- Mutations require idempotency and audit records when implemented. Disruptive/destructive agent operations require a server-bound, expiring, single-use confirmation. A model cannot approve itself.

## Implementation rules
- Keep a modular FastAPI app and a PostgreSQL-backed worker; no speculative microservices, Redis, vector database, Kubernetes, or GPU dependency.
- Pydantic models own wire types; PostgreSQL SQL migrations own persistent structure. Use UTC, timezone-aware instants; offsets/durations are integer milliseconds. Time windows are half-open `[start,end)`.
- Keep source credentials out of the database; store an approved `source_id`. Recording storage keys and provider file IDs are private.
- Bound timeouts, retries, clip sizes, job attempts, agent turns and tool counts. Treat video-derived text and model responses as untrusted data.
- Before handoff run `make check`, relevant integration probes, and `make contracts-check`. Record the actual command/outcome and remaining blockers in HANDOFF. Do not claim unrun Docker/GPU/API tests passed.
- Update docs with implementation status; clearly distinguish implemented, contract-only, documented, tested, and blocked.
