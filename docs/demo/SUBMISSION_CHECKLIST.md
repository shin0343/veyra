# Submission checklist — Meta Global AI Developer Hackathon

Source: [official event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon), checked
October 28, 2026. It states the deadline (**Nov 4, 9:00 PM ET**; judging Nov 4–8) and track
criteria (Indie: creativity, technical ambition, whether it works; Startup: technical execution,
production readiness). It encourages the Muse Spark series via the Meta Model API. **Official
Rules were not yet published**; the page states no video length, video host, repository
visibility or licence requirement. Nothing below invents a requirement.

## Ready in this repository

- [x] Working product, canonical local demo — [FINAL_DEMO_GUIDE](FINAL_DEMO_GUIDE.md)
- [x] Demo video, 110 s, playable — `runtime/demo-video/veyra-final-demo.mp4` (scripted vs live segments labelled)
- [x] README: overview, Muse integration, architecture, setup, tests, limitations, media credits
- [x] Verified results — [FINAL_E2E_RESULTS](../qa/FINAL_E2E_RESULTS.md), [FINAL_RELEASE_GATES](../qa/FINAL_RELEASE_GATES.md)
- [x] Live Meta Muse evidence — [`docs/qa/final/live-muse/`](../qa/final/live-muse/)
- [x] Security review — [FINAL_SECURITY_REVIEW](../qa/FINAL_SECURITY_REVIEW.md)
- [x] Release commit on `release-recovery-20261027`, tag `veyra-rc1` (local only)

## Needs the team (not done by the agent — requires your authorization or accounts)

- [ ] Re-check the participant portal for the published Official Rules and form fields
      (video length/host, repo visibility, licence, team details) before submitting.
- [ ] Choose the track (Indie or Startup).
- [ ] Upload the video where the form requires; add the footage credits to its description.
- [ ] Decide repository visibility / push (nothing has been pushed).
- [ ] Optional: a narrated voice-over (the recording is silent, with on-screen captions).
- [ ] Submit before **Nov 4, 2026, 21:00 America/New_York**.

## Suggested short description

Veyra is an agentic video management workspace. Meta Muse turns plain language into typed,
allowlisted VMS actions — such as building a multi-camera view — that only execute after the
operator approves and are verified against the database before Veyra reports success. Muse also
analyses consented clips into grounded observations, so natural-language search returns the exact
moment of real footage, ready to play.
