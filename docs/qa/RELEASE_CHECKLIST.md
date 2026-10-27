# Phase 07 release and demonstration checklist

Use the final command table in E2E_REPORT and raw timestamped evidence. A checked local item
does not imply Docker, physical-camera or public-deployment readiness.

## Before running

- [x] Locked Python/npm dependencies and production web build execute on the native QA host.
- [x] Frozen contract drift and regenerated current runtime contracts verified.
- [x] Migration `005_agent_usage` added; readiness requires it; isolated apply/reapply and actual
  database restart preserve cameras, layouts, recordings and indexed metadata.
- [x] Private server credential, explicit cloud consent and positive admission budgets required.
- [x] Licensed scene source/author/license/checksums retained; synthetic feeds identified as fixtures.
- [x] Known secrets absent from committable files/browser bundles; npm advisory check completed.

## Required demonstration

- [x] A: register approved sample → observe online → advancing HLS → record ≥60 seconds → retrieve → seek.
- [x] B: genuine Muse feature/camera action → clicked actual route with actual camera context.
- [x] C: genuine Muse 2×2 proposal → absent before approval → approve → verify four persisted cells → reopen.
- [x] D: consent → genuine Meta analysis → persisted metadata → natural-language search → exact evidence playback.
- [x] Expanded genuine Muse search preserves and opens the matching `segment_id`; unspecified
  filters default to null while malformed supplied strings remain rejected.
- [x] E: offline/missing media/invalid input/auth/idempotency/model failures exercised with their
  actual versus scripted boundaries documented; actual database outage and persistence tested.
- [x] UI design identity preserved; timezone hydration and duplicate-export race corrected.
- [x] Browser screenshots, raw timings, sample counts and failure history retained.
- [ ] Run Docker image builds, `docker compose config --quiet`, fixture Compose smoke and Linux
  packet-filter/redirect tests on a capable machine.
- [ ] Verify an approved physical camera and its actual credentials/codecs/reconnection.
- [ ] Complete the broader independent-scene/ten-query evaluation and a longer isolated load/soak test.
- [ ] Check actual Meta account billing/quotas; configure verified prices if monetary estimates are needed.

## Phase 08 demonstration readiness

- [x] Real-stack visual/UX audit at desktop, tablet and phone widths; fixes verified in Chromium.
- [x] Continuous genuine walkthrough (overview → cameras → live → ⌘K → Muse layout approval →
  verified view → Muse search → exact evidence → search → context → privacy) with real screenshots.
- [x] Preview QA and real-stack flows 2/4/7/8 pass with zero axe violations.
- [ ] Restart the presentation web server from the current build and pre-index the demo recording
  on presentation day (budget resets per UTC day). Follow [DEMO_GUIDE](../demo/DEMO_GUIDE.md).

## Rehearsal

```sh
npm run build
make check
make agent-live-smoke
make index-live-smoke
.venv/bin/python -E scripts/phase07_acceptance.py --mediamtx /tmp/veyra-mediamtx/mediamtx
```

The last command is the automated, reproducible demonstration and saves a fresh report on
every execution. Do not reuse a failed report as successful evidence. Each live run incurs
provider usage and may fail honestly; preserve that result before retrying.

For an interactive rehearsal use a **new** private runtime directory with `scripts/vms_native.py`,
`scripts/seed_vms.py`, the separate worker and production Next as documented in README.
Failure-test workspaces intentionally remove sources/files and are not a reusable demo workspace.
Keep the application loopback-bound. Stop only the processes owned by that rehearsal.

Ready for final UX polish and rehearsal on the verified native path. Container/device portability,
broader accuracy and actual billing remain open gates documented in KNOWN_LIMITATIONS.


## VIDEO-01 native demonstration acceptance — October 27, 2026

- [x] Six distinct real licensed films play in the current production app on :3200.
- [x] Per-source provenance/license/creator/checksums and actual video-derived previews recorded.
- [x] Prerecorded stream, recording, source credit and replay-time labels visible.
- [x] Default views are real footage; old synthetic registrations/history preserved and paused.
- [x] Idempotent setup, additive migration, bounded recording and no automatic cloud jobs.
- [x] Six recording playback/Range/seek paths, actual timeline click, four-way layouts and registration dialog checked.
- [x] Five incremental genuine analysis jobs, actual Muse saved view/search/exact evidence playback.
- [x] 174 backend tests passed / one deliberate live-gate skip; frontend lint/type/build and contracts pass.
- [x] 24 final browser checks and actual buffering/disconnect/recovery; screenshots retained.
- [x] Original rows/files compared with backup/inventory; no valuable history deleted or reset.
- [x] API ledger checked: $4.60 reserved / $5 configured UTC-day ceiling; actual billing unknown.
- [ ] Existing Docker/Linux, physical-camera, Safari/iOS and broader evaluation gates remain open.

VIDEO-01 is complete. Use [VIDEO_LIBRARY](../demo/VIDEO_LIBRARY.md) and [VIDEO_01_REPORT](VIDEO_01_REPORT.md).
