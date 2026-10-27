# Veyra — product overview and demo guide

**Current demo: VIDEO-02** — walkthrough in [VIDEO_LIBRARY.md § Presentation flow — VIDEO-02](VIDEO_LIBRARY.md#presentation-flow--video-02-current)
and evidence in the [VIDEO-02 report](../qa/VIDEO_02_REPORT.md). Setup is unchanged from VIDEO-01:
use [VIDEO_LIBRARY.md](VIDEO_LIBRARY.md) for the six real-video
setup, current camera names, preserved database and presentation flow; see the
[VIDEO-01 report](../qa/VIDEO_01_REPORT.md) for current screenshots and actual checks.
The Phase 08 setup/screenshots below are historical and include the old synthetic feeds.
Do not use that manual setup to replace or reset the current demo.

Phase 08, October 27, 2026. Every screenshot here was captured from the production Next build
running against the real native stack (FastAPI, PostgreSQL, MediaMTX, indexing worker) and genuine
Meta `muse-spark-1.3`. Nothing is mocked, staged or edited. Timings are single observed samples,
not benchmarks.

## Product overview

Veyra is a calm video workspace for people who have never used a video management system.
You connect a camera, watch it live, return to a recorded moment, and ask for what you want in
your own words. Muse, the built-in assistant, does not just answer: it carries out real VMS
operations through the same typed services the interface uses, shows you exactly what it is about
to change, waits for your approval, and then proves the result by re-reading it from the database.

**Differentiator, in one sentence:** Veyra is a working VMS whose AI is a control plane, not a
chat window — Muse proposes real, typed operations, a person approves them, and every result is a
verified receipt or a playable piece of evidence.

### Why it helps people

| Without Veyra | With Veyra |
| --- | --- |
| Learn layouts, streams and channels before seeing anything. | The overview plays a live camera and lists what Muse saw recently. |
| Scrub hours of footage to find one event. | Describe it ("a person riding a bicycle"); open the exact clip at the exact second. |
| Assistants that claim to have done something. | Changes appear as a preview, need your approval, and come back "saved and verified". |
| Unclear what the AI looked at. | Every result shows the model, the analyzed vs. recorded coverage, and uncertainty. |
| Privacy as a settings afterthought. | Cloud analysis is off per camera until you allow it; no face recognition or profiling. |

## Demo setup (rehearsed)

Use a fresh runtime so the workspace has no test leftovers. This is the one used for the
screenshots (`runtime/demo`, private and gitignored):

```sh
.venv/bin/python -E scripts/vms_native.py --mediamtx /tmp/veyra-mediamtx/mediamtx --runtime runtime/demo
# Register cameras through the API (or the UI): Front entrance → sample, Garden → sample_2,
# Trail camera → sample_4 with cloud analysis allowed. Leave sample_3 free for the live
# "connect a camera" moment. Replace the sample_4 test pattern with the licensed film:
ffmpeg -re -stream_loop -1 -i runtime/evaluation/dirt-jump-biking.webm -an -vf scale=640:-2 \
  -c:v libx264 -pix_fmt yuv420p -preset ultrafast -tune zerolatency -r 15 -g 15 -bf 0 \
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:<rtsp port from connection.json>/fixture_4
# Worker, against the same database and recordings (see apps/web/README.md), then:
npm run build && node --env-file=runtime/demo/web.env node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1
```

Then open the Trail camera recording and use **Make this recording searchable** (consent dialog →
real analysis job). In rehearsal, 30 clips indexed in 16 min wall time with two automatic
retries (`MODEL_UNAVAILABLE`, `INVALID_MODEL_OUTPUT`) and finished successfully. Do this well
before presenting. Budgets are per UTC day; check **Settings → Your video, your choice** first.

Three cameras are synthetic FFmpeg test patterns (transport evidence only). The Trail camera
replays Henry Geer's *Dirt Biking* (CC BY 3.0); its location field says so. The first ~30 s of
that recording are a test pattern from before the replay started — open search evidence, not
the recording's beginning.

## Demo flow and narration (about 5 minutes)

Use prompts that **name real cameras**; genuine Muse reliably proposes a layout for those, while a
vague "my cameras" sometimes ends after only reading the camera list (Veyra then says "Nothing
was changed"). The overview's "Try asking" chips are generated from your actual camera names.

| # | Do | Say | Shot |
| --- | --- | --- | --- |
| 1 | Open the overview. | "This is the first screen. No wall of feeds — one live camera, what Muse noticed recently, and a place to ask." | [01](screenshots/01-overview.png) |
| 2 | Cameras → **Connect a camera** → name "Garage", choose `sample_3`, connect. | "Adding a camera is a name and an approved source. Credentials never reach the browser. Cloud analysis is off by default." | [02](screenshots/02-cameras.png), [03](screenshots/03-connect-camera.png) |
| 3 | Live view (2 × 2). | "Real RTSP to HLS, a few seconds behind live. Status is observed, not assumed." | [04](screenshots/04-live.png), [16](screenshots/16-tablet-live.png) |
| 4 | Press ⌘K, type `Create a 2x2 saved view named "Evening check-in" with Front entrance, Garden, Garage and Trail camera`, Enter. | "One command bar for everything. A sentence goes to Muse; a word like 'cameras' just takes you there." | [05](screenshots/05-command.png) |
| 5 | Read the proposal card; **Approve and save**. | "Muse used real tools to resolve the cameras. Nothing is saved yet — this exact view, expiring in two minutes, needs my approval. A model cannot approve itself." | [06](screenshots/06-muse-proposal.png) |
| 6 | Point at **Saved and verified**; open the view. | "Veyra re-read the layout from the database after saving. The view opens with live tiles." | [07](screenshots/07-muse-verified.png), [08](screenshots/08-saved-view.png) |
| 7 | New conversation: `Find footage with a person riding a bicycle on Trail camera.` | "Muse searches indexes it built earlier from consented clips. It doesn't re-upload video to answer." | [09](screenshots/09-muse-search.png) |
| 8 | Click the first moment. | "It opens the exact analyzed clip — 'Exact evidence clip' — at that second." | [10](screenshots/10-evidence-playback.png) |
| 9 | Search page: "a person riding a bicycle". | "How my words were understood, what was analyzed versus recorded, the model, uncertainty. An empty result never claims nothing happened." | [11](screenshots/11-search-results.png) |
| 10 | Recording page: histogram, "clips searchable", moments. | "Motion, Muse coverage and recording are shown separately. Analysis is per camera and needs consent." | [12](screenshots/12-recording-context.png), [13](screenshots/13-activity.png) |
| 11 | Settings → privacy and usage. | "No face recognition or profiling. Requests, upload bytes and reservations are visible; billing is shown as unknown, because it is." | [14](screenshots/14-privacy.png) |
| (opt.) | Ask for another view and **Decline**. | "Declining is a normal outcome: nothing changed." | [15](screenshots/15-muse-declined.png) |

Fallbacks: if Muse is slow, the panel shows elapsed time and **Stop waiting**; "Check again"
reuses the same request key so nothing runs twice. If Muse search fails, the panel offers
**Search your video for these words**, which uses the same stored index directly.

## Observed in the recorded walkthrough

`apps/web/tests/demo-walkthrough.mjs` ran steps 1, 2 (dialog not submitted), 3–11 continuously in
44.4 s on 2026-10-27 08:09 UTC with zero page errors ([raw](screenshots/walkthrough.json)). It used
three cameras (two-column view named "Garden walk") so `sample_3` stays free for the live demo.

| Step | Observed |
| --- | --- |
| Overview live video | decoded frames within 2.5 s of navigation |
| Muse layout proposal | 2.36 s; approval → verified receipt 0.21 s; opened view with live tiles |
| Muse video search | 5.76 s; 10 grounded moments (6 shown) |
| Direct search "a person riding a bicycle" | 8.67 s; 20 results; 4m 55s analyzed of the recorded window |

Evaluation remains small (one licensed film); see [known limitations](../qa/KNOWN_LIMITATIONS.md).

## Submission screenshots

`docs/demo/screenshots/01–17` (2× desktop captures plus tablet/phone). Use 01, 05, 06, 07, 09, 10
and 11 for the core story. They show real data from the rehearsal workspace; the synthetic test
patterns are visibly test patterns, and the licensed film is attributed in the camera location.
