"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { request, isAbort } from "@/lib/client-api";
import { targetHref } from "@/lib/navigation";
import type { Resource, Schema } from "@/lib/types";
import { formatDuration } from "@/lib/receipts";
import { useWorkspace } from "./workspace-provider";
import { ErrorMessage, Skeleton } from "./ui/primitives";

type Bucket = Schema["ActivityBucket"];
const BUCKET_STEPS = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const MAX_BARS = 72;

/** Smallest allowed bucket that keeps the chart legible (≤72 bars, server max 1440). */
export function bucketSecondsFor(spanMs: number) {
  return (
    BUCKET_STEPS.find((step) => spanMs / (step * 1000) <= MAX_BARS) ?? 3600
  );
}
function clock(value: string | number, withDate = false) {
  return new Date(value).toLocaleString(undefined, {
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    second: withDate ? undefined : "2-digit",
  });
}
function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((100 * part) / whole) : 0;
}

/**
 * Recorded availability, measured motion and Muse event starts per time bin. Availability is
 * context (track fill); motion shares its 0–100% bin-time axis; events are a separate count strip.
 */
export function ActivityHistogram({
  cameraId,
  start,
  end,
  cursor,
  title = "Activity over time",
}: {
  cameraId: string;
  start: string;
  end: string;
  /** Optional instant to mark, such as the current playback position. */
  cursor?: number;
  title?: string;
}) {
  const { href } = useWorkspace();
  const router = useRouter();
  const [data, setData] = useState<Resource<Schema["ActivityHistogram"]>>({
    state: "loading",
  });
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);
  const span = Date.parse(end) - Date.parse(start);
  const bucketSeconds = bucketSecondsFor(span);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      start,
      end,
      bucket_seconds: String(bucketSeconds),
    });
    request<Schema["ActivityHistogram"]>(
      `/cameras/${cameraId}/activity?${query}`,
      { signal: controller.signal },
    )
      .then((value) => setData({ state: "ready", data: value }))
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setData({
          state: "error",
          message:
            error instanceof Error ? error.message : "Activity couldn’t load.",
          code: (error as { code?: string }).code,
          requestId: (error as { requestId?: string }).requestId,
        });
      });
    return () => controller.abort();
  }, [cameraId, start, end, bucketSeconds, attempt]);
  if (data.state === "loading")
    return (
      <div className="histogram" aria-busy="true">
        <div className="histogram-heading">
          <h3>{title}</h3>
        </div>
        <Skeleton className="histogram-skeleton" />
      </div>
    );
  if (data.state === "error")
    return (
      <div className="histogram">
        <div className="histogram-heading">
          <h3>{title}</h3>
          <button
            className="muse-link-button"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Try again
          </button>
        </div>
        <ErrorMessage
          message={data.message}
          code={data.code}
          requestId={data.requestId}
        />
      </div>
    );
  const buckets = data.data.buckets;
  const bucketMs = bucketSeconds * 1000;
  const peakEvents = Math.max(
    1,
    ...buckets.map((bucket) => bucket.event_count),
  );
  const recorded = buckets.reduce((sum, bucket) => sum + bucket.coverage_ms, 0);
  const analyzed = buckets.reduce((sum, bucket) => sum + bucket.analyzed_ms, 0);
  const totalEvents = buckets.reduce(
    (sum, bucket) => sum + bucket.event_count,
    0,
  );
  const open = (bucket: Bucket) => {
    const action = bucket.playback[0];
    const destination = action ? targetHref(action.target) : null;
    if (destination) router.push(href(destination));
  };
  const describe = (bucket: Bucket) =>
    [
      `${clock(bucket.start)} to ${clock(bucket.end)}`,
      bucket.coverage_ms
        ? `${percent(bucket.coverage_ms, bucketMs)}% recorded`
        : "no recorded video",
      bucket.motion_sampled_ms
        ? `${percent(bucket.motion_ms, bucketMs)}% with motion`
        : "motion not measured",
      bucket.analyzed_ms
        ? `${bucket.event_count} Muse event${bucket.event_count === 1 ? "" : "s"}`
        : "not analyzed by Muse",
    ].join(", ");
  const shown = active ?? null;
  const cursorLeft =
    cursor !== undefined &&
    cursor >= Date.parse(start) &&
    cursor < Date.parse(end)
      ? (100 * (cursor - Date.parse(start))) / span
      : null;
  return (
    <div className="histogram">
      <div className="histogram-heading">
        <h3>{title}</h3>
        <ul className="histogram-legend" aria-label="Legend">
          <li>
            <span className="key key-recorded" />
            Recorded
          </li>
          <li>
            <span className="key key-motion" />
            Motion
          </li>
          <li>
            <span className="key key-event" />
            Muse events
          </li>
        </ul>
      </div>
      <p className="histogram-summary">
        {formatDuration(recorded)} recorded · {formatDuration(analyzed)}{" "}
        analyzed by Muse · {totalEvents} event{totalEvents === 1 ? "" : "s"} ·{" "}
        {bucketSeconds >= 60
          ? `${bucketSeconds / 60} min`
          : `${bucketSeconds}s`}{" "}
        bins
      </p>
      <div
        className="histogram-plot"
        role="group"
        aria-label={`${title}. Use arrow keys to move between time bins and Enter to open the recording.`}
        onMouseLeave={() => setActive(null)}
      >
        {cursorLeft !== null && (
          <span
            className="histogram-cursor"
            style={{ left: `${cursorLeft}%` }}
            aria-hidden="true"
          />
        )}
        {buckets.map((bucket, index) => {
          const playable = bucket.playback.length > 0;
          return (
            <button
              key={bucket.start}
              ref={(node) => {
                bars.current[index] = node;
              }}
              className={`histogram-bin ${playable ? "" : "bin-empty"} ${shown === index ? "bin-active" : ""}`}
              tabIndex={index === focusIndex ? 0 : -1}
              aria-label={`${describe(bucket)}${playable ? ". Open recording" : ""}`}
              aria-disabled={!playable}
              onMouseEnter={() => setActive(index)}
              onFocus={() => {
                setActive(index);
                setFocusIndex(index);
              }}
              onBlur={() => setActive(null)}
              onClick={() => playable && open(bucket)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? index + 1
                    : event.key === "ArrowLeft"
                      ? index - 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? buckets.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                const clamped = Math.max(0, Math.min(buckets.length - 1, next));
                setFocusIndex(clamped);
                bars.current[clamped]?.focus();
              }}
            >
              <span className="bin-track" aria-hidden="true">
                <span
                  className="bin-recorded"
                  style={{
                    height: `${percent(bucket.coverage_ms, bucketMs)}%`,
                  }}
                />
                {bucket.motion_sampled_ms > 0 && bucket.motion_ms > 0 && (
                  <span
                    className="bin-motion"
                    style={{
                      height: `${Math.max(4, percent(bucket.motion_ms, bucketMs))}%`,
                    }}
                  />
                )}
              </span>
              <span className="bin-events" aria-hidden="true">
                {bucket.event_count > 0 && (
                  <span
                    style={{
                      opacity: 0.45 + (0.55 * bucket.event_count) / peakEvents,
                    }}
                  />
                )}
              </span>
            </button>
          );
        })}
        {shown !== null && buckets[shown] && (
          <div
            className="histogram-tooltip"
            role="presentation"
            style={{
              left: `${Math.min(82, Math.max(18, (100 * (shown + 0.5)) / buckets.length))}%`,
            }}
          >
            <strong>
              {clock(buckets[shown].start)} – {clock(buckets[shown].end)}
            </strong>
            <span>
              Recorded {percent(buckets[shown].coverage_ms, bucketMs)}%
            </span>
            <span>
              {buckets[shown].motion_sampled_ms
                ? `Motion ${percent(buckets[shown].motion_ms, bucketMs)}%`
                : "Motion not measured"}
            </span>
            <span>
              {buckets[shown].analyzed_ms
                ? `${buckets[shown].event_count} Muse event${buckets[shown].event_count === 1 ? "" : "s"}`
                : "Not analyzed by Muse"}
            </span>
            {buckets[shown].playback.length ? (
              <em>Click to open this moment</em>
            ) : (
              <em>No recording to open</em>
            )}
          </div>
        )}
      </div>
      <div className="histogram-axis" aria-hidden="true">
        <span>{clock(start, true)}</span>
        <span>{clock(Date.parse(start) + span / 2)}</span>
        <span>{clock(end, true)}</span>
      </div>
      <details className="histogram-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Recorded</th>
              <th scope="col">Motion</th>
              <th scope="col">Muse events</th>
            </tr>
          </thead>
          <tbody>
            {buckets
              .filter((bucket) => bucket.coverage_ms > 0)
              .map((bucket) => (
                <tr key={bucket.start}>
                  <td>{clock(bucket.start)}</td>
                  <td>{percent(bucket.coverage_ms, bucketMs)}%</td>
                  <td>
                    {bucket.motion_sampled_ms
                      ? `${percent(bucket.motion_ms, bucketMs)}%`
                      : "Not measured"}
                  </td>
                  <td>
                    {bucket.analyzed_ms ? bucket.event_count : "Not analyzed"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
      <p className="histogram-note">
        {data.data.motion_definition} Empty bins mean no available data, not
        proof that nothing happened.
      </p>
    </div>
  );
}
