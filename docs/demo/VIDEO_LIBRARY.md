# VIDEO-01 — Veyra real-video demo library

The local presentation uses six genuinely playable prerecorded films. A seventh licensed
source remains unregistered for the camera-registration moment. Nothing is a real installed
camera, and no synthetic test pattern is published by the default setup.

## Open the demo

**http://127.0.0.1:3200** — the production Next build against the preserved `runtime/demo`
PostgreSQL, MediaMTX, API and genuine indexing worker. The latest checked build and service
state are recorded in [the VIDEO-01 report](../qa/VIDEO_01_REPORT.md).

| Camera | Actual visible activity | Prepared sequence | Source / license |
| --- | --- | --- | --- |
| Entrance gate | People at a public gate, a passing three-wheeled vehicle, handheld pan | 20.6 s | Olusola David, Ayibiowu / CC BY-SA 4.0 |
| Street approach | Buses, truck, cars and cyclists on a San Francisco street | 30 s | Editor / CC BY 3.0 |
| Garden wildlife | Squirrels climbing and jumping around a garden feeder | 23.6 s | andrewrabbott / CC BY 4.0 |
| Community space | People walking through a cobblestone pedestrian area | 36 s | Sounds of Changes / CC BY 3.0 |
| Bicycle parking | People moving bicycles through a parking entrance, stairs and racks; edited shots | 32 s | ProRail / CC BY 3.0 |
| Trail camera | A cyclist riding wooded paths and rock features; edited film | 36 s | Henry Geer / CC BY 3.0 |
| Station entrance — reserved | People passing subway turnstiles toward a platform, handheld | 10 s original | rym / CC BY 2.0 |

Full original URLs, creator credits, licenses, actual dimensions/durations, original/derivative/
thumbnail SHA-256 values and limitations: [VIDEO_ASSET_MANIFEST.md](VIDEO_ASSET_MANIFEST.md).
The short station original is disclosed rather than duplicated to imply a longer original event.
These films do not establish parcel deliveries, a private driveway or an installed residential lobby.

## Repeatable setup

Prerequisites: this repository's locked Python/npm dependencies, PostgreSQL binaries, FFmpeg /
FFprobe, MediaMTX and Chromium for browser QA. Use the existing project private `.env` for Muse;
no secrets belong in the source recipes or browser. Container startup remains unverified.

```sh
# On a clean machine only: download the seven pinned, individually licensed originals.
.venv/bin/python -E scripts/prepare_demo_videos.py --download
# Later runs verify and reuse originals, H.264 derivatives and video-derived previews.
.venv/bin/python -E scripts/prepare_demo_videos.py
npm run build
.venv/bin/python -E scripts/demo_videos.py \
  --mediamtx /tmp/veyra-mediamtx/mediamtx --runtime runtime/demo --port 3200
```

An already healthy runtime returns `already_running`. Stop an owned controller with Ctrl-C
before changing the build or media recipe. Restarting reuses camera/source IDs, saved view,
recordings, indexes and valid assets. It never queues a cloud job. New runtime directories are
optional; do not substitute one for the existing presentation database and then claim its
history was migrated. The previous manual synthetic setup is retained only as historical guidance.

The setup registers by stable approved source ID through normal REST mutations, keeps the
existing Trail ID, pauses the two legacy synthetic cameras through audited updates, preserves
their recordings/layout references, and leaves `sample_3` free for development. It publishes
only the curated films, including the unregistered station source. New short recording passes
are reconciled from actual finalized MediaMTX files; the pipeline then disables recording
for that source/hash while its stream keeps playing. Repeated restarts do not record another
pass. A new media hash gets its own provenance snapshot. No online state is assumed.

Automatic retention is disabled **only for this preservation-oriented demo stack**. This keeps
old recordings intact. Existing historical videos are not relabeled as a newly supplied film.
The old long Trail recording includes a synthetic introduction; its genuine searchable clips
and exact `segment_id` evidence remain available. Prefer the indexed moment links when showing
historical evidence.

## Presentation flow — VIDEO-02 (current)

No setup change: same stack, same command. Every step below except 4 and 6 is free (no model).

1. **Overview** — the live film plays; "Recently found by Muse" shows real frames; *Look for*
   shows counts (People, Bicycles, Vehicles, Animals…).
2. **Explore** (nav) — lanes show recorded / analyzed / motion per camera for the latest recorded
   period; results are real frames; the first one plays in the inspector.
3. Click **Animals 1** → the squirrel clip plays. Point at *What Muse saw*, *How sure is this?*
   and *Source and processing*. **Open in recording at 00:00** lands on the exact segment.
4. Type **squirrels at the feeder** (or **buses on the street**) → **Ask Muse** (one request,
   ~15 s). Show *Muse understood* chips and the coverage line. Clear with ×.
5. Choose **Bicycle parking** in the camera filter; the clustered tick shows 3 moments — press it
   to step through them. Drag across the lanes to focus a period; **Full range** restores it.
6. **Review these cameras together** → either **Save view** (direct, no model) or **Ask Muse to
   propose it instead** → approve in the Muse panel → *Saved and verified* → open it. Use a new
   name: "Review · People (VIDEO-02 QA)" and "Garden review" already exist.
7. **Activity** — Muse observations newest first with frames; **Recordings** — library and
   moments with frames, player, availability and activity histogram.

Check **Settings → usage** before steps 4 and 6. On Oct 27 UTC the ledger ended at 95 requests /
$4.75 reserved; it resets per UTC day. If Muse is refused for budget, Explore says so and offers
the matching topic filter.

## Presentation flow — VIDEO-01 (historical)

1. Overview: real moving film with **Demo stream · Prerecorded footage** visible.
2. Cameras: six distinct video-derived thumbnails; two legacy development cameras are paused.
3. Live view: four real films in the first 2×2; the next page includes the other two.
4. Saved views → **Video library · four spaces**: persisted four-camera arrangement.
5. Recordings: open a new film recording, seek with `0:05`, use the timeline and open its exact
   indexed evidence. Source credit/license and the replay-time disclosure stay visible.
6. Search: **people walking**. Use Community space to inspect the newly analyzed footage.
7. Muse: name the real cameras in the request. For example, ask for a two-column view with
   Entrance gate, Street approach, Garden wildlife and Community space. Review its proposal,
   approve it and open the verified saved view. Search **Find people walking on Community space.**
8. Cameras → Connect a camera → select **Station entrance · Prerecorded demo**. Leave it
   unregistered after rehearsal so the presenter can submit the registration live. Cloud analysis
   is off for a new registration. The source is already actually publishing.

The banner explains that timeline dates are local replay/ingest time, not original filming
or footage captured “yesterday” by an installed camera. A thumbnail is a preview frame, not
proof that a source is online. Actual outages show offline or not-checked state; buffering is
shown only when the player waits for media.

## Small genuine analysis and budget

Five new cameras each have one genuinely analyzed 10-second segment from the normal consented
worker pipeline. The nine resulting model observations are linked to their real segments;
other segments remain unindexed. Existing 30 successfully indexed Trail clips and 86 historical
observations were preserved. Do not infer complete coverage from this small sample.

The setup itself spends no model calls. The optional operator command below explicitly grants
camera consent and submits **one** segment per named camera, preserving stable request keys:

```sh
.venv/bin/python -E scripts/index_demo_videos.py --source-id demo_community
```

Check **Settings → usage** and the configured limits first. The helper checks configured headroom for
three application attempts per requested source plus five validation calls, and refuses when
that headroom is unavailable. Successful indexes are cached; no entire-demo reindex is needed.
`max_segments` is an additive normal-job parameter, not a bypass of model validation/admission.
The default UI analysis action still selects up to 30 clips, so avoid clicking it casually on
old multi-hour recordings. Reservations are admission estimates; actual provider billing is unknown.

## Verification and recovery

```sh
# No paid provider requests:
make check
make contracts-check
node scripts/video01_browser.mjs runtime/demo docs/qa/video01
.venv/bin/python -E scripts/video01_inspect.py
```

`video01_failure_browser.mjs` deliberately takes its Chromium context offline and stops the
owned Entrance publisher. Run it only as a deliberate outage test, then restart the owned stack
and run with `VIDEO01_RECOVERY=1`; it is not part of routine setup. The checked failure report
and screenshots show buffering, unknown status, actual source offline and restored playback.
Do not run broad paid smoke suites or repeat genuine walkthroughs under a nearly exhausted budget.

The database was backed up privately under `runtime/backups/video01-before`.
`demo.dump` is a logical backup; `postgres/` is a cold cluster copy. Original recording files
remain in place, with a path/size/mtime inventory saved alongside the database backups; the
large media corpus was not duplicated. Keep the current DB/recordings intact when restoring: stop only the owned stack, restore
the dump into an isolated new local database, compare it, and point a separate runtime at that
copy. Never restore over the working demo or remove its recordings as a setup shortcut.
