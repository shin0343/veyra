"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CalendarDays,
  Camera,
  Clock3,
  Film,
  Play,
  Redo2,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { ApiError, isAbort, mutationOptions, request } from "@/lib/client-api";
import { eventTitle } from "@/lib/events";
import { frameUrl } from "@/lib/explore";
import { isTestRecording, plural, testCameraIds } from "@/lib/demo";
import { uuidPattern } from "@/lib/navigation";
import { useCoverage } from "@/lib/use-coverage";
import { useRequestKey } from "@/lib/use-request-key";
import { useWorkspace } from "../workspace-provider";
import { SourceMediaCredit } from "../source-media";
import { ResourceState } from "../resource-state";
import { MediaPlayer, formatOffset, parseOffset } from "../media-player";
import { ActivityHistogram } from "../activity-histogram";
import { EvidenceFrame } from "../evidence-frame";
import {
  Badge,
  PageHeading,
  ProblemMessage,
  Skeleton,
  StatePanel,
} from "../ui/primitives";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import type {
  Camera as CameraType,
  Event,
  Recording,
  Resource,
  Schema,
} from "@/lib/types";

const DAY_MS = 86400000;
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const subscribeZone = () => () => {};
const serverZone = () => "your local time";
export function recordingHref(
  recordingId: string,
  offsetMs: number,
  segmentId?: string | null,
) {
  return `/recordings/${recordingId}?offset_ms=${Math.max(0, Math.round(offsetMs))}${
    segmentId && uuidPattern.test(segmentId) ? `&segment_id=${segmentId}` : ""
  }`;
}
function localDay(value: string) {
  return new Date(value).toLocaleDateString("en-CA");
}
function recordingSpan(recording: Recording) {
  return Math.max(
    recording.available_duration_ms,
    recording.ended_at
      ? Date.parse(recording.ended_at) - Date.parse(recording.started_at)
      : Date.now() - Date.parse(recording.started_at),
    1000,
  );
}

/** A recording opened by link may be older than the first library page; read it directly. */
function useRecording(
  recordingId: string | undefined,
  list: Resource<Recording[]>,
) {
  const { preview } = useWorkspace();
  const listed =
    list.state === "ready"
      ? list.data.find((item) => item.id === recordingId)
      : undefined;
  const [direct, setDirect] = useState<Resource<Recording> | null>(null);
  useEffect(() => {
    if (!recordingId || preview || listed || list.state === "loading") return;
    const controller = new AbortController();
    request<Recording>(`/recordings/${recordingId}`, {
      signal: controller.signal,
    })
      .then((data) => setDirect({ state: "ready", data }))
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setDirect({
          state: "error",
          message: error instanceof Error ? error.message : "",
          code: error instanceof ApiError ? error.code : undefined,
        });
      });
    return () => controller.abort();
  }, [recordingId, preview, listed, list.state]);
  if (!recordingId) return null;
  if (listed) return { state: "ready", data: listed } as Resource<Recording>;
  return direct ?? ({ state: "loading" } as Resource<Recording>);
}

export function RecordingsScreen({ recordingId }: { recordingId?: string }) {
  const timezone = useSyncExternalStore(subscribeZone, zone, serverZone);
  const workspace = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [cameraFilter, setCameraFilter] = useState(
    params.get("camera_id") ?? "all",
  );
  const [date, setDate] = useState("");
  const rawOffset = Number(params.get("offset_ms") ?? 0);
  const offset =
    Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const invalidOffset = !Number.isSafeInteger(rawOffset) || rawOffset < 0;
  const rawSegment = params.get("segment_id");
  const segmentId =
    rawSegment && uuidPattern.test(rawSegment) ? rawSegment : null;
  const cameraData =
    workspace.cameras.state === "ready" ? workspace.cameras.data : [];
  const selected = useRecording(recordingId, workspace.recordings);
  const coverage = useCoverage(!workspace.preview);
  const testIds = testCameraIds(cameraData);
  const all =
    workspace.recordings.state === "ready"
      ? workspace.recordings.data.filter((r) => r.status !== "deleted")
      : [];
  const hiddenTests =
    workspace.showTestSources || workspace.preview
      ? 0
      : all.filter((r) => isTestRecording(r, testIds)).length;
  // Open on the recording that holds the newest Muse observation, not merely the newest file.
  const latestObservation =
    coverage.state === "ready"
      ? coverage.data.items
          .filter((item) => item.last_observation_at)
          .sort(
            (a, b) =>
              Date.parse(b.last_observation_at!) -
              Date.parse(a.last_observation_at!),
          )[0]
      : undefined;
  const withMoments = latestObservation
    ? all.find(
        (r) =>
          r.camera_id === latestObservation.camera_id &&
          Date.parse(r.started_at) <=
            Date.parse(latestObservation.last_observation_at!) &&
          Date.parse(latestObservation.last_observation_at!) <=
            Date.parse(r.started_at) + recordingSpan(r),
      )
    : undefined;
  return (
    <div className="rec">
      <PageHeading
        title="Recordings"
        description={
          workspace.recordings.state === "ready" ? (
            <>
              <span>{plural(all.length - hiddenTests, "recording")}</span>
              {!!hiddenTests && (
                <span>
                  {plural(hiddenTests, "test or unverified recording")} hidden
                </span>
              )}
              <span>times in {timezone}</span>
            </>
          ) : undefined
        }
      />
      <div className="filter-toolbar rec-filters">
        <label className="select-field">
          <Camera size={16} />
          <select
            aria-label="Filter recordings by camera"
            value={cameraFilter}
            onChange={(event) => setCameraFilter(event.target.value)}
          >
            <option value="all">All cameras</option>
            {cameraData.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>
        </label>
        <label className="date-filter">
          <CalendarDays size={16} />
          <input
            type="date"
            aria-label="Recording date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        {!!testIds.size && (
          <label className="test-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={workspace.showTestSources}
              onChange={(event) =>
                workspace.setShowTestSources(event.target.checked)
              }
            />
            Show test recordings
          </label>
        )}
      </div>
      <ResourceState
        resource={workspace.recordings}
        emptyTitle="Your timeline starts with a recording"
        emptyDescription="Available recordings will appear here when a connected camera has captured video."
        emptyAction={
          <Button asChild variant="secondary">
            <Link href={workspace.href("/cameras")}>View cameras</Link>
          </Button>
        }
      >
        {(data) => {
          const filtered = data
            .filter(
              (recording) =>
                recording.status !== "deleted" &&
                (workspace.showTestSources ||
                  workspace.preview ||
                  !isTestRecording(recording, testIds) ||
                  recording.id === recordingId) &&
                (cameraFilter === "all" ||
                  recording.camera_id === cameraFilter) &&
                (!date || localDay(recording.started_at) === date),
            )
            .sort(
              (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
            );
          const fallback =
            filtered.find((item) => item.id === withMoments?.id) ?? filtered[0];
          const library = (
            <RecordingLibrary
              recordings={filtered}
              cameras={cameraData}
              current={recordingId ?? fallback?.id}
            />
          );
          if (selected?.state === "loading")
            return (
              <div className="recording-layout">
                {library}
                <section className="recording-main" aria-busy="true">
                  <Skeleton className="skeleton-title" />
                  <div className="media-player" />
                </section>
              </div>
            );
          const recording =
            selected?.state === "ready"
              ? selected.data
              : recordingId
                ? undefined
                : fallback;
          if (!recording)
            return (
              <div className="recording-layout">
                {library}
                <StatePanel
                  kind="search"
                  title={
                    recordingId
                      ? "This recording isn’t available"
                      : "No recordings match these filters"
                  }
                  description={
                    recordingId
                      ? "It may have expired, or this workspace may not have access."
                      : "Try a different date or camera."
                  }
                />
              </div>
            );
          if (invalidOffset)
            return (
              <StatePanel
                kind="error"
                title="This timestamp isn’t valid"
                description="Open a moment from the recording timeline or a video search result."
              />
            );
          return (
            <div className="recording-layout">
              {library}
              <RecordingDetail
                key={recording.id}
                recording={recording}
                camera={cameraData.find(
                  (item) => item.id === recording.camera_id,
                )}
                offset={offset}
                segmentId={segmentId}
                onSeek={(value, segment) =>
                  router.replace(
                    workspace.href(recordingHref(recording.id, value, segment)),
                    { scroll: false },
                  )
                }
              />
            </div>
          );
        }}
      </ResourceState>
    </div>
  );
}

function RecordingLibrary({
  recordings,
  cameras,
  current,
}: {
  recordings: Recording[];
  cameras: CameraType[];
  current?: string;
}) {
  const { href, preview } = useWorkspace();
  return (
    <aside className="recording-library" aria-label="Recording library">
      {recordings.map((item) => (
        <Link
          className={`library-row ${item.id === current ? "selected" : ""}`}
          key={item.id}
          href={href(recordingHref(item.id, 0))}
          aria-current={item.id === current ? "page" : undefined}
        >
          {!preview && item.available_duration_ms > 0 ? (
            <EvidenceFrame
              className="library-frame"
              src={frameUrl(
                item.id,
                Math.min(5000, Math.floor(item.available_duration_ms / 2)),
              )}
              alt=""
            />
          ) : (
            <span className="library-icon">
              <Film size={19} />
            </span>
          )}
          <span>
            <strong>
              {cameras.find((c) => c.id === item.camera_id)?.name ?? "Camera"}
            </strong>
            <small className="tc">
              {new Date(item.started_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </small>
            <small>
              {formatOffset(item.available_duration_ms)} long
              {item.status === "recording" ? " · recording now" : ""}
              {!item.source_media && !preview ? " · earlier ingest" : ""}
            </small>
          </span>
        </Link>
      ))}
      {!recordings.length && (
        <p className="muted">No recordings match these filters.</p>
      )}
    </aside>
  );
}

function RecordingDetail({
  recording,
  camera,
  offset,
  segmentId,
  onSeek,
}: {
  recording: Recording;
  camera?: CameraType;
  offset: number;
  segmentId: string | null;
  onSeek: (offset: number, segmentId?: string | null) => void;
}) {
  const workspace = useWorkspace();
  const [position, setPosition] = useState(offset);
  const [autoContinue, setAutoContinue] = useState(true);
  const [jump, setJump] = useState("");
  const [momentFilter, setMomentFilter] = useState<"muse" | "all">("muse");
  const [showAllMoments, setShowAllMoments] = useState(false);
  const span = recordingSpan(recording);
  const recordingEvents = useRecordingEvents(recording);
  const related = recordingEvents
    .filter((event) => event.recording_id === recording.id)
    .sort((a, b) => a.evidence_offset_ms - b.evidence_offset_ms);
  const nextMoment = related.find(
    (event) => event.evidence_offset_ms > position + 1000,
  );
  const previousMoment = [...related]
    .reverse()
    .find((event) => event.evidence_offset_ms < position - 1000);
  const windowStart = recording.started_at;
  const windowEnd = useHistogramEnd(recording);
  const seek = (value: number) =>
    onSeek(Math.max(0, Math.min(value, span - 1000)));
  return (
    <section className="recording-main">
      <div className="recording-player-heading">
        <h2>{camera?.name ?? "Recording"}</h2>
        <span className="tc">
          {new Date(recording.started_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="rec-state">
          {workspace.preview
            ? "Sample recording"
            : recording.status === "recording"
              ? "Recording now"
              : "Finished"}
        </span>
        {segmentId && <Badge tone="teal">Exact evidence clip</Badge>}
      </div>
      <MediaPlayer
        key={`${recording.id}-${offset}-${segmentId ?? ""}`}
        camera={camera}
        recordingId={recording.id}
        sourceMedia={recording.source_media}
        segmentId={segmentId}
        offsetMs={offset}
        onPosition={(value) =>
          setPosition((current) =>
            Math.abs(current - value) >= 500 ? value : current,
          )
        }
        onClipEnd={(next) => {
          if (autoContinue && next < span - 500) onSeek(next);
        }}
        onResume={(value) => onSeek(value, segmentId)}
      />
      <div className="playback-controls" aria-label="Timestamp navigation">
        <span className="playback-position" aria-live="off">
          <Clock3 size={15} />
          <strong>{formatOffset(position)}</strong>
          <span>of {formatOffset(span)}</span>
          <small>
            {new Date(
              Date.parse(recording.started_at) + position,
            ).toLocaleTimeString()}
          </small>
        </span>
        <div className="button-row">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => seek(position - 10000)}
            aria-label="Back 10 seconds"
          >
            <Undo2 size={15} />
            10s
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => seek(position + 10000)}
            aria-label="Forward 10 seconds"
          >
            10s
            <Redo2 size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!previousMoment}
            aria-label="Previous moment"
            onClick={() =>
              previousMoment &&
              onSeek(
                previousMoment.evidence_offset_ms,
                previousMoment.segment_id,
              )
            }
          >
            ‹ Moment
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!nextMoment}
            aria-label="Next moment"
            onClick={() =>
              nextMoment &&
              onSeek(nextMoment.evidence_offset_ms, nextMoment.segment_id)
            }
          >
            Moment ›
          </Button>
        </div>
        <form
          className="jump-form"
          onSubmit={(event) => {
            event.preventDefault();
            const value = parseOffset(jump);
            if (value !== null) {
              seek(value);
              setJump("");
            }
          }}
        >
          <label htmlFor="jump-to" className="sr-only">
            Jump to time in recording (minutes:seconds)
          </label>
          <input
            id="jump-to"
            value={jump}
            onChange={(event) => setJump(event.target.value)}
            placeholder="mm:ss"
            inputMode="numeric"
            aria-invalid={jump !== "" && parseOffset(jump) === null}
          />
          <Button size="sm" type="submit" disabled={parseOffset(jump) === null}>
            Go
          </Button>
        </form>
        <label className="auto-continue">
          <input
            type="checkbox"
            checked={autoContinue}
            onChange={(event) => setAutoContinue(event.target.checked)}
          />
          Continue to the next clip automatically
        </label>
      </div>
      <AvailabilityTimeline
        recording={recording}
        markers={related}
        span={span}
        offset={position}
        onSeek={seek}
      />
      <div className="rec-lower">
        <MomentList
          related={related}
          preview={workspace.preview}
          filter={momentFilter}
          onFilter={(value) => {
            setMomentFilter(value);
            setShowAllMoments(false);
          }}
          showAll={showAllMoments}
          onShowAll={() => setShowAllMoments(true)}
          onSeek={onSeek}
          position={position}
          cameraId={recording.camera_id}
        />
        <aside className="rec-about" aria-label="About this recording">
          <h3>About this recording</h3>
          <dl className="facts-list">
            <dt>Camera</dt>
            <dd>{camera?.name ?? "Unknown"}</dd>
            <dt>Started</dt>
            <dd>
              {new Date(recording.started_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </dd>
            <dt>Length</dt>
            <dd>{formatOffset(span)}</dd>
          </dl>
          <SourceMediaCredit media={recording.source_media} />
          {!recording.source_media && camera?.source_media && (
            <p className="muted">
              Earlier ingest from this camera, kept as recorded. It carries no
              footage credit of its own and may include development test
              patterns.
            </p>
          )}
          {!workspace.preview && (
            <IndexingPanel recording={recording} camera={camera} />
          )}
          {!workspace.preview && (
            <details className="rec-chart">
              <summary>Motion and analysis over time</summary>
              <ActivityHistogram
                cameraId={recording.camera_id}
                start={windowStart}
                end={windowEnd}
                cursor={Date.parse(recording.started_at) + position}
                title="Activity in this recording"
              />
            </details>
          )}
        </aside>
      </div>
    </section>
  );
}

const MOMENT_LIMIT = 8;

/** Muse observations first; frequent motion samples stay one click away instead of burying them. */
function MomentList({
  related,
  preview,
  filter,
  onFilter,
  showAll,
  onShowAll,
  onSeek,
  position,
  cameraId,
}: {
  position: number;
  cameraId: string;
  related: Schema["Event"][];
  preview: boolean;
  filter: "muse" | "all";
  onFilter: (value: "muse" | "all") => void;
  showAll: boolean;
  onShowAll: () => void;
  onSeek: (offset: number, segmentId?: string | null) => void;
}) {
  const muse = related.filter((event) => event.provenance === "muse");
  const effective = muse.length ? filter : "all";
  const listed = effective === "muse" ? muse : related;
  const shown = showAll ? listed : listed.slice(0, MOMENT_LIMIT);
  const { href } = useWorkspace();
  return (
    <div className="moment-section">
      <div className="section-heading">
        <h2>Moments</h2>
        {muse.length > 0 && muse.length < related.length ? (
          <div className="segmented-control" aria-label="Moments to show">
            <button
              aria-pressed={effective === "muse"}
              onClick={() => onFilter("muse")}
            >
              Muse observations · {muse.length}
            </button>
            <button
              aria-pressed={effective === "all"}
              onClick={() => onFilter("all")}
            >
              All moments · {related.length}
            </button>
          </div>
        ) : (
          <span className="muted">
            {related.length} {preview ? "sample moments" : "moments"}
          </span>
        )}
      </div>
      {shown.length ? (
        shown.map((event) => (
          <button
            key={event.id}
            className={`moment-row ${Math.abs(event.evidence_offset_ms - position) < 5000 ? "is-current" : ""}`}
            onClick={() => onSeek(event.evidence_offset_ms, event.segment_id)}
          >
            {!preview && event.provenance === "muse" && (
              <EvidenceFrame
                className="moment-frame"
                src={frameUrl(
                  event.recording_id,
                  event.evidence_offset_ms,
                  event.segment_id,
                )}
                alt=""
              />
            )}
            <span className="moment-time">
              <Play size={12} />
              {formatOffset(event.evidence_offset_ms)}
            </span>
            <span className="moment-text">{eventTitle(event, preview)}</span>
            <span className="moment-kind">
              {event.provenance === "muse" ? "Muse" : "Motion"}
            </span>
          </button>
        ))
      ) : (
        <p className="muted">
          Muse hasn’t analyzed this recording, so it has no moments yet. Only
          analyzed clips can show moments.
        </p>
      )}
      {!preview && muse.length > 0 && (
        <Link
          className="text-button"
          href={href(`/explore?camera=${cameraId}`)}
        >
          <ScanSearch size={13} />
          Compare with other moments on this camera
        </Link>
      )}
      {shown.length < listed.length && (
        <Button variant="ghost" size="sm" onClick={onShowAll}>
          Show all {listed.length} moments
        </Button>
      )}
    </div>
  );
}

/**
 * Moments for this recording, queried by its own time window rather than the workspace's
 * "last 24 hours": older recordings keep their moments, and the count is not capped at 100.
 */
function useRecordingEvents(recording: Recording) {
  const { preview, events } = useWorkspace();
  const [loaded, setLoaded] = useState<{ id: string; items: Event[] }>({
    id: "",
    items: [],
  });
  const end = useHistogramEnd(recording);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    void (async () => {
      const items: Event[] = [];
      let cursor: string | null = null;
      // Bounded: at most 10 pages of 100 moments for one recording window.
      for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({
          camera_id: recording.camera_id,
          start: recording.started_at,
          end,
          limit: "100",
        });
        if (cursor) query.set("cursor", cursor);
        try {
          const data: Schema["EventList"] = await request(`/events?${query}`, {
            signal: controller.signal,
          });
          items.push(...data.items);
          cursor = data.next_cursor;
        } catch {
          break;
        }
        if (!cursor) break;
      }
      if (!controller.signal.aborted) setLoaded({ id: recording.id, items });
    })();
    return () => controller.abort();
  }, [preview, recording.id, recording.camera_id, recording.started_at, end]);
  if (preview)
    return events.state === "ready"
      ? events.data.filter((event) => event.recording_id === recording.id)
      : [];
  return loaded.id === recording.id ? loaded.items : [];
}

/**
 * A stable histogram window. A recording still in progress grows, so its end advances on a
 * 30-second cadence rather than on every render (which would refetch continuously).
 */
function useHistogramEnd(recording: Recording) {
  const compute = () =>
    new Date(
      Math.min(
        Date.parse(recording.started_at) + recordingSpan(recording) + 1000,
        Date.parse(recording.started_at) + DAY_MS,
      ),
    ).toISOString();
  const [end, setEnd] = useState(compute);
  const live = !recording.ended_at;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setEnd(compute()), 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, recording.id]);
  return live ? end : compute();
}

function AvailabilityTimeline({
  recording,
  markers,
  span,
  offset,
  onSeek,
}: {
  recording: Recording;
  markers: Event[];
  span: number;
  offset: number;
  onSeek: (offset: number) => void;
}) {
  const { preview } = useWorkspace();
  const [segments, setSegments] = useState<Schema["Segment"][] | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    void request<Schema["SegmentList"]>(
      `/recordings/${recording.id}/segments`,
      {
        signal: controller.signal,
      },
    )
      .then((data) => setSegments(data.items))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbort(error)) setFailed(error);
      });
    return () => controller.abort();
  }, [recording.id, preview, recording.available_duration_ms]);
  const spans = preview
    ? [
        {
          offset_ms: 0,
          duration_ms: recording.available_duration_ms,
          id: "sample",
        },
      ]
    : (segments?.filter((segment) => segment.status === "ready") ?? []);
  const track = useRef<HTMLDivElement>(null);
  return (
    <div className="timeline">
      <div className="timeline-heading">
        <h3>Recorded</h3>
        <span>
          <span className="timeline-key" />
          {preview
            ? "Sample availability"
            : `${spans.length} recorded clip${spans.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div
        className="timeline-track timeline-clickable"
        ref={track}
        aria-hidden="true"
        onClick={(event) => {
          const box = track.current?.getBoundingClientRect();
          if (!box || !spans.length) return;
          onSeek(Math.round(((event.clientX - box.left) / box.width) * span));
        }}
      >
        {spans.map((item) => (
          <span
            key={item.id}
            className="timeline-span"
            style={{
              left: `${(100 * item.offset_ms) / span}%`,
              width: `${(100 * item.duration_ms) / span}%`,
            }}
          />
        ))}
        <span
          className="timeline-cursor"
          style={{ left: `${Math.min(99.5, (offset / span) * 100)}%` }}
        />
        {markers.map((event) => (
          <span
            key={event.id}
            className="timeline-marker"
            style={{ left: `${(event.evidence_offset_ms / span) * 100}%` }}
          />
        ))}
      </div>
      <label className="sr-only" htmlFor="recording-position">
        Choose a recording timestamp
      </label>
      <input
        id="recording-position"
        className="timeline-range"
        type="range"
        min={0}
        max={Math.max(span - 1000, 0)}
        step={1000}
        defaultValue={Math.min(offset, Math.max(span - 1000, 0))}
        key={Math.round(offset / 1000)}
        disabled={!spans.length}
        onKeyUp={(event) => onSeek(Number(event.currentTarget.value))}
        onPointerUp={(event) => onSeek(Number(event.currentTarget.value))}
        aria-valuetext={`${formatOffset(offset)} into recording`}
      />
      <div className="timeline-ticks">
        <span>00:00</span>
        <span>{formatOffset(span / 3)}</span>
        <span>{formatOffset((span * 2) / 3)}</span>
        <span>{formatOffset(span)}</span>
      </div>
      {!preview && !spans.length && (
        <p className="muted">
          {failed
            ? "Availability couldn’t be verified. No coverage is inferred."
            : segments
              ? "No finished clips yet. Recorded video appears about ten seconds after capture."
              : "Checking finalized recording intervals…"}
        </p>
      )}
    </div>
  );
}

const terminal = new Set(["succeeded", "failed", "cancelled"]);

function IndexingPanel({
  recording,
  camera,
}: {
  recording: Recording;
  camera?: CameraType;
}) {
  const { href, reload } = useWorkspace();
  const [index, setIndex] = useState<Schema["RecordingIndex"] | null>(null);
  const [indexError, setIndexError] = useState<unknown>(null);
  const [job, setJob] = useState<Schema["AnalysisJob"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pollAttempt, setPollAttempt] = useState(0);
  const requestKey = useRequestKey();
  useEffect(() => {
    const controller = new AbortController();
    request<Schema["RecordingIndex"]>(`/recordings/${recording.id}/index`, {
      signal: controller.signal,
    })
      .then((value) => {
        setIndex(value);
        setIndexError(null);
      })
      .catch((value) => {
        if (!controller.signal.aborted && !isAbort(value)) setIndexError(value);
      });
    return () => controller.abort();
  }, [recording.id, revision]);
  useEffect(() => {
    if (!job || terminal.has(job.state)) return;
    // The contract asks clients to poll once per second until a terminal state.
    // A failed poll is shown, then retried; the next successful poll clears it.
    const timer = window.setTimeout(
      () => {
        request<Schema["AnalysisJob"]>(`/analysis-jobs/${job.id}`)
          .then((value) => {
            setError(null);
            setPollAttempt(0);
            // Refresh per-clip counts whenever the job advances, not only at the end.
            if (value.progress !== job.progress || terminal.has(value.state))
              setRevision((r) => r + 1);
            setJob(value);
            if (terminal.has(value.state)) reload();
          })
          .catch((value) => {
            setError(value);
            setPollAttempt((attempt) => attempt + 1);
          });
      },
      pollAttempt ? 3000 : 1000,
    );
    return () => window.clearTimeout(timer);
  }, [job, reload, pollAttempt]);
  async function start() {
    setBusy(true);
    setError(null);
    const body = {
      recording_id: recording.id,
      allow_cloud_upload: true as const,
    };
    try {
      setJob(
        await request<Schema["AnalysisJob"]>(
          "/analysis-jobs",
          mutationOptions(body, requestKey({ ...body, revision })),
        ),
      );
      setConfirming(false);
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  const counts = (index?.items ?? []).reduce<Record<string, number>>(
    (total, item) => ({ ...total, [item.state]: (total[item.state] ?? 0) + 1 }),
    {},
  );
  const total = index?.items.length ?? 0;
  const pendingWork =
    (counts.waiting ?? 0) + (counts.failed ?? 0) + (counts.cancelled ?? 0);
  const running = job && !terminal.has(job.state);
  return (
    <div className="indexing-panel">
      <div className="indexing-heading">
        <span className="indexing-icon">
          <Sparkles size={20} />
        </span>
        <div>
          <strong>Video search for this recording</strong>
          <p>
            {indexError
              ? "Indexing status couldn’t be read."
              : !index
                ? "Checking which clips are searchable…"
                : total === 0
                  ? "No finished clips are ready to analyze yet."
                  : `${counts.succeeded ?? 0} of ${total} clips searchable${
                      counts.running || counts.queued
                        ? ` · ${(counts.running ?? 0) + (counts.queued ?? 0)} in progress`
                        : ""
                    }${counts.failed ? ` · ${counts.failed} failed` : ""}`}
          </p>
        </div>
      </div>
      {running && job && (
        <div className="job-progress" role="status">
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Analysis progress"
            aria-valuenow={Math.round(job.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.max(3, job.progress * 100)}%` }} />
          </div>
          <span>
            {job.state === "queued"
              ? "Waiting for the analysis worker"
              : "Analyzing"}{" "}
            · {Math.round(job.progress * 100)}% · {job.selected_segments} clip
            {job.selected_segments === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {job && terminal.has(job.state) && (
        <p className={job.state === "succeeded" ? "job-done" : "camera-error"}>
          {job.state === "succeeded"
            ? `Analysis finished: ${formatOffset(job.selected_duration_ms)} of video in ${(job.processing_ms / 1000).toFixed(1)}s, ${job.usage.requests} Muse request${job.usage.requests === 1 ? "" : "s"}.`
            : `Analysis ${job.state}. ${job.error?.message ?? ""}`}
          {job.error && (
            <small className="error-reference">{job.error.code}</small>
          )}
        </p>
      )}
      {job?.state === "failed" && (
        <p className="muted">
          Clips that were analyzed stay searchable. Trying again continues with
          the clips that weren’t, and uses more of your request budget.
        </p>
      )}
      {!!error && (
        <ProblemMessage
          error={error}
          fallback="Analysis couldn’t be started."
        />
      )}
      {!camera?.cloud_analysis_allowed ? (
        <p className="muted">
          <ShieldCheck size={14} /> Cloud analysis is off for{" "}
          {camera?.name ?? "this camera"}.{" "}
          <Link href={href("/cameras")}>Review camera privacy</Link> to allow
          it.
        </p>
      ) : (
        !running &&
        index &&
        pendingWork > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirming(true)}
          >
            {job?.state === "failed" ? "Try again: make " : "Make "}
            {pendingWork === total
              ? "this recording"
              : `${pendingWork} more clips`}{" "}
            searchable
          </Button>
        )
      )}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send clips for analysis?"
        description="Muse will describe what is visible so you can search it."
      >
        <div className="confirmation-card">
          <Badge tone="amber">Please review</Badge>
          <p>
            Up to 30 short, silent clips (about 10 seconds each) from{" "}
            <strong>{camera?.name}</strong> will be uploaded to Meta, analyzed,
            then deleted from Meta’s file storage. Descriptions are stored in
            your workspace. No face recognition or identity matching is done.
          </p>
          <p className="muted">
            This uses your configured Muse request budget.
          </p>
          {!!error && (
            <ProblemMessage
              error={error}
              fallback="Analysis couldn’t be started."
            />
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Not now
            </Button>
            <Button onClick={() => void start()} disabled={busy}>
              {busy ? "Starting…" : "Upload and analyze"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
