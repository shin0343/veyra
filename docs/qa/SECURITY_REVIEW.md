# Phase 07 security review

Scope: source review plus executed local boundary/integration/browser tests, October 27, 2026 UTC.
This is not a penetration-test certification or a public multi-user deployment approval.

## Verified controls

| Boundary | Evidence |
| --- | --- |
| Camera admission / SSRF | Browser and Muse accept approved source IDs; server policy rejects DNS, loopback, link-local/metadata, multicast, reserved/unapproved addresses and unsupported ports. Pull configuration requires a matching egress manifest. Unit tests execute the policy and generated firewall rules. |
| API authorization | Missing/invalid bearer gets 401; viewer mutation gets 403; principal-owned playback/confirmation/conversation tests reject another principal. Host bindings are loopback. |
| Browser adapter | Actual cross-origin request rejected with 403; unknown path rejected with 404; typed request shapes, fixed API origin and manual redirect handling; credential stays server-side. |
| Media | Opaque principal-bound sessions, expiry, fixed-origin rewritten manifests, path/symlink rejection, real Range handling and missing-byte reconciliation. |
| Agent authority | Typed allowlist, permission checks, bounded turns/tools/deadline, server-bound expiring single-use approval, revalidation at commit, idempotent mutation/audit and read-after-commit verification. No shell, SQL, HTTP or model-approved confirmation tool. |
| Untrusted metadata | Scripted hostile calls after reading real persisted injected metadata cannot add a tool or approve. No unsafe mutation; metadata remains tool-role data. |
| Model output | Refusal/JSON/schema/timestamp/unsupported-inference rejection; no invalid metadata published. Only bounded, budgeted retries; consent rechecked before transfers and publication. |
| SQL / storage | Parameterized retrieval, PostgreSQL grounding/foreign-key constraints, atomic mutation/idempotency records and actual database persistence after restart. |

The known Muse budget bypass is fixed: default application chat turns now reserve and finish
usage through the same durable meter as analysis/search. Migration `005_agent_usage` must be
applied before starting the updated API. A scripted actual-database regression proves a second
turn cannot pass an exhausted budget or issue HTTP. Failed and unknown-cost calls retain their
reservations. These are configured admission estimates, not a guarantee about provider charges.

Schema failures log only fixed rule identifiers and declared field names. Rejected argument
values, unknown field names, provider bodies, SQL, camera credentials and private keys are not
logged. The adapter preserves sanitized request references for failure diagnosis.

## Secret and dependency checks

`scripts/phase07_security_scan.py` scans committable files and production browser bundles for
known private project/QA credentials, and checks that `MODEL_API_KEY` is absent from static
bundles. It prints counts and matching paths only. The exact result is in
`evidence/checks/secret-scan.json`; private `.env` mode is checked separately. This is exact-value
scanning, not a claim to discover every unknown secret.

`npm audit --json --cache .cache/npm` completed against the live advisory registry and reported
zero vulnerabilities for the installed lockfile (475 dependency entries). The first sandboxed
network attempt failed DNS; that attempt is not called a clean audit. No Python advisory,
container-image vulnerability or operating-system audit is claimed.

## Remaining boundaries

- Docker/Linux egress enforcement and physical RTSP authentication/redirect behavior have not
  executed on this machine. Static firewall-policy tests are not packet-filter verification.
- Shared local operator/viewer tokens and a loopback adapter are the agreed MVP boundary.
  Public deployment needs user sessions, TLS, CSRF/resource grants and deployment hardening.
- Model behavior remains nondeterministic. The metadata attack test proves enforcement for
  the attempted forbidden tools, not that prompt injection cannot influence model prose.
- Budget ledgers are per database and count logical calls; a bounded transport retry may issue
  another HTTP attempt. Billing, cross-database/account-wide spend and provider retention are
  not independently verified. Provider-file cleanup and expiry are requested and recorded.
- Browser persistence, an operator-controlled recording store and one API process are assumed;
  no high-availability or hostile-host storage claim is made.

Meta documents that a function tool's `strict` flag validates its schema; it does not by itself
guarantee schema-conforming tool arguments. Server validation therefore remains mandatory.
[Meta tool-calling documentation](https://dev.meta.ai/docs/tool-calling).
