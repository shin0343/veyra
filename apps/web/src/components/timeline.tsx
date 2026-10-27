"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Maximize2, ScanLine } from "lucide-react";
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
 * The recording timeline under the player. One lane per camera over a shared axis; layers
 * come only from the activity API (recorded, analyzed, motion), result ticks are the current
 * moments, the band is the selected moment's interval and the playhead follows the player.
 * Dragging across the tracks narrows the window; the parent re-queries the index with it.
 */
export function Timeline({
  cameras,
  start,
  end,
  hits,
  selected,
  playhead,
  onSelect,
  onWindow,
  zoomed,
  onReset,
}: {
  cameras: CameraCoverage[];
  start: number;
  end: number;
  hits: SearchHit[];
  selected: SearchHit | null;
  /** Wall-clock time of the playing frame, when the selected clip is playing. */
  playhead: number | null;
  onSelect: (hit: SearchHit) => void;
  onWindow: (start: number, end: number) => void;
  zoomed: boolean;
  onReset: () => void;
}) {
  const span = end - start;
  const step = bucketSeconds(span);
  const [showIdle, setShowIdle] = useState(false);
  // Cameras with no Muse observations at all fold into one line until asked for.
  const idle = cameras.filter((camera) => !camera.observations);
  const lanes = showIdle
    ? cameras
    : cameras.filter((camera) => camera.observations);
  // Responses are tagged with their request so a new window never shows stale lanes.
  const laneIds = lanes.map((c) => c.camera_id).join();
  const requestKey = `${start}|${end}|${step}|${laneIds}`;
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
    for (const id of laneIds.split(",").filter(Boolean))
      request<Histogram>(`/cameras/${id}/activity?${query}`, {
        signal: controller.signal,
      })
        .then((value) => store(id, { state: "ready", data: value }))
        .catch((error) => {
          if (controller.signal.aborted || isAbort(error)) return;
          store(id, {
            state: "error",
            message:
              error instanceof Error
                ? error.message
                : "Activity couldn’t load.",
          });
        });
    return () => controller.abort();
  }, [start, end, step, laneIds, requestKey]);

  const ticks = useMemo(() => {
    const every =
      TICK_STEPS.find((value) => span / value <= 6) ??
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
  const inside = (t: number) => t >= start && t <= end;

  // "Fit to moments" is offered only when the moments occupy a sliver of the axis.
  const fit = useMemo(() => {
    if (!hits.length) return null;
    const first = Math.min(...hits.map((hit) => Date.parse(hit.start)));
    const last = Math.max(...hits.map((hit) => Date.parse(hit.end)));
    const pad = Math.max(60000, (last - first) * 0.08);
    const a = Math.max(start, first - pad);
    const b = Math.min(end, last + pad);
    return b - a < span * 0.6 && b - a >= MIN_SELECTION_MS
      ? { start: a, end: b }
      : null;
  }, [hits, start, end, span]);

  const totals = lanes.map((camera) => {
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
  const selectedStart = selected ? Date.parse(selected.start) : null;
  const selectedEnd = selected ? Date.parse(selected.end) : null;

  return (
    <section className="tl" aria-labelledby="tl-title">
      <header className="tl-head">
        <h2 id="tl-title">Timeline</h2>
        <span className="tl-window">
          {windowLabel(start, end)}
          <span className="tl-zone"> · {timeZoneName()}</span>
        </span>
        <ul className="tl-legend" aria-label="Timeline legend">
          <li>
            <span className="legend-recorded" aria-hidden="true" />
            Recorded
          </li>
          <li>
            <span className="legend-analyzed" aria-hidden="true" />
            Analyzed
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
        <span className="tl-tools">
          {fit && !zoomed && (
            <button
              className="tl-tool"
              onClick={() => onWindow(fit.start, fit.end)}
              aria-label="Fit to moments"
              title="Zoom the timeline to where these moments are"
            >
              <ScanLine size={13} />
              Fit
            </button>
          )}
          {zoomed && (
            <button className="tl-tool" onClick={onReset}>
              <Maximize2 size={13} />
              Full range
            </button>
          )}
        </span>
      </header>
      <div className="tl-grid">
        <div className="tl-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: percent(t) }}>
              {clockTime(t)}
            </span>
          ))}
          {playhead !== null && inside(playhead) && (
            <span
              className="tl-playhead-cap"
              style={{ left: percent(playhead) }}
            />
          )}
        </div>
        <ol className="tl-names">
          {totals.map(({ camera, observations }) => (
            <li
              key={camera.camera_id}
              className={
                selected?.camera_id === camera.camera_id ? "is-current" : ""
              }
            >
              <strong>{camera.camera_name}</strong>
              <span>
                {data[camera.camera_id]?.state === "ready"
                  ? observations || (camera.observations ? "–" : "Not analyzed")
                  : ""}
              </span>
            </li>
          ))}
        </ol>
        <div
          className={`tl-tracks ${drag ? "is-dragging" : ""}`}
          ref={tracks}
          title="Drag across the lanes to focus on a period"
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
              className="tl-gridline"
              style={{ left: percent(t) }}
              aria-hidden="true"
            />
          ))}
          {lanes.map((camera) => {
            const value = data[camera.camera_id];
            const laneHits = hits.filter(
              (hit) =>
                hit.camera_id === camera.camera_id &&
                inside(Date.parse(hit.start)),
            );
            return (
              <div className="tl-lane" key={camera.camera_id}>
                {!value ? (
                  <Skeleton className="tl-lane-skeleton" />
                ) : value.state === "error" ? (
                  <span className="tl-lane-error">{value.message}</span>
                ) : value.state === "ready" ? (
                  <LaneBars
                    buckets={value.data.buckets}
                    start={start}
                    span={span}
                  />
                ) : null}
                {selected?.camera_id === camera.camera_id &&
                  selectedStart !== null &&
                  selectedEnd !== null &&
                  inside(selectedStart) && (
                    <span
                      className="tl-band"
                      aria-hidden="true"
                      style={{
                        left: percent(selectedStart),
                        width: `max(3px, ${((selectedEnd - selectedStart) / span) * 100}%)`,
                      }}
                    />
                  )}
                {clusters(laneHits, start, span).map((group) => {
                  const keys = group.map(hitKey);
                  const index = keys.indexOf(selected ? hitKey(selected) : "");
                  const first = group[0];
                  const label =
                    group.length === 1
                      ? `${first.camera_name}, ${clockTime(first.start, true)}: ${first.summary}`
                      : `${group.length} moments on ${first.camera_name} from ${clockTime(first.start, true)}${index >= 0 ? `, showing ${index + 1}` : ""}. Select to step through them.`;
                  return (
                    <button
                      key={keys[0]}
                      className={`tl-moment ${index >= 0 ? "is-selected" : ""} ${group.length > 1 ? "is-cluster" : ""}`}
                      style={{ left: percent(Date.parse(first.start)) }}
                      aria-label={label}
                      aria-pressed={index >= 0}
                      title={label}
                      // A cluster of overlapping moments advances on each press.
                      onClick={() =>
                        onSelect(group[(index + 1) % group.length])
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowLeft" &&
                          event.key !== "ArrowRight"
                        )
                          return;
                        event.preventDefault();
                        const all = [
                          ...(tracks.current?.querySelectorAll<HTMLButtonElement>(
                            "button.tl-moment",
                          ) ?? []),
                        ].sort(
                          (a, b) =>
                            a.getBoundingClientRect().left -
                            b.getBoundingClientRect().left,
                        );
                        const at = all.indexOf(event.currentTarget);
                        all[
                          at + (event.key === "ArrowRight" ? 1 : -1)
                        ]?.focus();
                      }}
                    >
                      {group.length > 1 && (
                        <span className="tl-count" aria-hidden="true">
                          {group.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {playhead !== null && inside(playhead) && (
            <span
              className="tl-playhead"
              style={{ left: percent(playhead) }}
              aria-hidden="true"
            />
          )}
          {drag && (
            <span
              className="tl-selection"
              style={{
                left: percent(Math.min(drag.from, drag.to)),
                width: `${(Math.abs(drag.to - drag.from) / span) * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      <div className="tl-foot">
        {!!idle.length && (
          <button
            className="tl-idle"
            aria-expanded={showIdle}
            onClick={() => setShowIdle((value) => !value)}
          >
            <ChevronDown size={13} />
            {showIdle
              ? "Hide cameras Muse hasn’t analyzed"
              : `${idle.length} more camera${idle.length === 1 ? "" : "s"} recorded here, not analyzed`}
          </button>
        )}
        <details className="tl-table">
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
      </div>
      {Object.values(data).some((value) => value.state === "error") && (
        <ErrorMessage message="Some lanes couldn’t load. Results are unaffected." />
      )}
    </section>
  );
}

/** Moments closer than ~0.8% of the axis share one tick so each stays reachable. */
function clusters(hits: SearchHit[], start: number, span: number) {
  const sorted = [...hits].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  const groups: SearchHit[][] = [];
  for (const hit of sorted) {
    const last = groups[groups.length - 1];
    const x = (Date.parse(hit.start) - start) / span;
    if (last && x - (Date.parse(last[0].start) - start) / span < 0.008)
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
  const H = 22;
  return (
    <svg
      className="tl-bars"
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
                  y={2}
                  width={w}
                  height={H - 2}
                />
                <rect
                  className={
                    bucket.analyzed_ms > 0 ? "bar-analyzed" : "bar-baseline"
                  }
                  x={x}
                  y={bucket.analyzed_ms > 0 ? H - 3 : H - 1.5}
                  width={w}
                  height={bucket.analyzed_ms > 0 ? 3 : 1.5}
                />
              </>
            )}
            {motion > 0 && (
              <rect
                className="bar-motion"
                x={x + w * 0.15}
                y={H - 3 - motion * (H - 9)}
                width={w * 0.7}
                height={motion * (H - 9)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
