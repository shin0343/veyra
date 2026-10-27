# Veyra

Veyra is a human-centered video workspace: connect a camera, understand what happened,
and take the next useful action without learning an intimidating surveillance console.
Care, clarity, keyboard access, privacy, and honest system state guide the interface.

The differentiator is an **Agentic Control Plane inside a working VMS**. Muse discovers
real features, resolves authorized cameras, saves real layouts through application tools,
and links grounded search results to playable evidence. A conversational answer alone
does not count as a completed VMS operation.

## MVP and demo priorities

| Priority | Vertical slice | Observable finish |
| --- | --- | --- |
| 1 | Approved camera → RTSP ingest → live HLS → recording → playback | A browser displays advancing live frames, a finalized recording survives restart, and playback seeks correctly. |
| 2 | Muse → feature discovery → navigation → saved layout | A prompt finds the layouts feature, creates a persisted layout from existing camera IDs, and opens it. Reload preserves it. |
| 3 | Finalized video → index → natural-language search → evidence → timestamped playback | A query finds a segment with camera/recording IDs, provenance and an offset; opening it displays the corresponding video moment. |

Target: one local operator, 1–4 H264 cameras, up to nine layout cells, short owned/licensed
demo clips, and ten days of focused development. Camera registration selects an approved
server source; manual network discovery and credential provisioning are outside the UI MVP.
H264 with no audio is the baseline; AAC audio is optional after compatibility checks.

Secondary scope: activity histogram, motion events, rules listing, saved layout editing,
and optional SAM 3.1 object masks. Cut these before weakening the three slices.

## Non-goals

- Enterprise multi-tenancy, high availability, mobile apps, camera auto-discovery/ONVIF,
  PTZ control, advanced alert routing, fleet management, and a distributed storage system.
- Face recognition, identity matching, demographic profiling, criminality/risk inference,
  or a promise that AI detects every event.
- Arbitrary code/SQL/HTTP execution by a model, or a chat UI that claims to perform work
  without a successful application action result.
- Continuous full-frame cloud upload. Analysis operates on bounded, explicitly consented clips.
- Semantic vector infrastructure until actual retrieval failures justify it. The initial
  index uses grounded Muse descriptions plus PostgreSQL full-text search and typed query expansion.

## Success criteria before submission

1. All three slices run from a clean local setup with written instructions and owned footage.
2. Record at least 60 seconds from a source, reconnect after an interrupted stream, and
   distinguish online/offline/unknown based on real observations. Seek playback within
   one second of an annotated target in the controlled fixture; report the observed error.
3. An explicitly requested two-camera layout is saved exactly once even after retry.
   A denied or unavailable camera never enters the layout. Read-only discovery never mutates it.
4. Use at least five manually annotated scenes and ten natural-language queries. Report
   hits, misses, partial coverage, and observed timestamp error; do not claim a quality score
   until that evaluation is run. Unsupported queries return no evidence, not invented results.
5. Keyboard operation, readable focus, non-color status text, responsive navigation,
   and accessible errors cover every demo path. Destructive actions are excluded from the MVP.
6. The demo truthfully identifies the actual Meta model and API outcomes. No credentials or
   raw camera URLs appear in the browser, the model tool catalog, or public artifacts.

Submission deadline is **November 4, 2026, 21:00 America/New_York** (18:00 Los Angeles,
02:00 UTC November 5). Use the named time zone because the US DST transition occurs during
the event; the event page's “EST” label is not a fixed UTC offset for every event date.
Confirm submission rules and final schedule through the participant portal before release.
[Official event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).

## Phase 01 boundary

Deliver executable contracts, safe source validation, dependency health checks, a frontend
placeholder, database migrations and feasibility probes. Product CRUD, media sessions,
the agent dispatcher, indexing worker, search, and the finished UI remain subsequent work.
See HANDOFF for measured results rather than treating this product plan as implementation.
