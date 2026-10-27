# Phase 08 — final polish and release readiness

October 27, 2026 (UTC). Frontend owner (Claude). Only `apps/web/**` and documentation were
edited. No backend, contract, migration, script or infrastructure file changed; frozen and
runtime contract checks still match. No commit, push, deployment or external message.

**Verdict: ready for the hackathon demonstration on the native setup**, using the rehearsed
flow in [DEMO_GUIDE](../demo/DEMO_GUIDE.md). Open gates from Phase 07 (Docker/Linux egress,
physical cameras, broader evaluation, billing) are unchanged.

## How the audit was done

The real application was launched: production build, `runtime/demo` native stack (current
backend code, migrations 001–005), separate worker, genuine Meta. Eight routes were captured at
desktop 1440, tablet 820 and phone 390 widths; the Muse panel, command bar, connect dialog,
proposal/approval/decline, search, evidence playback and indexing were driven in Chromium.

The pre-existing `runtime/vms-dev` stack turned out to run **pre-Phase-07 API code** (started
before the Phase 07 fixes; migration 005 not applied). Genuine Muse search there failed four
times with `INVALID_TOOL_ARGUMENTS`. Stopping that stack was not permitted from this session, so
a fresh `runtime/demo` stack was started instead; all results below come from it unless noted.

## What changed and why

Universal command and Muse

- ⌘K is now a real command interface. Typing offers **Ask Muse: "…"** and **Search your video
  for "…"** as keyboard-selectable options next to matching pages. A sentence defaults to Muse; a
  word or two defaults to the page. Previously Enter on a sentence opened an unrelated page.
- Starter prompts (overview chips, Muse welcome, Saved views "Plan with Muse") are built from the
  workspace's real camera names. Vague prompts were observed to end after only `cameras.list`.
- A completed run that only read data now says **Nothing was changed** with advice, and its
  badge reads "Read your workspace" instead of implying an answer.
- Declining a proposal is shown as a neutral **Declined · nothing changed** with the server's
  receipt, not as a red failure. The turn badge updates after approve/decline (it previously
  stayed "Waiting for your approval" next to "Saved and verified").
- Proposal card warns when a saved view with the same name already exists.
- Identical repeated errors are grouped ("happened 4 times"). A failed `video.search` step
  offers **Search your video for these words** with the same stored index.
- Muse search moments are labelled with the real camera and wall-clock time derived from the
  workspace recording, instead of six identical "Play matching footage" rows.
- Receipt display: raw milliseconds become durations and a sentence repeating an earlier one is
  shown once. Text is otherwise verbatim (`src/lib/receipts.ts`); also applied to Search.

Screens

- Overview plays the live feed of the online camera with the most recent activity (previously a
  blank "Open live view to watch" box chosen from the first, possibly offline, camera). Recent
  moments prefer Muse observations and label kind; the misleading parcel icon is gone.
- Activity/Recordings/Overview: motion events read **Movement detected** with the server summary
  as detail; observation icon changed; histogram summary uses durations and says "analyzed by
  Muse"; the 24 h chart defaults to the camera with the latest activity.
- Recording moments: Muse observations first with a filter, eight shown, "Show all N moments".
  It was an unbounded list (100+ rows, mostly motion samples).
- Indexing panel: "clips" instead of "segments"; stale failure copy (Phase 07 changed the backend
  so unattempted clips remain waiting) rewritten; per-clip counts refresh as the job advances; a
  failed poll is shown and retried, and the next success clears it (previously the error stuck
  and counts stayed at "0 of 30" while progress reached 90%).
- Settings: "Not verified / Service connection required" replaced with the real recording count
  and an honest retention statement.
- Pillarbox bars behind video are black, prompt chips wrap left-aligned on phones.

No design tokens, typography scale or navigation structure changed.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint --workspace @veyra/web` | passed, zero warnings |
| `npm run typecheck --workspace @veyra/web` | passed |
| `npx prettier --check src tests` (apps/web) | passed |
| `npm run build --workspace @veyra/web` | passed |
| `make contracts-check` | frozen + Phase 05 runtime artifacts match |
| `tests/verify-ui.mjs` (preview fixtures, API-less server) | passed: 24 route/viewport checks, 30 interactions, 29 axe scans, **0 violations** |
| `tests/live-flows.mjs` FLOWS=2,4,7,8 (real stack) | **all passed**: playback 295 ms first frames; Muse feature nav 3.3 s; failure states; 16 phone/tablet pages without overflow; 10 axe scans, 0 violations ([evidence](evidence/phase08/live-flows/report.json)) |
| `tests/demo-walkthrough.mjs` (genuine Muse) | passed end to end in 44.4 s, zero page errors ([screenshots](../demo/screenshots/)) |
| Consented indexing through the UI | job succeeded, 30/30 clips, 885.8 s processing, two automatic retries |
| Genuine decline flow | neutral receipt "The proposed layout was declined. No layout was created." |

Not run in this phase: `make check` backend suite, agent/index live smokes, Phase 07 full
acceptance (no backend change was made). Flows 3, 5, 6, 6i were not rerun against the demo
workspace to avoid layout clutter; the walkthrough covers Muse layout and search instead.
`verify-ui.mjs` regenerated `docs/design/verification/*.png` and `report.json`; Phase 06
real-stack evidence was preserved.

Regressions found and fixed during verification: the decline copy change initially hid the
server receipt and failed `verify-ui.mjs`; restored. The walkthrough's first search capture
matched loading skeletons; the wait condition was corrected and recaptured.

Ledger for the demo database at the end: 80 logical model requests, 310,662 input / 98,088 output
tokens, 14.5 MB uploaded, **$4.00 reserved of the $5 daily admission ceiling** (UTC day; estimate,
billing unknown). Further rehearsal today may be refused by budget admission.

## Unresolved defects for Codex (backend)

1. **Vague action requests end silently.** Genuine Muse called only `cameras.list` and returned
   `completed` "Found 3 cameras." for "Make a 2×2 view of all my cameras called Family room", an
   explicit three-camera 2×2 request, and "Find a person riding a bicycle". Requests naming real
   cameras succeed. Surface the validated final model text or a `needs_clarification` status
   (Phase 06 issue 6, still open). The UI now says "Nothing was changed".
2. **Conversation context replayed a mutation (pre-Phase-07 API).** On `runtime/vms-dev`, a
   follow-up "Find a person riding a bicycle on the trail camera" in the same conversation called
   `layouts.create` again with the previous arguments; approving produced a second "Demo home"
   (rows created 07:43:30 and 07:43:36 UTC; approved by the test script, not a real person).
   Not reproduced on current code in one attempt. Please check history construction so earlier
   tool calls are not re-proposed. The UI now warns on duplicate names.
3. **Decline is reported as `status: "failed"` + `USER_DECLINED`.** It is a successful human
   decision; a `completed`/`declined` status would avoid client special-casing.
4. **Receipt text** contains raw milliseconds and duplicated joined sentences (Phase 06 issue 5).
   Search `explanation` has the same milliseconds. The UI reformats for display only.
5. **Muse `video.search` returns navigation only** (Phase 06 issue 4): no caption, wall time or
   coverage in `AgentResponse`. The UI derives camera/time from workspace recordings.
6. **Indexing throughput.** About 30 s of processing per 10 s clip in this run (885.8 s for 30),
   16 min wall time, with `MODEL_UNAVAILABLE` and `INVALID_MODEL_OUTPUT` retries. It succeeded,
   but pre-index well before a demo. A continuous recording needs repeated 30-clip consents.
7. **Stale dev stack.** `runtime/vms-dev` API must be restarted with migration 005 to reflect
   Phase 07 fixes. The servers on :3000 and :3100 predate this build and must be restarted to
   serve it.
8. The workspace event list is capped at 100 (`/events?limit=100`), so a recording's "All moments"
   count saturates at 100. Per-recording event queries would make it exact.

## Remaining frontend limitations

Layout edit/delete UI, recording pagination beyond 100, and job list/cancel remain unbuilt.
The command bar's sentence/word heuristic is simple. Muse panel copy is English-only.
