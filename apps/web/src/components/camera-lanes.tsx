"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { isAbort, request } from "@/lib/client-api";
import {
  clockTime,
  hitKey,
  timeZoneName,
  windowLabel,
  type CameraCoverage,
} from "@/lib/explore";
import { formatDuration } from "@/lib/receipts";
import type { Resource, Schema, SearchHit } from "@/lib/types";
import { Button } from "./ui/button";
import { ErrorMessage, Skeleton } from "./ui/primitives";

type Histogram = Schema["ActivityHistogram"];
const STEPS = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360].map(
  (minutes) => minutes * 60000,
);
const MIN_SELECTION_MS = 60000;

function bucketSeconds(spanMs: number) {
  return STEPS.find((step) => spanMs / (step * 1000) <= 140) ?? 3600;
}

/**
 * One lane per camera over a shared time axis. Layers come only from the activity API
 * (recorded, analyzed, motion, observation starts); clickable ticks are the current results.
 * Dragging across the tracks narrows the window; the parent re-queries with it.
 */
export function CameraLanes({
  cameras,
  start,
  end,
  hits,
  selected,
  onSelect,
  onWindow,
  zoomed,
  onReset,
}: {
  cameras: CameraCoverage[];
  start: number;
  end: number;
  hits: SearchHit[];
  selected: string | null;
  onSelect: (hit: SearchHit) => void;
  onWindow: (start: number, end: number) => void;
  zoomed: boolean;
  onReset: () => void;
}) {
  const span = end - start;
  const step = bucketSeconds(span);
  // Responses are tagged with their request so a new window never shows stale lanes.
  const requestKey = `${start}-${end}-${step}-${cameras.map((c) => c.camera_id).join()}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    lanes: Record<string, Resource<Histogram>>;
  }>({ key: "", lanes: {} });
  const data = loaded.key === requestKey ? loaded.lanes : {};
  useEffect(() => {
    const controller = new AbortController();
    const store = (id: string, value: Resource<Histogram>) =>
      setLoaded((current) => ({
        key: requestKey,
        lanes: {
          ...(current.key === requestKey ? current.lanes : {}),
          [id]: value,
        },
      }));
    const query = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      bucket_seconds: String(step),
    });
    for (const camera of cameras)
      request<Histogram>(`/cameras/${camera.camera_id}/activity?${query}`, {
        signal: controller.signal,
      })
        .then((value) =>
          store(camera.camera_id, { state: "ready", data: value }),
        )
        .catch((error) => {
          if (controller.signal.aborted || isAbort(error)) return;
          store(camera.camera_id, {
            state: "error",
            message:
              error instanceof Error
                ? error.message
                : "Activity couldn’t load.",
          });
        });
    return () => controller.abort();
  }, [cameras, start, end, step, requestKey]);

  const ticks = useMemo(() => {
    const every =
      TICK_STEPS.find((value) => span / value <= 7) ??
      TICK_STEPS[TICK_STEPS.length - 1];
    const values: number[] = [];
    for (let t = Math.ceil(start / every) * every; t < end; t += every)
      values.push(t);
    return values;
  }, [start, end, span]);

  const tracks = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const toTime = (clientX: number) => {
    const box = tracks.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return start + ratio * span;
  };
  const percent = (t: number) => `${((t - start) / span) * 100}%`;

  const totals = cameras.map((camera) => {
    const value = data[camera.camera_id];
    const buckets = value?.state === "ready" ? value.data.buckets : [];
    return {
      camera,
      recorded: buckets.reduce((sum, b) => sum + b.coverage_ms, 0),
      analyzed: buckets.reduce((sum, b) => sum + b.analyzed_ms, 0),
      motion: buckets.reduce((sum, b) => sum + b.motion_ms, 0),
      observations: buckets.reduce((sum, b) => sum + b.event_count, 0),
    };
  });

  return (
    <section className="lanes" aria-labelledby="lanes-title">
      <header className="lanes-header">
        <div>
          <h2 id="lanes-title">Activity across cameras</h2>
          <p>
            {windowLabel(start, end)} · {timeZoneName()} ·{" "}
            {zoomed
              ? "Focused period"
              : "Drag across the lanes to focus on a period"}
          </p>
        </div>
        <ul className="lanes-legend" aria-label="Timeline legend">
          <li>
            <span className="legend-recorded" aria-hidden="true" />
            Recorded
          </li>
          <li>
            <span className="legend-analyzed" aria-hidden="true" />
            Analyzed by Muse
          </li>
          <li>
            <span className="legend-motion" aria-hidden="true" />
            Motion
          </li>
          <li>
            <span className="legend-moment" aria-hidden="true" />
            Moment
          </li>
        </ul>
        {zoomed && (
          <Button variant="secondary" size="sm" onClick={onReset}>
            <Maximize2 size={14} />
            Full range
          </Button>
        )}
      </header>
      <div className="lanes-grid">
        <div className="lanes-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: percent(t) }}>
              {clockTime(t)}
            </span>
          ))}
        </div>
        <ol className="lanes-names">
          {totals.map(({ camera, observations }) => (
            <li key={camera.camera_id}>
              <strong>{camera.camera_name}</strong>
              <span>
                {data[camera.camera_id]?.state === "ready"
                  ? observations
                    ? `${observations} observed`
                    : camera.observations
                      ? "None in period"
                      : "Not analyzed"
                  : " "}
              </span>
            </li>
          ))}
        </ol>
        <div
          className={`lanes-tracks ${drag ? "is-dragging" : ""}`}
          ref={tracks}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const t = toTime(event.clientX);
            setDrag({ from: t, to: t });
          }}
          onPointerMove={(event) => {
            if (drag) setDrag({ ...drag, to: toTime(event.clientX) });
          }}
          onPointerUp={() => {
            if (!drag) return;
            const a = Math.min(drag.from, drag.to);
            const b = Math.max(drag.from, drag.to);
            setDrag(null);
            if (b - a >= MIN_SELECTION_MS) onWindow(a, b);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="lanes-gridline"
              style={{ left: percent(t) }}
              aria-hidden="true"
            />
          ))}
          {cameras.map((camera) => {
            const value = data[camera.camera_id];
            const laneHits = hits.filter(
              (hit) =>
                hit.camera_id === camera.camera_id &&
                Date.parse(hit.start) >= start &&
                Date.parse(hit.start) < end,
            );
            return (
              <div className="lane" key={camera.camera_id}>
                {!value ? (
                  <Skeleton className="lane-skeleton" />
                ) : value.state === "error" ? (
                  <span className="lane-error">{value.message}</span>
                ) : value.state === "ready" ? (
                  <LaneBars
                    buckets={value.data.buckets}
                    start={start}
                    span={span}
                  />
                ) : null}
                {clusters(laneHits, start, span).map((group) => {
                  const keys = group.map(hitKey);
                  const index = keys.indexOf(selected ?? "");
                  const first = group[0];
                  const label =
                    group.length === 1
                      ? `${first.camera_name}, ${clockTime(first.start, true)}: ${first.summary}`
                      : `${group.length} moments on ${first.camera_name} from ${clockTime(first.start, true)}${index >= 0 ? `, showing ${index + 1}` : ""}. Select to step through them.`;
                  return (
                    <button
                      key={keys[0]}
                      className={`lane-moment ${index >= 0 ? "is-selected" : ""} ${group.length > 1 ? "is-cluster" : ""}`}
                      style={{ left: percent(Date.parse(first.start)) }}
                      aria-label={label}
                      aria-pressed={index >= 0}
                      title={label}
                      // A cluster of overlapping moments advances on each press.
                      onClick={() =>
                        onSelect(group[(index + 1) % group.length])
                      }
                    >
                      {group.length > 1 && (
                        <span className="lane-count" aria-hidden="true">
                          {group.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {drag && (
            <span
              className="lanes-selection"
              style={{
                left: percent(Math.min(drag.from, drag.to)),
                width: `${(Math.abs(drag.to - drag.from) / span) * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      {Object.values(data).some((value) => value.state === "error") && (
        <ErrorMessage message="Some lanes couldn’t load. Results below are unaffected." />
      )}
      <details className="lanes-table">
        <summary>Show as table</summary>
        <table>
          <caption className="sr-only">
            Activity per camera, {windowLabel(start, end)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Camera</th>
              <th scope="col">Recorded</th>
              <th scope="col">Analyzed by Muse</th>
              <th scope="col">Motion</th>
              <th scope="col">Muse observations</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((row) => (
              <tr key={row.camera.camera_id}>
                <th scope="row">{row.camera.camera_name}</th>
                <td>{formatDuration(row.recorded)}</td>
                <td>{formatDuration(row.analyzed)}</td>
                <td>{formatDuration(row.motion)}</td>
                <td>{row.observations}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Motion is low-resolution pixel change, not object recognition. An
          empty bin means no recorded or analyzed data, not proof that nothing
          happened.
        </p>
      </details>
    </section>
  );
}

/** Moments closer than ~0.6% of the axis share one tick so each stays reachable. */
function clusters(hits: SearchHit[], start: number, span: number) {
  const sorted = [...hits].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  const groups: SearchHit[][] = [];
  for (const hit of sorted) {
    const last = groups[groups.length - 1];
    const x = (Date.parse(hit.start) - start) / span;
    if (last && x - (Date.parse(last[0].start) - start) / span < 0.006)
      last.push(hit);
    else groups.push([hit]);
  }
  return groups;
}

function LaneBars({
  buckets,
  start,
  span,
}: {
  buckets: Schema["ActivityBucket"][];
  start: number;
  span: number;
}) {
  const H = 28;
  return (
    <svg
      className="lane-bars"
      viewBox={`0 0 1000 ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {buckets.map((bucket) => {
        const x = ((Date.parse(bucket.start) - start) / span) * 1000;
        const w = Math.max(
          ((Date.parse(bucket.end) - Date.parse(bucket.start)) / span) * 1000,
          0.6,
        );
        const motion =
          bucket.motion_sampled_ms > 0
            ? bucket.motion_ms / bucket.motion_sampled_ms
            : 0;
        return (
          <g key={bucket.start}>
            {bucket.coverage_ms > 0 && (
              <>
                <rect
                  className="bar-recorded"
                  x={x}
                  y={0}
                  width={w}
                  height={H}
                />
                <rect
                  className={
                    bucket.analyzed_ms > 0 ? "bar-analyzed" : "bar-baseline"
                  }
                  x={x}
                  y={bucket.analyzed_ms > 0 ? H - 3 : H - 2}
                  width={w}
                  height={bucket.analyzed_ms > 0 ? 3 : 2}
                />
              </>
            )}
            {motion > 0 && (
              <rect
                className="bar-motion"
                x={x + w * 0.15}
                y={H - 3 - motion * (H - 10)}
                width={w * 0.7}
                height={motion * (H - 10)}
              />
            )}
            {bucket.event_count > 0 && (
              <rect
                className="bar-observed"
                x={x + w / 2 - 0.6}
                y={1}
                width={1.2}
                height={6}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
