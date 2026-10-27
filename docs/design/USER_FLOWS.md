# Veyra user flows — Phase 02

## Navigate and discover

The sidebar is the stable map: Overview, Cameras, Live view, Recordings, Search, Activity,
Saved views, Settings. On smaller screens it becomes a named icon rail or navigation dialog.
All eight routes exist, plus saved-layout and timestamped-recording detail routes.

1. Open the universal command entry or press Cmd/Ctrl+K.
2. Type a feature such as “recording settings.” Arrow keys move through destinations.
3. Enter or click a result to open its typed application route. Escape returns focus.
4. With text entered, the list also offers **Ask Muse: "…"** and **Search your video for "…"**
   (Phase 08). A sentence (three or more words, or no matching page) puts Muse first; a word or
   two puts the matching page first. Muse acts only after the person chooses an option.

This directory is deterministic local feature guidance. It never claims that Meta produced
an answer. “Recording settings” maps to the frontend Settings route; it does not add a
`settings` feature ID to the frozen backend contract.

## Muse in context

1. Use Ask Muse in the header, the overview command, or a contextual suggestion.
2. The side panel preserves the current workspace. The input accepts natural-language text.
3. In connected mode, Send calls the existing `/agent/messages` contract with an idempotency
   key. A real response renders its message and typed action receipts. Network/501 errors
   remain visible, with helpful local destination cards where possible.
4. A succeeded receipt exposes navigation only through the fixed target mapping. A failed
   receipt states what did not complete. A confirmation-required receipt shows the actual
   server summary and approve/decline choices; expiration disables approval. Decisions call
   the existing confirmation endpoint and display the returned result.
5. In preview, local feature guide cards are explicitly “not a Muse response.” No inference
   call or simulated agent execution occurs. A feature card can still navigate to a real page.

“Where can I adjust recording settings?” therefore produces a usable Settings destination
in the guide. The Open settings action navigates to `/settings#recording`, preserving preview
only when that mode was explicitly selected.

## Connect and review a camera

1. Cameras shows connection text, space grouping where sample metadata exists, cloud analysis
   status and Open view. Filter by name or fixture space; actual grouping awaits metadata.
2. Connect a camera loads approved source IDs from `/camera-sources`. A human names a camera
   and selects an approved source; no raw URL/credential input exists.
3. Registration calls the frozen camera contract, with cloud analysis false. No success is
   shown until a real API response. Preview explains the integration boundary instead.
4. Camera settings lets a human change cloud-analysis consent. Review change opens a
   consequence summary. Confirm calls PATCH only after review; errors stay in the dialog.
5. In preview the review concludes with an explicit “no device setting changed” result.

## Create and open a saved view

1. Saved views → Create a view.
2. Name the view, select one to four cameras, choose one/two columns.
3. Review the name, cameras and arrangement. Go back to revise or Save view.
4. Connected mode posts `LayoutCreate` with the same idempotency key on retry; only the actual
   layout response produces a success screen. Preview creates only local provider state.
5. Open saved view navigates to `/layouts/{id}`. A local preview view remains across navigation
   in the current session and disappears on refresh; this limitation is visible.

The detail page resolves the actual layout cells against available cameras. A missing layout
does not silently become a different view. Cloud or camera mutations are not part of this flow.

## Live view

Single and 2×2 controls change arrangement. Tile heading buttons select a camera; Expand
opens a single view. A camera switcher lets keyboard users choose another camera. Review
recordings retains camera context. Contextual Muse guidance helps locate a recording.

Connected cameras request the existing media-session contract. The player validates a
same-origin session URL, expiration and seek offset before attaching native MP4/HLS or
hls.js. Loading, unsupported browser, offline and interrupted-session states are distinct.
Preview renders labeled illustrations and an offline sample, without video elements or fake
playing controls. Actual source playback remains backend-dependent and unverified here.

## Review a recording

1. Filter the library by camera and date; displayed timestamps are Pacific Time.
2. Choose a recording; its player, requested offset, availability timeline and known events
   appear together. The selected library row remains visible.
3. Timeline and event markers navigate using recording-relative integer milliseconds.
   A deep link preserves `recording_id` and `offset_ms`.
4. Real availability comes from finalized segments, not an assumption of continuous coverage.
   Missing availability data stays unverified. Preview uses explicitly authored continuous spans.
5. The media-session seek offset is applied after loadedmetadata. A recording gap or expired
   link is an error; the UI never substitutes the beginning as a successful timestamp match.

## Search and open evidence

1. Describe a moment and choose camera/date filters. Date filters explicitly use UTC;
   results display a labeled Pacific timestamp and the recording-relative position.
2. Connected search calls the existing SearchRequest. Loading and service errors are visible.
3. A result contains summary, source text, camera, timestamp, provenance and playback action.
   A missing thumbnail is not replaced with a real-looking stock video frame.
4. Open at `12:00` maps to `offset_ms=720000` in the recording route. Preview opens a
   timestamped page but explains that no footage is playing.
5. No results gives filter/query guidance and notes that absence is not proof of no event.
   Indexing shows coverage/progress rather than fabricated matches.

Preview queries containing package/delivery/door/entrance/parcel can match the one authored
result. Other descriptions exercise the empty state. The fixture is a UI test, not semantic
retrieval or a quality evaluation.

## Activity and preferences

Activity groups visible observations by date, offers movement/observation and camera filters,
and opens the source recording. It uses severity-neutral language and does not infer identity
or intent. Settings exposes tab-local motion/density preferences, privacy guidance, recording
configuration boundaries, keyboard shortcuts and clearly labeled preview-state controls.
