/** "2h 40m", "6m 0s", "45s": readable totals for the summary line. */
export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Receipt text is shown verbatim with two display-only cleanups: raw millisecond counts become
 * durations ("Analyzed 164817 of 864735 available milliseconds" → "2m 45s of 14m 25s"), and a
 * sentence that repeats the end of an earlier one (several receipts joined) is shown once.
 */
export function readableReceipt(message: string) {
  const sentences = message
    .replace(
      /Analyzed (\d+) of (\d+) available milliseconds/g,
      (_, analyzed: string, available: string) =>
        `Analyzed ${formatDuration(Number(analyzed))} of ${formatDuration(Number(available))} of recorded video`,
    )
    .split(/(?<=\.)\s+/);
  return sentences
    .filter(
      (sentence, index) =>
        !sentences
          .slice(0, index)
          .some((earlier) => earlier.endsWith(sentence)),
    )
    .join(" ");
}
