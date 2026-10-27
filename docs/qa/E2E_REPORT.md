# Phase 07 integration and reliability report

Executed October 27, 2026 UTC. This is a local, single-operator hackathon MVP assessment.
The final execution record and command logs are linked below. Historical failures are retained
in timestamped `evidence/` directories; they are not converted into successful runs.

Related: [security](SECURITY_REVIEW.md), [performance](PERFORMANCE.md),
[limitations](KNOWN_LIMITATIONS.md), [release checklist](RELEASE_CHECKLIST.md).

## Scope and conditions

macOS arm64; Python 3.12.14; PostgreSQL 15.19; Node 22.23.1; Next 16.4.3;
Playwright 1.64.1 Chromium; MediaMTX 1.21.3; FFmpeg/FFprobe 8.0.1.
Production Next builds use the real same-origin adapter, FastAPI, isolated PostgreSQL,
MediaMTX and a separate indexing worker. Three RTSP publishers use synthetic testsrc2;
one replays the bundled licensed Henry Geer cycling clip. Synthetic video is transport
evidence only. Genuine Meta tests use `muse-spark-1.3` and the existing private credential.

## Required scenarios

| Scenario | Executed evidence |
| --- | --- |
| A: camera lifecycle | Approved source registration, duplicate registration replay, four observed online RTSP sources, advancing HLS, at least 60 seconds of recording, MP4 Range 206, 52-second playback and five-second UI seek. A 600 ms delay of actual camera metadata verifies a single initial playback export. |
| B: agentic navigation | Genuine Muse feature discovery → Cameras link → `/cameras`; named-camera request → `/live?camera_id=<actual Front entrance UUID>`. Both links are clicked in Chromium. |
| C: agentic execution | Genuine Muse proposes an ordered four-camera, two-column layout; row absent before approval; explicit approval; read-after-commit verification; exact cell IDs; actual layout route; four tiles; reload and database restart preserve it. |
| D: video search | UI consent → actual worker upload/inference/delete → persisted observations; three natural-language queries; matching camera/recording/segment; real MP4 playback from exact evidence; timestamp mapping checked. |
| E: failure/security | Actual offline stream, missing/invalid bearer, viewer write denial, absent recording, empty query/no-match, cross-origin and unknown proxy path; actual database outage and restart. Additional transport/model/attack cases below. |

The expanded Muse `video.search` test separately checks that assistant navigation retains
`segment_id`. Its earlier live failures are part of the reliability evidence, not hidden by
the passing direct search page. See the final run and known limitations for its final status.

## Failure and security coverage

| Case | Execution boundary |
| --- | --- |
| Camera offline, disconnect/reconnect, codec rejection | Real FFmpeg publishers and MediaMTX; H264 recovery after interruption and HEVC rejection. |
| Invalid RTSP and unapproved/internal/metadata destinations | Actual source-policy/registry unit calls; unsafe literal IPs, DNS, schemes and ports rejected before network access. Linux packet-filter execution and physical-camera redirects remain unverified. |
| Missing/invalid credentials; unauthorized writes/tools | Real HTTP 401/403 and resource/session ownership checks; scripted hostile model calls exercise the real dispatcher and database. |
| Prompt injection in external metadata | Real persisted indexed metadata contains an explicit hostile instruction; scripted model attempts an unavailable approval tool. Tool data stays in a tool-role message; no layout or confirmation is created. This verifies enforcement, not universal model resistance. |
| Model timeout / invalid JSON / invalid observation | Scripted HTTP timeouts, refusals, malformed JSON and rejected observations; real strict validators, queue, reservations, file cleanup and bounded attempts. Live observation rejection was also reproduced. |
| Missing recordings/segments/directories | Real 404/409, deleted files and entire recording directory; unavailable media excluded from retrieval; preserved recording state checked. |
| Duplicate mutations and approvals | Durable idempotency replay/conflicts, concurrent approvals, exact one-row effects and audit records against actual PostgreSQL. |
| Database restart | Actual process stop → readiness 503 → restart → readiness 200; camera, layout, recording and metadata IDs preserved. Separate media suite also restarts the API and reuses playback. |

## Corrections made

- QA-001: classify output truncation separately; retry specified observation-validator rejections
  within the existing three-attempt lease budget; publish only validated output; keep unattempted
  clips waiting with no borrowed failure code. Persistent rejected observations remain failures.
- QA-002: application Muse turns share the durable video/search request and reservation ceiling;
  record Chat Completions token usage; add migration `005_agent_usage` and require it for readiness.
- QA-003: include the generated runtime type file in web image inputs. The previous missing-file
  compiler failure was reproduced and corrected inputs typecheck; Docker execution is unverified.
- QA-004: hydrate recording timezone text consistently when browser and server zones differ.
- QA-005: preserve exact segment context through search, activity, Muse receipts and route mapping.
  Frozen v0.1.0 artifacts remain unchanged; current runtime artifacts were regenerated.
- QA-006: recorded playback no longer repeats an export when camera details arrive asynchronously.
- QA-007: optional unspecified Muse search filters now match REST defaults; explicit malformed
  sentinel strings remain invalid. Safe validation feedback identifies declared fields only.
- Correct obsolete media-suite `501` expectations; explicitly disable cloud calls in that suite.
  Browser evidence uses fresh reports and explicit contexts; failures retain their own timestamps.

## Reproduction

From the repository root, with locked dependencies, Chromium, PostgreSQL binaries,
FFmpeg/FFprobe, MediaMTX and private server configuration already installed:

```sh
make check
make contracts-check
npm run lint --workspace @veyra/web
npm run build
make meta-smoke
make agent-live-smoke
make index-live-smoke
.venv/bin/python -E scripts/vms_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx
.venv/bin/python -E scripts/phase07_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx
.venv/bin/python -E scripts/check_web_image_context.py
.venv/bin/python -E scripts/phase07_security_scan.py
docker compose config --quiet
docker compose --profile fixture up --build --wait
```

The Phase 07 runner writes a new `docs/qa/evidence/<UTC timestamp>/system.json`,
`browser.json` and screenshots on every run, exits nonzero on failure, and stops its own
services. Private database, connection details and video stay in ignored `runtime/q7/`.
It never uses the normal development database. Each isolated database has its own budget
ledger; this is not an account-wide billing limit. Commands with genuine Meta access incur
provider usage; absent credentials are blocked/skipped and cannot pass the live gate.

Docker commands were attempted and exited 127 (`docker` absent). Neither Compose startup
nor Linux firewall execution is reported as passed. Initial sandboxed integration setup also
failed because `shmget` was denied; the actual database runs used permitted local process access.

## Final command results and readiness

Final fresh run: **passed**, including all A–E cases, manual comparison, expanded Muse exact-segment
search/playback and responsive checks. Raw [system report](evidence/20261027T072125917447Z/system.json)
and [browser report](evidence/20261027T072125917447Z/browser.json). Eight browser cases passed,
12 route/viewport checks passed, four axe scans found zero violations, zero page errors.
Actual database outage returned 503; restart retained 4 cameras, 2 layouts, 4 recordings and
6 metadata rows. Inspect [recorded seek](evidence/20261027T072125917447Z/A-recording-seek.png),
[persisted layout](evidence/20261027T072125917447Z/C-persisted-layout.png) and
[grounded footage](evidence/20261027T072125917447Z/Muse-exact-segment-playback.png).

| Exact command | Result / evidence |
| --- | --- |
| `make check` | **exit 0**, 162 passed / 1 skipped; Ruff, frontend typecheck, frozen/runtime contracts passed. [Log](evidence/checks/make-check.log). Includes unit and actual PostgreSQL/media integration tests; most provider calls scripted, one genuine agent test executes with the available key. |
| `make contracts-check` | **exit 0**, frozen and regenerated runtime artifacts match. [Log](evidence/checks/contracts.log). |
| `npm run lint --workspace @veyra/web` | **exit 0**, zero warnings. [Log](evidence/checks/frontend-lint.log). |
| `npm run build` | **exit 0**, production Next build. [Log](evidence/checks/production-build.log). |
| `.venv/bin/python -E scripts/foundation_smoke.py` | **exit 0**, clean migrations/reapply, FK/SQL-only FTS fixture, readiness and production Next→API. [Log](evidence/checks/foundation.log). No model inference. |
| `make meta-smoke` | **exit 0**, genuine model catalog/text/JSON/read-only function loop. [Log](evidence/checks/meta-smoke.log). |
| `make agent-live-smoke` | **exit 0**, 65 passed / 0 skipped, including 1 genuine Muse layout test; remaining provider scenarios scripted. [Log](evidence/checks/agent-live.log). |
| `make index-live-smoke` | **exit 0**, 30 passed, including 1 genuine video evaluation with 6/6 expected-result queries; then separate scripted-native and genuine-native RTSP→index→search→MP4 runs both passed. [Log](evidence/checks/index-live.log), [snapshot](evidence/checks/index-live.json). |
| `.venv/bin/python -E scripts/vms_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx` | **exit 0**, actual media/Chromium failure and recovery suite; model credential explicitly disabled. [Report](evidence/checks/vms-smoke.json). |
| `.venv/bin/python -E scripts/phase07_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx` | **exit 0**, fresh genuine full-system browser demo plus database restart. [Log](evidence/checks/demo.log). |
| `.venv/bin/python -E scripts/check_web_image_context.py` | **exit 0**, old missing-contract failure reproduced; corrected staged inputs typecheck. [Result](evidence/checks/web-image-inputs.json). Native check only. |
| `.venv/bin/python -E scripts/phase07_security_scan.py` | **exit 0**, no known credentials in committable files/static bundles. [Result](evidence/checks/secret-scan.json). |
| `npm audit --json --cache .cache/npm` | **exit 0**, zero reported npm vulnerabilities. [Result](evidence/checks/npm-audit.json). |
| `docker compose config --quiet` | **exit 127 / blocked**, Docker absent. [Evidence](evidence/checks/docker.txt). |
| `docker compose --profile fixture up --build --wait` | **exit 127 / blocked**, Docker absent; no container smoke success claimed. |

The normal suite deliberately skips the separately invoked genuine video evaluation; it ran
successfully in `make index-live-smoke`. Initial failed regression tests and failed live runs
are retained, including observation rejection, the export race and Muse argument failures.
No performance improvement or universal model reliability is inferred from the final pass.
An explicit [coordinator failure injection](evidence/checks/coordinator-fault.json) also verifies
that an exception during cleanup records failure and exits 1, even after scenarios completed.

**Readiness:** ready for final UX polish and rehearsal on this verified native setup.
Docker/Linux firewall, physical cameras, broader quality evaluation and actual billing remain
open. No push, deployment or public exposure was performed.
