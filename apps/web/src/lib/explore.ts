import type { Schema, SearchHit } from "./types";

export type IndexQuery = Schema["IndexQuery"];
export type Coverage = Schema["IndexCoverage"];
export type CameraCoverage = Schema["CameraCoverage"];

/**
 * Topic filters map one-to-one onto stored observation fields. They run through
 * POST /index-query, which never calls a model. Counts come from GET /index-coverage.
 */
export const topics = [
  { id: "all", label: "All moments", query: {} },
  {
    id: "people",
    label: "People",
    query: { event_types: ["person_visible"] },
    count: (c: CameraCoverage) => c.event_types.person_visible ?? 0,
  },
  {
    id: "bicycles",
    label: "Bicycles",
    query: { categories: ["bicycle"] },
    count: (c: CameraCoverage) => c.categories.bicycle ?? 0,
  },
  {
    id: "vehicles",
    label: "Vehicles",
    query: { event_types: ["vehicle_visible"] },
    count: (c: CameraCoverage) => c.event_types.vehicle_visible ?? 0,
    note: "Muse sometimes tags a bicycle as a vehicle.",
  },
  {
    id: "animals",
    label: "Animals",
    query: { event_types: ["animal_visible"] },
    count: (c: CameraCoverage) => c.event_types.animal_visible ?? 0,
  },
  {
    id: "walking",
    label: "Walking",
    query: { event_types: ["walking"] },
    count: (c: CameraCoverage) => c.event_types.walking ?? 0,
  },
  {
    id: "carrying",
    label: "Carrying something",
    query: { event_types: ["object_carried"] },
    count: (c: CameraCoverage) => c.event_types.object_carried ?? 0,
  },
] satisfies {
  id: string;
  label: string;
  query: Partial<IndexQuery>;
  count?: (c: CameraCoverage) => number;
  note?: string;
}[];
export type TopicId = (typeof topics)[number]["id"];
export function topicById(id: string | null | undefined) {
  return topics.find((topic) => topic.id === id) ?? topics[0];
}

// Words that clearly name one topic. Used only to *offer* an index filter when Muse can't run;
// the offer is labelled and never substituted silently for a Muse answer.
const topicWords: [TopicId, RegExp][] = [
  ["animals", /\b(animals?|dogs?|cats?|birds?|squirrels?|wildlife|pets?)\b/i],
  ["bicycles", /\b(bikes?|bicycles?|cycl\w*|riders?|riding)\b/i],
  ["vehicles", /\b(cars?|vehicles?|bus(es)?|trucks?|traffic|vans?)\b/i],
  ["carrying", /\b(carry\w*|holding|bags?|packages?|parcels?)\b/i],
  ["walking", /\bwalk\w*\b/i],
  ["people", /\b(persons?|people|someone|pedestrians?)\b/i],
];
export function closestTopic(text: string): TopicId | null {
  return topicWords.find(([, words]) => words.test(text))?.[0] ?? null;
}

export const eventLabels: Record<string, string> = {
  person_visible: "Person visible",
  vehicle_visible: "Vehicle visible",
  animal_visible: "Animal visible",
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
  object_carried: "Object carried",
  door_movement: "Door movement",
};

export function objectLabel(
  object: Pick<
    SearchHit["objects"][number],
    "category" | "attributes" | "apparel"
  >,
) {
  return [
    ...object.attributes.filter((value) => value !== "moving"),
    ...(object.apparel ?? []).map(
      (item) => `${item.colors.join("/")} ${item.kind}`,
    ),
    object.category === "other" ? "object" : object.category,
  ].join(" ");
}

const TEN_MINUTES = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * The default investigation window ends at the latest recorded footage rather than "now":
 * an idle camera or a prerecorded demo must not produce an empty "last 24 hours".
 * The API allows at most 24 hours per query.
 */
export function anchoredWindow(items: CameraCoverage[]) {
  const recorded = items.filter(
    (item) => item.first_recorded_at && item.last_recorded_at,
  );
  if (!recorded.length) return null;
  const last = Math.max(
    ...recorded.map((item) => Date.parse(item.last_recorded_at!)),
  );
  const first = Math.min(
    ...recorded.map((item) => Date.parse(item.first_recorded_at!)),
  );
  const end = Math.ceil(last / TEN_MINUTES) * TEN_MINUTES;
  const start = Math.max(
    end - DAY,
    Math.min(Math.floor(first / TEN_MINUTES) * TEN_MINUTES, end - TEN_MINUTES),
  );
  return { start, end };
}

/** Video-derived preview frame decoded server-side from the exact evidence segment. */
export function frameUrl(
  recordingId: string,
  offsetMs: number,
  segmentId?: string | null,
) {
  const query = new URLSearchParams({
    offset_ms: String(Math.max(0, Math.round(offsetMs))),
  });
  if (segmentId) query.set("segment_id", segmentId);
  return `/api/v1/recordings/${recordingId}/frame?${query}`;
}

/** A representative frame: one second into the interval, or its middle if shorter. */
export function hitFrameUrl(hit: SearchHit) {
  const span = hit.evidence.end_offset_ms - hit.evidence.start_offset_ms;
  return frameUrl(
    hit.recording_id,
    hit.evidence.start_offset_ms + Math.min(1000, Math.floor(span / 2)),
    hit.segment_id,
  );
}

export function hitKey(hit: SearchHit) {
  return `${hit.metadata_id ?? hit.evidence.event_id ?? "m"}-${hit.segment_id}-${hit.offset_ms}`;
}

export function clockTime(value: string | number, seconds = false) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  });
}
export function dayLabel(value: string | number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
export function windowLabel(start: number, end: number) {
  const sameDay = dayLabel(start) === dayLabel(end - 1);
  return sameDay
    ? `${dayLabel(start)}, ${clockTime(start)} – ${clockTime(end)}`
    : `${dayLabel(start)} ${clockTime(start)} – ${dayLabel(end)} ${clockTime(end)}`;
}
export function timeZoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
