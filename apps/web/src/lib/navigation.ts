import type { NavigationTarget } from "./types";

export const appRoutes = {
  home: "/",
  cameras: "/cameras",
  live: "/live",
  recordings: "/recordings",
  search: "/explore",
  events: "/events",
  layouts: "/layouts",
  settings: "/settings",
} as const;
export type AppRoute = keyof typeof appRoutes;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function targetHref(target: NavigationTarget): string | null {
  switch (target.kind) {
    case "feature":
      return appRoutes[target.feature_id] ?? null;
    case "camera_live":
      return uuidPattern.test(target.camera_id)
        ? `/live?camera_id=${target.camera_id}`
        : null;
    case "layout":
      return uuidPattern.test(target.layout_id)
        ? `/layouts/${target.layout_id}`
        : null;
    case "recording":
      return uuidPattern.test(target.recording_id) &&
        Number.isSafeInteger(target.offset_ms) &&
        target.offset_ms >= 0 &&
        (!target.segment_id || uuidPattern.test(target.segment_id))
        ? `/recordings/${target.recording_id}?offset_ms=${target.offset_ms}${target.segment_id ? `&segment_id=${target.segment_id}` : ""}`
        : null;
    default:
      return null;
  }
}

export function previewHref(href: string, preview: boolean) {
  if (!preview) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}preview=1${hash ? `#${hash}` : ""}`;
}

export const destinations: {
  id: AppRoute;
  title: string;
  description: string;
  words: string;
}[] = [
  {
    id: "cameras",
    title: "Your cameras",
    description: "Connect a camera or check its connection.",
    words: "camera connect add device space",
  },
  {
    id: "live",
    title: "Live view",
    description: "See one camera or bring four views together.",
    words: "watch live feed stream grid",
  },
  {
    id: "recordings",
    title: "Recordings",
    description: "Find a recording and return to a moment.",
    words: "play playback recordings history timeline",
  },
  {
    id: "layouts",
    title: "Saved views",
    description: "Keep a camera arrangement for next time.",
    words: "layout save view arrange cameras grid",
  },
  {
    id: "search",
    title: "Explore your video",
    description: "Search, filter and review what your cameras saw.",
    words:
      "find search explore video footage moment analysis timeline people animals vehicles bicycles",
  },
  {
    id: "events",
    title: "Activity",
    description: "Review observations with their video context.",
    words: "events activity motion happened",
  },
  {
    id: "settings",
    title: "Recording settings",
    description: "Review recording preferences and video privacy.",
    words: "settings adjust recording storage privacy preferences",
  },
];

export function findDestinations(query: string) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (!words.length) return destinations.slice(0, 4);
  return destinations
    .map((item) => ({
      item,
      score: words.reduce(
        (sum, word) => sum + (item.words.includes(word) ? 1 : 0),
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.item);
}
