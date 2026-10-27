# VIDEO-02 — video analytics evaluation

October 27, 2026, `runtime/demo`. This is a **small, honest check of what the current index
returns**, not an accuracy benchmark. No score is claimed. Raw output:
[video02/index-evaluation.json](video02/index-evaluation.json).

## What was evaluated

- Index: 35 successfully analyzed 10 s clips (30 Trail camera, 1 each for Entrance gate, Street
  approach, Garden wildlife, Community space, Bicycle parking), 95 stored Muse observations,
  pipeline unchanged from VIDEO-01. **No re-indexing and no new uploads were performed.**
- Queries: the six Explore topic filters plus two keyword filters, via `POST /index-query`
  (no model), window Oct 27 07:40–15:30 UTC; and one genuine Muse search through the UI.
- Independent reference: contact sheets (0.6 fps, six frames) decoded directly from each of the
  five newly analyzed clip files with FFmpeg and reviewed by eye, plus the scene descriptions in
  [VIDEO_LIBRARY](../demo/VIDEO_LIBRARY.md). The 30 Trail clips were not re-reviewed frame by frame.

## Topic filters → cameras returned

Limit 50 per query; three topics hit the cap (Trail camera dominates them).

| Topic (filter) | Hits | Cameras returned | Uncertainty low/med/high |
| --- | ---: | --- | --- |
| People (`person_visible`) | 50 (cap) | Trail 44, Bicycle parking 3, Community 2, Entrance 1 | 4 / 30 / 16 |
| Bicycles (category `bicycle`) | 50 (cap) | Trail 47, Bicycle parking 3 | 5 / 30 / 15 |
| Vehicles (`vehicle_visible`) | 50 (cap) | Trail 44, Bicycle parking 3, Entrance 2, Street 1 | 6 / 31 / 13 |
| Animals (`animal_visible`) | 1 | Garden wildlife 1 | 0 / 1 / 0 |
| Walking (`walking`) | 6 | Bicycle parking 3, Community 2, Entrance 1 | 1 / 4 / 1 |
| Carrying (`object_carried`) | 4 | Bicycle parking 2, Community 1, Entrance 1 | 0 / 4 / 0 |
| Keyword `squirrels` | 1 | Garden wildlife 1 | 0 / 1 / 0 |
| Keyword `buses` | 1 | Street approach 1 | 1 / 0 / 0 |

Server latency per query: 0.80–1.44 s (single samples; dominated by verifying ~7,700 segment
files on disk). Coverage was reported `partial` for every query, which is correct: 35 of 7,724
clips are analyzed.

## Independent check of the five newly analyzed clips

| Clip (0–10 s) | Seen in the actual frames | Index says | Assessment |
| --- | --- | --- | --- |
| Garden wildlife | Two red squirrels on a feeder | Animal visible; "two reddish-brown squirrels…" | Consistent |
| Street approach | Buses, a white utility truck, cars; **no cyclist visible in this clip** | Vehicle visible; buses/truck/cars | Consistent. The film has cyclists later, outside the analyzed clip — not a miss |
| Community space | Several people walking; one with a shoulder bag | Person, walking, object carried | Consistent |
| Bicycle parking | People walking bicycles down stairs, a person with a bag, an indoor hallway; **no motor vehicle** | Person, walking, object carried, bicycle **and** vehicle visible (3) | Bicycles/people consistent; `vehicle_visible` is a **false positive** for the UI meaning of "Vehicles" |
| Entrance gate | Red gate, barricade, parked yellow/dark vehicles; people small and hard to confirm at this sampling | Person (1), vehicle (2, incl. "a yellow and black three-wheeled motor vehicle passes"), walking (1), carrying (1) | Vehicles consistent (the library also records a passing three-wheeler); person/walking/carrying **not confirmable** from six sampled frames |

Trail camera: 54 of its 86 observations carry `vehicle_visible`, while the film shows a cyclist
on trails (no motor vehicles in the scene description). This is the same bicycle-as-vehicle
pattern. Two Trail observations describe the **synthetic colour-bar test pattern** at the start
of the historical recording (objects `other`, no event types); they are genuine model
descriptions of a test pattern, appear under "All moments", and are excluded by every topic
filter. (Verified by query: 11 observations list only `other` objects — 2 test pattern, 7 empty
trail/valley scenery, the Entrance three-wheeler, the Garden squirrels.)

**Consequences applied in the UI:** the Vehicles chip carries the note "Muse sometimes tags a
bicycle as a vehicle." No result is relabelled or hidden; the stored observation is shown as is.

## Genuine Muse search (paid, one request)

| Query | Muse understood | Result | Latency |
| --- | --- | --- | --- |
| "squirrels at the feeder" | Animal visible, keyword "feeder" | 1 moment — Garden wildlife, the squirrel clip; frame and inspector playback show the squirrels | 14.9 s in the browser (14.8 s server) |

Single observed sample; not a latency benchmark. Muse search remains bounded lexical/structured
retrieval: synonyms outside the stored wording, brief unsampled events and unanalyzed footage can
be missed. No negative claim ("it never happened") is ever made.

## Evidence-to-playback grounding

Every result opened in tests mapped to a real recording and segment: the inspector plays the
exact segment (`segment_id`), and **Open in recording** lands on
`/recordings/{id}?offset_ms=…&segment_id=…` and plays (VIDEO-02 flows: Garden squirrels, Street
approach, Bicycle parking). Frame thumbnails are decoded from the same segment file at
`start + min(1 s, half the interval)`, quantised to 250 ms.

## Not established

General accuracy, recall, boundary error, behaviour on other footage, the separate
five-scene/ten-query gate from PRODUCT.md, and performance at scale. Entrance gate
person/walking/carrying claims could not be confirmed or refuted from sampled frames.
