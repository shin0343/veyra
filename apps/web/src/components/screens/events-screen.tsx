"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Eye,
  Play,
  ScanSearch,
  Waves,
} from "lucide-react";
import { isAbort, request, resourceError } from "@/lib/client-api";
import type { Event, Resource, Schema } from "@/lib/types";
import { eventTitle } from "@/lib/events";
import { plural, testCameraIds } from "@/lib/demo";
import { anchoredWindow, frameUrl } from "@/lib/explore";
import { useCoverage } from "@/lib/use-coverage";
import { EvidenceFrame } from "../evidence-frame";
import { useWorkspace } from "../workspace-provider";
import { ResourceState } from "../resource-state";
import { ActivityHistogram } from "../activity-histogram";
import { PageHeading } from "../ui/primitives";
import { Button } from "../ui/button";
import { MediaPlayer, formatOffset } from "../media-player";
import { recordingHref } from "./recordings-screen";

const PAGE = 30;
/** Recent-first keyset pages; each click reads just the next page with its original filters. */
function useEvents(
  camera: string,
  kind: string,
  period: { start: number; end: number } | null,
) {
  const { preview, events: workspaceEvents, showTestSources } = useWorkspace();
  const start = period?.start;
  const end = period?.end;
  const key = `${camera}-${kind}-${start}-${end}-${showTestSources}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    value: Resource<Event[]>;
    next: string | null;
    pending: boolean;
  }>({ key: "", value: { state: "loading" }, next: null, pending: false });
  function query(cursor?: string | null) {
    const params = new URLSearchParams({
      limit: String(PAGE),
      start: new Date(start!).toISOString(),
      end: new Date(end!).toISOString(),
      curated_only: String(!showTestSources),
    });
    if (camera !== "all") params.set("camera_id", camera);
    if (kind !== "all") params.set("kind", kind);
    if (cursor) params.set("cursor", cursor);
    return `/events?${params}`;
  }
  useEffect(() => {
    if (preview || start === undefined || end === undefined) return;
    const controller = new AbortController();
    request<Schema["EventList"]>(query(), { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            value: { state: "ready", data: data.items },
            next: data.next_cursor,
            pending: false,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbort(error))
          setLoaded({
            key,
            value: resourceError(error),
            next: null,
            pending: false,
          });
      });
    return () => controller.abort();
    // key contains all request inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, key]);
  async function showMore() {
    if (loaded.key !== key || loaded.pending || !loaded.next) return;
    setLoaded((current) => ({ ...current, pending: true }));
    try {
      const data = await request<Schema["EventList"]>(query(loaded.next));
      setLoaded((current) =>
        current.key !== key || current.value.state !== "ready"
          ? current
          : {
              key,
              value: {
                state: "ready",
                data: [...current.value.data, ...data.items].filter(
                  (item, index, all) =>
                    all.findIndex((other) => other.id === item.id) === index,
                ),
              },
              next: data.next_cursor,
              pending: false,
            },
      );
    } catch {
      // Keep verified rows and the cursor; the same read can be retried without data loss.
      setLoaded((current) =>
        current.key === key ? { ...current, pending: false } : current,
      );
    }
  }
  return preview
    ? {
        events: workspaceEvents,
        shown: Infinity,
        showMore: () => undefined,
        truncated: false,
      }
    : {
        events:
          loaded.key === key ? loaded.value : ({ state: "loading" } as const),
        shown: Infinity,
        showMore,
        truncated: loaded.key === key && Boolean(loaded.next),
      };
}

export function EventsScreen() {
  const { cameras, preview, href, showTestSources } = useWorkspace();
  // Muse observations first; frequent motion samples are one click away.
  const [kind, setKind] = useState("observation");
  const [camera, setCamera] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const coverage = useCoverage(!preview);
  // The 24 hours ending at the latest recorded video, not "now".
  const period =
    coverage.state === "ready" ? anchoredWindow(coverage.data.items) : null;
  const { events, shown, showMore, truncated } = useEvents(
    camera,
    kind,
    period,
  );
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const testIds = testCameraIds(cameraData);
  const all =
    events.state === "ready"
      ? events.data.filter(
          (event) =>
            (showTestSources || !testIds.has(event.camera_id)) &&
            (camera === "all" || camera === event.camera_id),
        )
      : [];
  const count = (value: string) =>
    all.filter((event) => value === "all" || event.kind === value).length;
  const cameraName = (id: string) =>
    cameraData.find((item) => item.id === id)?.name ?? "Camera";
  // With no camera chosen, chart the camera with the most recent activity, not an arbitrary first.
  const latestCamera = [...all].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
  )[0]?.camera_id;
  const chartCamera = camera !== "all" ? camera : latestCamera;
  return (
    <div className="log">
      <PageHeading
        title="Activity"
        description={
          events.state === "ready" ? (
            <>
              <span>
                {plural(count("observation"), "loaded Muse observation")}
              </span>
              <span>{plural(count("motion"), "loaded movement sample")}</span>
              {period && (
                <span>
                  latest recorded day, ending{" "}
                  {new Date(period.end).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </>
          ) : undefined
        }
      />
      <div className="log-filters">
        <div className="segmented-control" aria-label="Activity type">
          {[
            { value: "observation", label: "Muse observations" },
            { value: "motion", label: "Movement" },
            { value: "all", label: "Both" },
          ].map((item) => (
            <button
              key={item.value}
              aria-pressed={kind === item.value}
              onClick={() => setKind(item.value)}
            >
              {item.label}
              {events.state === "ready" && kind === item.value && (
                <span className="tc"> {count(item.value)}</span>
              )}
            </button>
          ))}
        </div>
        <label className="select-field">
          <Camera size={15} />
          <select
            aria-label="Filter activity by camera"
            value={camera}
            onChange={(event) => setCamera(event.target.value)}
          >
            <option value="all">All cameras</option>
            {cameraData
              .filter((item) => showTestSources || !testIds.has(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <span className="log-zone">
          {preview
            ? "Sample history"
            : `Times in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
        </span>
      </div>
      {!preview && chartCamera && period && (
        <details className="log-chart">
          <summary>
            Motion and analysis chart · {cameraName(chartCamera)}
            {camera === "all" ? " (most recent activity)" : ""}
          </summary>
          <ActivityHistogram
            key={chartCamera}
            cameraId={chartCamera}
            start={new Date(period.start).toISOString()}
            end={new Date(period.end).toISOString()}
            title={`Latest recorded period · ${cameraName(chartCamera)}`}
          />
        </details>
      )}
      <ResourceState
        resource={events}
        emptyTitle="No activity recorded yet"
        emptyDescription="When movement is measured or video is analyzed, it appears here. No data is not the same as no activity."
      >
        {() => {
          const filtered = all
            .filter((event) => kind === "all" || event.kind === kind)
            .sort(
              (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
            );
          const groups = new Map<string, Event[]>();
          filtered.slice(0, shown).forEach((event) => {
            const day = new Date(event.started_at).toLocaleDateString(
              undefined,
              { weekday: "long", month: "long", day: "numeric" },
            );
            groups.set(day, [...(groups.get(day) ?? []), event]);
          });
          return (
            <div className="log-days">
              {Array.from(groups, ([date, items]) => (
                <section key={date} aria-label={date}>
                  <h2 className="log-day">
                    {date}
                    <span>{plural(items.length, "entry", "entries")}</span>
                  </h2>
                  <ol className="log-list">
                    {items.map((event) => {
                      const expanded = open === event.id;
                      const target = recordingHref(
                        event.recording_id,
                        event.evidence_offset_ms,
                        event.segment_id,
                      );
                      return (
                        <li
                          key={event.id}
                          className={`log-row is-${event.kind} ${expanded ? "is-open" : ""}`}
                        >
                          <time
                            className="log-time tc"
                            dateTime={event.started_at}
                          >
                            {new Date(event.started_at).toLocaleTimeString(
                              undefined,
                              {
                                hour: "numeric",
                                minute: "2-digit",
                                second: "2-digit",
                              },
                            )}
                          </time>
                          {!preview && event.kind === "observation" ? (
                            <EvidenceFrame
                              className="log-frame"
                              src={frameUrl(
                                event.recording_id,
                                event.evidence_offset_ms,
                                event.segment_id,
                              )}
                              alt="Frame from the recording at this moment"
                            />
                          ) : (
                            <span className="log-frame log-frame-none">
                              {event.kind === "observation" ? (
                                <ScanSearch size={16} aria-hidden="true" />
                              ) : (
                                <Waves size={16} aria-hidden="true" />
                              )}
                            </span>
                          )}
                          <div className="log-text">
                            <p className="log-summary">
                              {eventTitle(event, preview)}
                            </p>
                            <p className="log-meta">
                              <strong>{cameraName(event.camera_id)}</strong>
                              <span>
                                {event.kind === "motion"
                                  ? "Movement · pixel change"
                                  : "Muse observation"}
                              </span>
                              <span className="tc">
                                {formatOffset(event.evidence_offset_ms)} in
                                recording
                              </span>
                              {preview && (
                                <span>
                                  Authored example · not a detected event
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="log-actions">
                            <button
                              className="log-play"
                              aria-expanded={expanded}
                              onClick={() =>
                                setOpen(expanded ? null : event.id)
                              }
                            >
                              <Play size={13} />
                              {expanded ? "Close" : "Watch"}
                            </button>
                            <Link className="text-button" href={href(target)}>
                              Open recording
                              <ArrowUpRight size={13} />
                            </Link>
                          </div>
                          {expanded && (
                            <div className="log-player">
                              <MediaPlayer
                                recordingId={event.recording_id}
                                segmentId={event.segment_id}
                                offsetMs={event.evidence_offset_ms}
                                durationMs={10000}
                              />
                              {event.provenance === "muse" && (
                                <p className="muted">
                                  A model description, not verified fact. Muse
                                  describes what is visible and does not
                                  identify people.
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
              {(filtered.length > shown || truncated) && (
                <div className="load-more">
                  <Button variant="secondary" size="sm" onClick={showMore}>
                    Show older activity
                  </Button>
                  <span className="muted">{filtered.length} loaded</span>
                </div>
              )}
              {truncated && (
                <p className="muted">
                  More activity is available in this period. Show older activity
                  to continue.
                </p>
              )}
              {!filtered.length && (
                <div className="filter-empty">
                  <Eye size={22} />
                  <h3>Nothing matches these filters</h3>
                  <p>
                    Try another camera or type. An empty list isn’t proof that
                    nothing happened.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setKind("all");
                      setCamera("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          );
        }}
      </ResourceState>
      <p className="quiet-note">
        <Eye size={16} />
        Observations describe visible activity. They do not identify people or
        infer intent. Movement is measured pixel change, not recognition.
      </p>
    </div>
  );
}
