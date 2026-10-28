# Final security review — release candidate

Scope: the release diff after checkpoint `65e4a80`, the built bundles and the running canonical
stack. Earlier review: [SECURITY_REVIEW](SECURITY_REVIEW.md).

| Check | Result |
| --- | --- |
| `MODEL_API_KEY` value in git-tracked/untracked files, `.next`, `.next-rc`, `docs/`, demo video folder, 119 runtime logs | **0 occurrences** (scanned by value, never printed) |
| Operator bearer token in git files / browser static assets / HTML | **0** |
| Browser bundles referencing `MODEL_API_KEY` | 0 of 33 |
| `.env`, `runtime/`, build dirs ignored by git | yes (`git check-ignore`) |
| Listening sockets of the canonical stack | all `127.0.0.1` (web, API, PostgreSQL, MediaMTX) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Python dependency audit | **NOT TESTED** (`pip-audit` not installed) |

## Changes reviewed

- **Locking change** keeps authorization, idempotency and audit paths untouched; delete-vs-save
  serialization and disabled-camera checks are covered by tests.
- **Live test launcher** (`final_rc.py --live-muse-requests N`): reads the key from the private
  `.env` without printing it, refuses `N > 4` and refuses to combine with the scripted provider,
  sets a hard per-day request cap and reservation budget on a disposable database, and starts no
  indexing worker. The live browser script refuses to run unless the server reports cap ≤ 4 and
  an empty ledger, blocks analysis/index jobs and non-local origins, and never retries.
- **Scripted provider** (`final_fixture_api.py`) still refuses to start with a real key or
  outside the `veyra_final_qa` database; it uses `httpx.MockTransport` (no network).
- Agent safety rules are unchanged: allowlisted typed tools, server-side confirmation, no
  model-provided code/SQL/URLs, untrusted video-derived text.

## Residual risks

Local single-user design; not for public exposure. Docker egress firewall, TLS and multi-user
grants remain outside the verified scope (see [KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md)).
