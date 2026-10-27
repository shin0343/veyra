"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Camera, Eye, ScanSearch, Waves } from "lucide-react";
import { isAbort, request, resourceError } from "@/lib/client-api";
import type { Event, Resource, Schema } from "@/lib/types";
import { eventTitle } from "@/lib/events";
import { anchoredWindow, frameUrl } from "@/lib/explore";
import { useCoverage } from "@/lib/use-coverage";
import { EvidenceFrame } from "../evidence-frame";
import { useWorkspace } from "../workspace-provider";
import { ResourceState } from "../resource-state";
import { ActivityHistogram } from "../activity-histogram";
import { Badge, PageHeading } from "../ui/primitives";
import { Button } from "../ui/button";
import { formatOffset } from "../media-player";
import { recordingHref } from "./recordings-screen";

const PAGE = 30;
/**
 * The server pages /events oldest-first. Within the bounded (≤ 24 h) period, read every page
 * (at most 10 × 100) so the list can honestly be newest-first, then reveal it in pages.
 */
function useEvents(
  camera: string,
  period: { start: number; end: number } | null,
) {
  const { preview, events: workspaceEvents } = useWorkspace();
  const [loaded, setLoaded] = useState<{
    key: string;
    value: Resource<Event[]>;
    truncated: boolean;
  }>({ key: "", value: { state: "loading" }, truncated: false });
  const [shown, setShown] = useState(PAGE);
  const start = period?.start;
  const end = period?.end;
  const key = `${camera}-${start}-${end}`;
  useEffect(() => {
    if (preview || start === undefined || end === undefined) return;
    const controller = new AbortController();
    void (async () => {
      const items: Event[] = [];
      let cursor: string | null = null;
      try {
        for (let page = 0; page < 10; page++) {
          const query = new URLSearchParams({
            limit: "100",
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
          });
          if (camera !== "all") query.set("camera_id", camera);
          if (cursor) query.set("cursor", cursor);
          const data: Schema["EventList"] = await request(`/events?${query}`, {
            signal: controller.signal,
          });
          items.push(...data.items);
          cursor = data.next_cursor;
          if (!cursor) break;
        }
        setLoaded({
          key,
          value: { state: "ready", data: items },
          truncated: Boolean(cursor),
        });
      } catch (error) {
        if (!controller.signal.aborted && !isAbort(error))
          setLoaded({ key, value: resourceError(error), truncated: false });
      }
    })();
    return () => controller.abort();
  }, [camera, preview, start, end, key]);
  if (preview)
    return {
      events: workspaceEvents,
      shown: Infinity,
      showMore: () => undefined,
      truncated: false,
    };
  return {
    events: loaded.key === key ? loaded.value : ({ state: "loading" } as const),
    shown,
    showMore: () => setShown((value) => value + PAGE),
    truncated: loaded.key === key && loaded.truncated,
  };
}

export function EventsScreen() {
  const { cameras, preview, href } = useWorkspace();
  // Muse observations first; frequent motion samples are one click away.
  const [kind, setKind] = useState("observation");
  const [camera, setCamera] = useState("all");
  const coverage = useCoverage(!preview);
  // The 24 hours ending at the latest recorded video, not "now".
  const period =
    coverage.state === "ready" ? anchoredWindow(coverage.data.items) : null;
  const { events, shown, showMore, truncated } = useEvents(camera, period);
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  // With no camera chosen, chart the camera with the most recent activity, not an arbitrary first.
  const latestCamera =
    events.state === "ready"
      ? [...events.data].sort(
          (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
        )[0]?.camera_id
      : undefined;
  const histogramCamera =
    camera !== "all"
      ? camera
      : (cameraData.find((item) => item.id === latestCamera) ?? cameraData[0])
          ?.id;
  return (
    <>
      <PageHeading
        title="Activity"
        description="What Muse observed and what moved, newest first, with the footage one click away."
      />
      <div className="filter-toolbar">
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
            </button>
          ))}
        </div>
        <label className="select-field">
          <Camera size={16} />
          <select
            aria-label="Filter activity by camera"
            value={camera}
            onChange={(event) => setCamera(event.target.value)}
          >
            <option value="all">All cameras</option>
            {cameras.state === "ready" &&
              cameras.data.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {!preview && histogramCamera && period && (
        <ActivityHistogram
          key={histogramCamera}
          cameraId={histogramCamera}
          start={new Date(period.start).toISOString()}
          end={new Date(period.end).toISOString()}
          title={`Latest recorded period · ${
            cameraData.find((item) => item.id === histogramCamera)?.name ??
            "Camera"
          }${camera === "all" ? " · most recent activity" : ""}`}
        />
      )}
      <ResourceState
        resource={events}
        emptyTitle="Your activity history has room to grow"
        emptyDescription="When activity is detected or video is indexed, grounded observations will appear here. No available data is not the same as no activity."
      >
        {(data) => {
          const filtered = [...data]
            .filter(
              (event) =>
                (kind === "all" || event.kind === kind) &&
                (camera === "all" || camera === event.camera_id),
            )
            .sort(
              (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
            );
          const groups = new Map<string, Event[]>();
          filtered.slice(0, shown).forEach((event) => {
            const day = new Date(event.started_at).toLocaleDateString(
              undefined,
              {
                month: "long",
                day: "numeric",
                year: "numeric",
              },
            );
            groups.set(day, [...(groups.get(day) ?? []), event]);
          });
          return (
            <div className="event-history">
              {Array.from(groups, ([date, items]) => (
                <section key={date}>
                  <div className="event-date">
                    <h2>{date}</h2>
                    <span>
                      {preview
                        ? "Sample history"
                        : Intl.DateTimeFormat().resolvedOptions().timeZone}
                    </span>
                  </div>
                  {items.map((event) => (
                    <article
                      className={`event-card ${!preview && event.kind === "observation" ? "event-card-framed" : ""}`}
                      key={event.id}
                    >
                      {!preview && event.kind === "observation" ? (
                        <EvidenceFrame
                          className="event-frame"
                          src={frameUrl(
                            event.recording_id,
                            event.evidence_offset_ms,
                            event.segment_id,
                          )}
                          alt={`Frame from the recording at this moment`}
                        />
                      ) : (
                        <span className={`event-icon event-${event.kind}`}>
                          {event.kind === "observation" ? (
                            <ScanSearch size={21} />
                          ) : (
                            <Waves size={21} />
                          )}
                        </span>
                      )}
                      <div className="event-card-main">
                        <div className="button-row">
                          <h3>{eventTitle(event, preview)}</h3>
                          <Badge
                            tone={event.kind === "motion" ? "neutral" : "blue"}
                          >
                            {event.kind === "motion"
                              ? "Movement"
                              : "Observation"}
                          </Badge>
                        </div>
                        <p>
                          {cameras.state === "ready"
                            ? (cameras.data.find(
                                (camera) => camera.id === event.camera_id,
                              )?.name ?? "Camera")
                            : "Camera"}
                          <span>
                            At {formatOffset(event.evidence_offset_ms)} in
                            recording
                          </span>
                        </p>
                        <small>
                          {preview
                            ? "Authored example · not a detected event"
                            : event.provenance === "muse"
                              ? `Indexed with ${event.model_id}`
                              : `${event.summary} Review the video for context.`}
                        </small>
                      </div>
                      <div className="event-card-action">
                        <time dateTime={event.started_at}>
                          {new Date(event.started_at).toLocaleTimeString(
                            undefined,
                            {
                              hour: "numeric",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )}
                        </time>
                        <Button asChild variant="secondary" size="sm">
                          <Link
                            href={href(
                              recordingHref(
                                event.recording_id,
                                event.evidence_offset_ms,
                                event.segment_id,
                              ),
                            )}
                          >
                            Review moment
                            <ArrowUpRight size={14} />
                          </Link>
                        </Button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
              {filtered.length > shown && (
                <div className="load-more">
                  <Button variant="secondary" onClick={showMore}>
                    Show older activity
                  </Button>
                  <span className="muted">
                    {shown} of {filtered.length} shown
                  </span>
                </div>
              )}
              {truncated && (
                <p className="muted">
                  Showing the first 1,000 events in this period. Choose a camera
                  to narrow it.
                </p>
              )}
              {!filtered.length && (
                <div className="filter-empty">
                  <Eye size={24} />
                  <h3>No activity matches these filters</h3>
                  <p>Try another camera or activity type.</p>
                  <Button
                    variant="secondary"
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
        <Eye size={18} />
        Observations describe visible activity. They do not identify people or
        infer intent.
      </p>
    </>
  );
}
