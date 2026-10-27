# VIDEO-01 — real-video demo report

**Verdict: PASS on the native Chromium presentation environment. VIDEO-01 is complete.**

Checked October 27, 2026. The app is left running at **http://127.0.0.1:3200** with the current
production build and the preserved `runtime/demo` database. Build ID: `q61KUKGo9A8q3f2mMu3PQ`.
No push, deployment, external message, database reset or major frontend redesign was performed.

## What was inspected

Read AGENTS, HANDOFF, DEMO_GUIDE, Phase 08 readiness, known limitations, release checklist,
product and media/indexing architecture. The reported :3200 URL initially refused connections;
the old demo services were stopped. Storage remained intact: three cameras, three saved views,
three historical recordings, 7,636 ready segments, 30 successful clip indexes, 86 genuine model
observations and $4.00 reserved from 80 model requests. Sources `sample` and `sample_2` were
synthetic; `sample_4` was the licensed Henry Geer replay, including an older synthetic start.
Migrations 001–005 were applied. No working data was discarded to get a clean screen.

Before modifying that runtime, created a cold database copy and a logical `pg_dump` under
private ignored `runtime/backups/video01-before`, plus an inventory of 20,389 recording/marker
files (16,900,042,002 bytes). Media was preserved in place, not duplicated as a full media backup.

## Delivered

- Seven individually licensed real source films: six default camera locations and a reserved
  station source for the connect-camera demonstration. All six default sources play in the app;
  their 20.6–36 s films show people, vehicles, bicycles and animals in distinct settings.
- H.264 Constrained Baseline, yuv420p, 960×540, 15 fps, silent, padded without cropping;
  normalized files total about 35 MB including the reserved source. No fake CCTV overlays,
  burned timestamps, camera branding or static-image substitute for a live stream.
- Video-derived JPEG previews through authenticated `/cameras/{id}/thumbnail`. Preview frames
  are labeled independently of connection status; the Garden frame actually shows squirrels.
- Idempotent licensed preparation/start scripts; stable camera/source mapping; an actual saved
  four-camera layout; finalized MediaMTX recording reconciliation. Repeating setup while running
  returns `already_running`; restarting reuses records/indexes and reports no new capture.
- Additive migration `006_demo_media`: camera and recording provenance snapshots. Old recordings
  keep their original history rather than inheriting a replacement film's provenance. Runtime
  schemas regenerated from Python; frozen package contracts preserved.
- Continuous **Demo stream · Prerecorded footage** labels, recording credits/license links and
  a workspace-wide explanation that timestamps are replay/ingest time, not original capture dates.
- Two legacy synthetic cameras paused through audited REST updates and moved to Development
  test sources, with original IDs, recordings and saved-layout references intact. No synthetic
  publisher starts in the default demo. `sample_3` remains a free development source; the real
  station source remains unregistered for the presentation's camera-registration moment.
- Normal consented indexing accepts an optional strict `max_segments` 1–30, default 30. Five
  new sources were each genuinely analyzed for one 10 s clip; unselected footage remains waiting.
  No manufactured observations or alternate ingestion path. Legacy analysis request-key replay
  remains compatible when the new field is omitted.
- Camera polling failures change enabled cameras to Not checked. Media statuses remain based
  on actual MediaMTX observations and browser decoding, including offline, buffering and recovery.

Source recipes, per-item licenses, creators, original URLs, attribution, duration, resolution,
filenames, SHA-256 values and limitations are in [VIDEO_ASSET_MANIFEST](../demo/VIDEO_ASSET_MANIFEST.md),
[video-sources.json](../demo/video-sources.json) and [license evidence](../demo/video-license-evidence.json).
Henry Geer's CC BY 3.0 attribution and original/evaluation files remain intact.
Reproduction/presentation instructions: [VIDEO_LIBRARY](../demo/VIDEO_LIBRARY.md).

## Real playback and evidence

The final [browser report](video01/browser.json) passes **24 checks with zero page errors**.
Each of the six sources decoded 960×540 frames and advanced. Default and saved 2×2 layouts
played four distinct films. Each recording opened at 2 s, jumped to 5 s with exact server/player
offset mapping and returned **206 / 2,048 bytes** for a browser MP4 Range request. A real
Community timeline click sought to approximately 8 s and continued playback.

| Camera | Actual opened recording | Screenshot |
| --- | --- | --- |
| Trail camera | `/recordings/a8d53949-fd0f-5e62-b066-00856933050d?offset_ms=5000` | [Playback](video01/screenshots/recording-sample_4.png) |
| Entrance gate | `/recordings/39d296d9-6336-57bf-af7b-b59bc803fdd8?offset_ms=5000` | [Playback](video01/screenshots/recording-demo_entrance.png) |
| Street approach | `/recordings/25809f13-01dd-5369-9302-bd12587a9ad5?offset_ms=5000` | [Playback](video01/screenshots/recording-demo_street.png) |
| Garden wildlife | `/recordings/2aefe1d9-6331-541b-b921-fed79ce1b622?offset_ms=5000` | [Playback](video01/screenshots/recording-demo_garden.png) |
| Community space | `/recordings/4d914a7e-6c91-52b4-8271-73bd038125bb?offset_ms=5000` | [Playback](video01/screenshots/recording-demo_community.png) |
| Bicycle parking | `/recordings/d14bd27d-594d-59fc-bd8f-3193e7a84542?offset_ms=5000` | [Playback](video01/screenshots/recording-demo_parking.png) |

The newest Garden recording is a 24.733 s finalized pass of the final derivative. Its earlier
analyzed immutable take is retained; changing the preview recipe did not trigger paid reanalysis.
Initial integration takes replay the short films for about 132 s each and are also retained.
The original three multi-hour recordings remain available and are clearly historical demo ingest.

| Screen / behavior | Captured evidence |
| --- | --- |
| Overview, actual video | [Overview](video01/screenshots/01-overview.png) |
| Six actual film previews, two paused development cameras | [Cameras](video01/screenshots/02-cameras.png) |
| Default / saved 2×2 | [Default](video01/screenshots/03-default-2x2.png), [saved](video01/screenshots/04-saved-2x2.png) |
| Source registration | [Real reserved source selected](video01/screenshots/05-connect-prerecorded-source.png) — deliberately not submitted; five new default cameras were registered through normal REST |
| Phone layout | [390 px camera page](video01/screenshots/07-phone-cameras.png), no horizontal overflow |
| Browser network offline | [Buffering + Not checked](video01/screenshots/08-network-buffering.png) |
| Actual owned publisher stopped | [Offline / SOURCE_OFFLINE / no player](video01/screenshots/09-publisher-offline.png) |
| Publisher restored after owned-stack restart | [Connected + actual frames](video01/screenshots/10-publisher-recovered.png) |
| Recordings / activity / search / saved views / settings | [Recordings](video01/screenshots/page-recordings.png), [activity](video01/screenshots/page-events.png), [search](video01/screenshots/page-search.png), [views](video01/screenshots/page-layouts.png), [settings](video01/screenshots/page-settings.png) |

[Failure/recovery JSON](video01/failures.json) records the actual browser network fault and
actual FFmpeg publisher termination separately. The restored source was online with advancing
960 px video. Browser automation used the repository's established Playwright/Chromium path.

## Genuine Muse and new observations

The five one-segment jobs all succeeded, with one bounded automatic retry and nine actual
validated observations: gate/person/vehicle activity, street traffic, squirrels at a feeder,
people walking through a pedestrian area, and people moving bicycles. The worker sampled the
real finalized files, uploaded bounded clips, validated results, committed grounded intervals
and performed provider-file cleanup through the existing pipeline.

[Analysis jobs and usage](video01/analysis.json); [actual observation/segment provenance](video01/after.json).
These are model observations with their stored uncertainty, not manually inserted event labels
or a broader accuracy benchmark. Existing 30 Trail indexes and 86 observations were not reindexed.

A continuous [genuine walkthrough](video01/muse/walkthrough.json) then passed in 57.6 s:

- Muse proposed **Video 01 patrol** with Entrance gate, Street approach, Garden wildlife and
  Community space in 2.153 s. The test harness approved the explicit proposal through the UI;
  approval → verified receipt took 201 ms. The persisted four-camera view opened and played.
- **Find people walking on Community space.** returned two grounded moments in 3.893 s.
- A result opened recording `4d914a7e-6c91-52b4-8271-73bd038125bb` at 1,000 ms with exact
  segment `cb6715d7-d771-5046-9744-4d1d8e570418`; the walking footage actually played.
- Direct **people walking** search returned six indexed intervals in 10.898 s with explicit
  partial coverage and model uncertainty. No new video upload or reanalysis occurred for search.
- No browser page errors. These are single observed timings, not benchmark claims.

Screenshots: [proposal](video01/muse/06-muse-proposal.png),
[verified receipt](video01/muse/07-muse-verified.png),
[playing saved view](video01/muse/08-saved-view.png),
[Muse search](video01/muse/09-muse-search.png),
[exact evidence](video01/muse/10-evidence-playback.png),
[direct search](video01/muse/11-search-results.png),
[recording/index context](video01/muse/12-recording-context.png).

## Data preservation, final state and budget

[Before](video01/before.json) / [final state and preservation comparison](video01/after.json):

| Measure | Before | Final |
| --- | ---: | ---: |
| Registered cameras | 3 | 8: six real demo sources + two paused legacy fixtures |
| Saved layouts | 3 | 5: original three + manual VIDEO-01 view + genuine Muse view |
| Recordings | 3 | 10, all actual references |
| Segments | 7,636 | 7,724 |
| Successful clip indexes | 30 | 35 |
| Genuine model observations | 86 | 95 |
| Model requests, same UTC-day demo ledger | 80 | 92 |
| Reserved admission estimate | $4.00 | **$4.60 / $5.00** |

All 7,636 original segment rows, 86 original observation rows and nine original saved-view cells
match sorted PostgreSQL COPY row hashes from the pre-change logical backup. Every one of the
20,389 inventoried old media/marker files remains with unchanged size and mtime. No full-corpus
cryptographic media rehash is claimed. The original Henry Geer film's SHA-256 still equals
`68b94c8a7c38755b0394af728ac7f83446bef607d1faa37c38047f389870ddfb`.

Final MediaMTX configs show recording disabled for all six completed demo passes while their
publishers remain online. A repeat start after recovery captured nothing new; final segment
counts stayed 7,724 during subsequent browser/Muse testing. Automatic retention is disabled for
this demo runtime. No historical recording, camera, layout or genuine index was deleted.

VIDEO-01 added 12 logical model requests: six video-analysis attempts for five clips, five
Muse agent turns and one natural-language search parse. Configured limits were actually read:
100 requests/day, $5/day reservation ceiling, $0.05 reservation per request. Incremental jobs
required headroom for retries and presentation verification. About 2.20 MB additional video
was uploaded. **Reservations are not provider prices or invoices; actual billing is unknown.**
This is the `runtime/demo` ledger, not an account-wide total. No paid full-demo smoke/reindex
suite was repeated. Only eight logical-call slots / $0.40 admission estimate remain for this UTC day.

## Checks and corrections

[Command ledger](video01/checks/commands.json):

| Check | Actual result |
| --- | --- |
| `make check` | exit 0; **174 passed / 1 skipped**; Ruff lint/format, frontend typecheck and frozen/runtime contract drift checks passed |
| VIDEO-01 regression module | **12 passed**: small-job bounds/replay, old-key upgrade compatibility, immutable historical provenance, recorder stop policy, tampered assets/paths, thumbnail auth/missing states |
| Frontend lint / production build / edited-file Prettier | all passed; zero lint warnings |
| Final Chromium functional/visual checks | **24 passed, zero page errors**, plus genuine Muse walkthrough and actual network/publisher outage/recovery |
| Known-secret scan | passed; no exact configured credentials or server key identifier in committable files/static browser bundles; not a general security audit |
| Migration apply/reapply / runtime restart | passed in the preserved native runtime; additive 006 present; no duplicate cameras, layouts or recording passes on restart |

The first sandboxed backend run could not initialize PostgreSQL shared memory; the permitted
isolated run passed. An early registry serialization added null fields to pull-source listings;
compatibility was restored without changing the existing boundary test. Initial browser-driver
attempts used a wrong media URL property and an over-exact select label; those were test-driver
errors, corrected and rerun. [First attempt](video01/browser-first-attempt.json) is retained.

A real recording-policy race was found: the reconciler forced `record=true` after the setup
requested stop. Recording policy now belongs to the reconciler and is based on persisted
source/hash capture origin; MediaClient respects it. The test-generated longer takes were
preserved. The final Garden pass and subsequent no-new-capture restart verify the corrected bound.
A failed camera-status poll no longer leaves a cached Connected label during a browser outage.

## Remaining limitations and next-phase readiness

- Ready for a controlled native demonstration with six real moving sources, playable recordings,
  genuine Muse operations and grounded search. **Stop at VIDEO-01.** No major redesign or
  subsequent product phase was undertaken.
- These are stock/Commons films, including handheld views and edited sequences, rather than
  fixed installed security cameras. Portrait Garden footage is pillarboxed. Parcel deliveries,
  a true private driveway and a residential lobby are still missing desired scenarios; none is
  claimed to have been obtained. The reserved station original is honestly only 10 s.
- The reserved source's registration dialog/source selection was exercised; it was deliberately
  left unsubmitted for the presenter. All six default cameras and actual registrations are
  persistent; the existing synthetic `sample_3` development registration scenario remains free.
- Search coverage remains partial. Five new clips / nine observations do not establish general
  accuracy, exhaustive event recall or the separate independent-scene/ten-query evaluation gate.
  Historical footage includes test patterns; default new views do not.
- Docker/Linux firewall, physical camera compatibility and Safari/iOS playback were not tested
  in VIDEO-01. MediaMTX logs a 1→2 s HLS segment-duration warning at some fractional-length loop
  boundaries; native Chromium successfully played those loops. No Safari/iOS success is claimed.
- Existing broader Muse ambiguity, pagination and layout-editing limitations remain in
  [KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md). The existing Starlette/httpx test-adapter warning
  is unchanged. Rehearse with cached indexes and check remaining admission budget before paid calls.
