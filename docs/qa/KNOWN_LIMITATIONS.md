# Known limitations — updated through VIDEO-02

VIDEO-01 current evidence: [VIDEO_01_REPORT.md](VIDEO_01_REPORT.md). Earlier phase measurements
remain history; six licensed prerecorded films are now the default presentation sources.

1. **Docker portability remains an open release gate.** Both requested Compose commands were
   attempted and exited 127 because Docker is absent. Corrected web-image source inputs pass
   native TypeScript verification. Images, Compose startup and Linux media firewall behavior
   have not run; a capable Linux/Docker environment must execute them.
2. **Physical cameras remain unverified.** All RTSP sources are real local FFmpeg publishers.
   VIDEO-01 defaults to six licensed prerecorded film publishers; the two old registered
   synthetic cameras are paused and their history is preserved.
   Vendor authentication, AAC audio, LAN redirects and reconnect behavior require actual devices.
3. **Model behavior is nondeterministic.** Video observation rejection and Muse search-argument
   failures were reproduced live. Strict validation remains; retryable observation rejection is
   bounded to three attempts and may still end in an honest failed job. No invalid output is
   accepted. The final run passed both direct search and Muse exact-segment navigation after
   correcting optional-filter semantics; that single run does not establish universal reliability.
4. **Evaluation is small.** Three licensed clips, one film, six genuine quality-gate queries;
   final browser timing samples are three live loads, three retrievals, three positive searches
   and two analyzed clips. General accuracy, model boundary error, five independent scenes/ten
   queries, scale and long-duration reliability have not been established.
5. **Search is bounded lexical/structured retrieval.** It can miss synonyms, brief unsampled
   events or unsupported conditions. Partial/unindexed coverage is shown; a no-match is not
   proof that an event never occurred. Model intervals are estimated within verified media.
6. **Recording and analysis scope stays bounded.** H264 baseline, finite playback cache, one
   export at a time, at most 30 segments/five minutes per acknowledged job. Newly finalized
   clips require another acknowledgment. Persistent failures are explicit; no automatic
   unlimited cloud reindexing or transcoding was added.
7. **Local single-user security.** Public sessions, TLS, multi-tenant resource grants, resilient
   distributed operation and hostile storage administrators are outside the MVP boundary.
8. **Cost is not an invoice.** Configured reservations are admission estimates. Prices and actual
   billing are unknown; standalone diagnostics and isolated databases do not share a global
   account budget. A logical model call can include a bounded HTTP retry.
9. **Existing secondary UX gaps remain.** Recording pagination beyond the first 100, layout edit/
   deletion UI, job list/cancel and unbuilt rule execution were not expanded in Phase 07.
   The existing Veyra design tokens, typography, spacing and visual identity were preserved.
10. **Test tooling warning.** Locked Starlette TestClient emits an httpx deprecation warning.
    Required checks still pass; this is a future dependency-adapter update, not a suppressed test.
11. **Muse needs concrete requests for actions (Phase 08).** Genuine Muse reliably proposes layouts
    when cameras are named; vague requests can end after reading the camera list. The UI states
    that nothing changed and generates starter prompts from real camera names. See
    PHASE_08_READINESS for the backend follow-up.
12. **Indexing is slow relative to the demo pace.** One 30-clip job took 16 minutes with automatic
    retries. Index the demo recording well in advance; daily admission budgets apply per UTC day.

13. **VIDEO-01 is a prerecorded demonstration.** Film/publisher status is real; it is not evidence
    of installed cameras. Timeline dates are local replay/ingest clocks. Five new one-clip
    analyses broaden the demo, without proving complete coverage or the separate ten-query
    evaluation gate. Desired parcel/private-driveway/residential-lobby assets remain unacquired.
14. **Safari/iOS loop playback remains unverified.** MediaMTX logs an HLS duration-change warning
    on some fractional-length loop boundaries. Chromium successfully played these actual loops;
    other browsers must be checked before claiming portability.
15. **Preserved trial/history recordings are longer than the curated source sequence.** The first
    VIDEO-01 integration trial produced approximately 132 s replay takes before the recorder
    policy race was corrected. They were retained. Subsequent capture is bounded per source/hash,
    and restarting does not create another pass. Older Phase 08 recordings may include test patterns.

16. **VIDEO-02 Explore is bounded by the existing index.** 35 of 7,724 clips are analyzed; broad
    topics hit the 50-result cap with Trail camera clips. Topic filters are deterministic reads of
    stored Muse fields; Muse labels bicycles as `vehicle_visible` in places (noted in the UI).
    Filters are single-select; no saved searches, export or alerting. See
    [VIDEO_ANALYTICS_EVALUATION](VIDEO_ANALYTICS_EVALUATION.md).
17. **Windows are anchored to the latest recorded video.** Explore, Overview, Activity and
    workspace events use the 24 h ending at the newest recording (API maximum 24 h), so the
    prerecorded demo stays visible after Oct 28. Footage older than that window is reached
    through Recordings or by focusing the timeline; a multi-day picker is not built.
18. **Preview frames are illustrative.** `/recordings/{id}/frame` decodes one JPEG from the
    evidence segment (250 ms quantisation). It does not localise objects; no boxes are drawn.
