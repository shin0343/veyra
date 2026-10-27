import type { Event } from "./types";

/**
 * Plain-language title for an event. Measured motion carries a technical server summary
 * ("low-resolution frame changes"); people see "Movement detected" and the summary as detail.
 * Muse observations and authored preview examples keep their own wording.
 */
export function eventTitle(event: Event, preview: boolean) {
  return !preview && event.kind === "motion" && event.provenance !== "muse"
    ? "Movement detected"
    : event.summary;
}
