"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Camera as CameraIcon,
  Check,
  CircleAlert,
  Clock3,
  CornerDownLeft,
  Grid2X2,
  LoaderCircle,
  Play,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { ApiError, isAbort, mutationOptions, request } from "@/lib/client-api";
import {
  anchoredWindow,
  clockTime,
  closestTopic,
  dayLabel,
  eventLabels,
  hitFrameUrl,
  hitKey,
  objectLabel,
  timeZoneName,
  topicById,
  topics,
  windowLabel,
  type IndexQuery,
  type TopicId,
} from "@/lib/explore";
import { fixtureHits, fixtureJob } from "@/lib/fixtures";
import { formatDuration } from "@/lib/receipts";
import type {
  Camera,
  Layout,
  Resource,
  SearchHit,
  SearchResponse,
} from "@/lib/types";
import { useCoverage } from "@/lib/use-coverage";
import { useRequestKey } from "@/lib/use-request-key";
import { CameraLanes } from "../camera-lanes";
import { EvidenceFrame } from "../evidence-frame";
import { MediaPlayer, formatOffset } from "../media-player";
import { SpaceArt } from "../space-art";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  Badge,
  ErrorMessage,
  ProblemMessage,
  Skeleton,
  StatePanel,
} from "../ui/primitives";
import { recordingHref } from "./recordings-screen";

const unsupported: Record<string, string> = {
  identity:
    "Veyra doesn’t identify people. Describe what is visible instead, such as clothing or an object.",
  demographics:
    "Veyra doesn’t infer age, gender or other demographics. Describe what is visible instead.",
  intent: "Veyra can’t infer intent. Describe the visible action instead.",
  ambiguous_time:
    "That time is ambiguous. Choose a period on the timeline, or say “this morning”.",
  unsupported_constraint:
    "Part of this request can’t be searched in stored indexes. Try a simpler description.",
};
// Muse could not interpret or match the wording; the person can fix it by rewording.
const correctable = new Set([
  "UNSUPPORTED_SEARCH_CONSTRAINT",
  "CAMERA_FILTER_CONFLICT",
  "CAMERA_NOT_FOUND",
  "CAMERA_AMBIGUOUS",
  "INVALID_TIME_RANGE",
  "VALIDATION_ERROR",
]);
const RESULT_LIMIT = 48;
const PAGE = 12;

type Mode = { kind: "index" } | { kind: "muse"; query: string };

export function ExploreScreen() {
  const { preview, previewState, cameras, recordings, openMuse } =
    useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [coverageAttempt, setCoverageAttempt] = useState(0);
  const coverage = useCoverage(!preview, coverageAttempt);
  const topic = topicById(params.get("topic"));
  const cameraParam = params.get("camera") ?? "all";
  const [range, setRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [ask, setAsk] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<Mode>({ kind: "index" });
  const [loaded, setLoaded] = useState<{
    key: string;
    value: Resource<SearchResponse>;
  }>({ key: "", value: { state: "loading" } });
  const [attempt, setAttempt] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRound, setReviewRound] = useState(0);
  const askField = useRef<HTMLInputElement>(null);

  // Reads the live URL, not a render snapshot: quick successive filter changes must compose.
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(window.location.search);
      if (value === null) next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const items = useMemo(
    () => (coverage.state === "ready" ? coverage.data.items : []),
    [coverage],
  );
  const full = useMemo(() => anchoredWindow(items), [items]);
  const period = range ?? full;
  const enabledIds = useMemo(
    () =>
      new Set(
        cameras.state === "ready"
          ? cameras.data.filter((c) => c.enabled).map((c) => c.id)
          : [],
      ),
    [cameras],
  );
  const cameraId =
    cameraParam !== "all" && items.some((i) => i.camera_id === cameraParam)
      ? cameraParam
      : "all";
  // Lanes: cameras with recordings in the window; analyzed ones first, paused fixtures last.
  const laneCameras = useMemo(
    () =>
      period
        ? items
            .filter(
              (item) =>
                item.first_recorded_at &&
                item.last_recorded_at &&
                Date.parse(item.first_recorded_at) < period.end &&
                Date.parse(item.last_recorded_at) > period.start &&
                (cameraId === "all" || item.camera_id === cameraId),
            )
            .sort(
              (a, b) =>
                Number(enabledIds.has(b.camera_id)) -
                  Number(enabledIds.has(a.camera_id)) ||
                b.observations - a.observations ||
                a.camera_name.localeCompare(b.camera_name),
            )
        : [],
    [items, period, cameraId, enabledIds],
  );
  const analyzedCameras = items.filter((item) => item.indexed_segments > 0);
  const totals = items.reduce(
    (sum, item) => ({
      segments: sum.segments + item.segments,
      indexed: sum.indexed + item.indexed_segments,
      observations: sum.observations + item.observations,
    }),
    { segments: 0, indexed: 0, observations: 0 },
  );

  const windowStart = period?.start;
  const windowEnd = period?.end;
  // Each response is tagged with the request it answers; anything else reads as loading.
  const resultKey = JSON.stringify([
    mode,
    topic.id,
    cameraId,
    windowStart,
    windowEnd,
    attempt,
  ]);
  const results: Resource<SearchResponse> =
    loaded.key === resultKey ? loaded.value : { state: "loading" };
  useEffect(() => {
    if (preview || windowStart === undefined || windowEnd === undefined) return;
    const controller = new AbortController();
    const setResults = (value: Resource<SearchResponse>) =>
      setLoaded({ key: resultKey, value });
    const scope = {
      camera_ids: cameraId === "all" ? [] : [cameraId],
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
    };
    const call =
      mode.kind === "muse"
        ? request<SearchResponse>("/search", {
            method: "POST",
            signal: controller.signal,
            timeoutMs: 65000,
            body: JSON.stringify({
              query: mode.query,
              ...scope,
              limit: 24,
              timezone: timeZoneName(),
            }),
          })
        : request<SearchResponse>("/index-query", {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              ...scope,
              ...(topic.query as Partial<IndexQuery>),
              limit: RESULT_LIMIT,
            }),
          });
    call
      .then((data) => {
        setResults({ state: "ready", data });
        setSelectedKey((current) =>
          current && data.items.some((hit) => hitKey(hit) === current)
            ? current
            : data.items[0]
              ? hitKey(data.items[0])
              : null,
        );
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setResults({
          state: "error",
          message:
            error instanceof Error ? error.message : "Search couldn’t run.",
          code: error instanceof ApiError ? error.code : undefined,
          requestId: error instanceof ApiError ? error.requestId : undefined,
        });
      });
    return () => controller.abort();
  }, [preview, mode, topic, cameraId, windowStart, windowEnd, resultKey]);

  // A link from Muse or ⌘K carries the person's own words: run that Muse search once.
  const initialQuery = useRef(params.get("q"));
  useEffect(() => {
    const query = initialQuery.current?.trim();
    if (!query || preview || !full) return;
    initialQuery.current = null;
    setMode({ kind: "muse", query });
  }, [full, preview]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        event.preventDefault();
        askField.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const query = ask.trim();
    if (!query) return;
    setMode({ kind: "muse", query });
    setAttempt((value) => value + 1);
  }
  function clearMuse() {
    setMode({ kind: "index" });
    setAsk("");
    setParam("q", null);
  }

  const hits = preview
    ? previewState === "empty"
      ? []
      : fixtureHits
    : results.state === "ready"
      ? results.data.items
      : [];
  const selected =
    hits.find((hit) => hitKey(hit) === selectedKey) ?? hits[0] ?? null;
  const response = results.state === "ready" ? results.data : null;
  const busy = !preview && results.state === "loading";
  const museBusy = busy && mode.kind === "muse";
  const resultCameras = [...new Set(hits.map((hit) => hit.camera_id))];

  return (
    <div className="explore">
      <header className="explore-heading">
        <div>
          <h1>Explore</h1>
          <p>
            Find a moment across your cameras, check the footage, and act on it.
          </p>
        </div>
        {coverage.state === "ready" && (
          <p className="explore-coverage">
            <strong>
              {totals.indexed.toLocaleString()} of{" "}
              {totals.segments.toLocaleString()}
            </strong>{" "}
            recorded clips analyzed by Muse · {analyzedCameras.length} of{" "}
            {items.length} cameras · {totals.observations} observations
          </p>
        )}
      </header>

      <form className="ask-bar" onSubmit={submit} role="search">
        <Sparkles size={19} className="ask-mark" aria-hidden="true" />
        <label htmlFor="explore-ask" className="sr-only">
          Describe a moment for Muse to find
        </label>
        <input
          id="explore-ask"
          ref={askField}
          value={ask}
          onChange={(event) => setAsk(event.target.value)}
          maxLength={2000}
          placeholder="Describe a moment — “squirrels at the feeder”, “buses on the street”"
          autoComplete="off"
        />
        <kbd className="ask-hint" aria-hidden="true">
          /
        </kbd>
        <Button type="submit" disabled={!ask.trim() || museBusy || preview}>
          {museBusy ? (
            <LoaderCircle size={15} className="is-loading" />
          ) : (
            <CornerDownLeft size={15} />
          )}
          Ask Muse
        </Button>
      </form>
      <p className="ask-cost">
        Asking Muse uses one model request to understand your words, then reads
        stored analysis. Topic filters below read the stored analysis directly.
      </p>

      <div className="explore-filters" role="group" aria-label="Filters">
        <div
          className="topic-chips"
          role="radiogroup"
          aria-label="What to show"
        >
          {topics.map((item) => {
            const counter = "count" in item ? item.count : undefined;
            const count =
              counter && coverage.state === "ready"
                ? items
                    .filter(
                      (c) => cameraId === "all" || c.camera_id === cameraId,
                    )
                    .reduce((sum, c) => sum + counter(c), 0)
                : null;
            const active = mode.kind === "index" && topic.id === item.id;
            return (
              <button
                key={item.id}
                role="radio"
                aria-checked={active}
                className={`topic-chip ${active ? "is-active" : ""}`}
                onClick={() => {
                  if (mode.kind === "muse") clearMuse();
                  setParam("topic", item.id === "all" ? null : item.id);
                }}
              >
                {item.label}
                {count !== null && <span className="chip-count">{count}</span>}
              </button>
            );
          })}
        </div>
        <label className="select-field explore-camera">
          <CameraIcon size={15} />
          <span className="sr-only">Camera</span>
          <select
            value={cameraId}
            onChange={(event) =>
              setParam(
                "camera",
                event.target.value === "all" ? null : event.target.value,
              )
            }
          >
            <option value="all">All cameras</option>
            {items
              .filter((item) => item.segments > 0)
              .map((item) => (
                <option key={item.camera_id} value={item.camera_id}>
                  {item.camera_name}
                  {item.indexed_segments ? "" : " — not analyzed"}
                </option>
              ))}
          </select>
        </label>
      </div>

      {preview ? (
        <>
          <p className="sample-search-note">
            <Badge tone="blue">Preview</Badge>Authored example results with
            illustrations. Connect a workspace to explore real footage.
          </p>
          {previewState === "indexing" && (
            <div className="indexing-card">
              <span className="indexing-icon">
                <Sparkles size={22} />
              </span>
              <div>
                <strong>Getting this recording ready to search</strong>
                <p>
                  Example progress only. Moments appear here as each clip
                  finishes analysis.
                </p>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Sample indexing progress"
                  aria-valuenow={Math.round(fixtureJob.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${fixtureJob.progress * 100}%` }} />
                </div>
              </div>
              <span>{Math.round(fixtureJob.progress * 100)}%</span>
            </div>
          )}
        </>
      ) : coverage.state === "error" ? (
        <StatePanel
          kind="error"
          title="Your video index couldn’t be read"
          description="No results are shown, because none were returned."
        >
          <ErrorMessage
            message={coverage.message}
            code={coverage.code}
            requestId={coverage.requestId}
          />
          <Button
            variant="secondary"
            onClick={() => setCoverageAttempt((value) => value + 1)}
          >
            Try again
          </Button>
        </StatePanel>
      ) : coverage.state === "loading" ? (
        <Skeleton className="lanes-skeleton" />
      ) : !full ? (
        <StatePanel
          title="No recorded video yet"
          description="Explore starts working once a camera has finished recordings. Connect a camera, then come back."
        >
          <Button asChild variant="secondary">
            <Link href="/cameras">Open cameras</Link>
          </Button>
        </StatePanel>
      ) : (
        <CameraLanes
          cameras={laneCameras}
          start={period!.start}
          end={period!.end}
          hits={hits}
          selected={selected ? hitKey(selected) : null}
          onSelect={(hit) => setSelectedKey(hitKey(hit))}
          onWindow={(start, end) => setRange({ start, end })}
          zoomed={!!range}
          onReset={() => setRange(null)}
        />
      )}

      {(preview || full) && (
        <div className="explore-body">
          <section className="explore-results" aria-labelledby="results-title">
            <ResultsHeading
              mode={mode}
              topicLabel={topic.label}
              topicNote={"note" in topic ? topic.note : undefined}
              response={response}
              count={hits.length}
              busy={busy}
              failed={!preview && results.state === "error"}
              period={period}
              onClearMuse={clearMuse}
              onReview={
                resultCameras.length && !preview
                  ? () => {
                      setReviewRound((value) => value + 1);
                      setReviewOpen(true);
                    }
                  : undefined
              }
            />
            {!preview && results.state === "error" ? (
              <ResultsError
                error={results}
                mode={mode}
                onRetry={() => setAttempt((value) => value + 1)}
                onTopic={(id) => {
                  clearMuse();
                  setParam("topic", id === "all" ? null : id);
                }}
                onMuse={(query) => openMuse(query)}
              />
            ) : busy ? (
              <ol className="result-grid" aria-busy="true">
                {[0, 1, 2, 3].map((item) => (
                  <li key={item} className="result-card is-skeleton">
                    <Skeleton className="result-frame-skeleton" />
                    <Skeleton />
                    <Skeleton className="skeleton-short" />
                  </li>
                ))}
              </ol>
            ) : hits.length ? (
              <ResultList
                hits={hits}
                selected={selected ? hitKey(selected) : null}
                onSelect={(hit) => setSelectedKey(hitKey(hit))}
              />
            ) : (
              <NoResults
                mode={mode}
                response={response}
                zoomed={!!range}
                onReset={() => setRange(null)}
                onAll={() => {
                  clearMuse();
                  setParam("topic", null);
                  setParam("camera", null);
                }}
              />
            )}
          </section>
          <aside className="explore-inspector" aria-label="Selected moment">
            {selected ? (
              <Inspector
                key={hitKey(selected)}
                hit={selected}
                recordingSource={
                  recordings.state === "ready"
                    ? recordings.data.find(
                        (r) => r.id === selected.recording_id,
                      )?.source_media
                    : undefined
                }
                onFocusCamera={(id) => {
                  clearMuse();
                  setParam("camera", id);
                }}
                onAround={(start, end) =>
                  setRange({
                    start: Math.max(start, full?.start ?? start),
                    end: Math.min(end, full?.end ?? end),
                  })
                }
              />
            ) : (
              <div className="inspector-empty">
                <Play size={20} />
                <p>Select a moment to watch its footage here.</p>
              </div>
            )}
          </aside>
        </div>
      )}
      {!preview && (
        <ReviewViewDialog
          key={reviewRound}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          cameraIds={resultCameras}
          label={mode.kind === "muse" ? mode.query : topic.label}
          onAskMuse={(prompt) => {
            setReviewOpen(false);
            openMuse(prompt);
          }}
        />
      )}
    </div>
  );
}

function ResultsHeading({
  mode,
  topicLabel,
  topicNote,
  response,
  count,
  busy,
  failed,
  period,
  onClearMuse,
  onReview,
}: {
  mode: Mode;
  topicLabel: string;
  topicNote?: string;
  response: SearchResponse | null;
  count: number;
  busy: boolean;
  failed: boolean;
  period: { start: number; end: number } | null;
  onClearMuse: () => void;
  onReview?: () => void;
}) {
  const coverage = response?.coverage;
  return (
    <div className="results-head">
      <div className="results-head-row">
        <h2 id="results-title">
          {busy
            ? mode.kind === "muse"
              ? "Muse is reading your words…"
              : "Reading stored analysis…"
            : failed
              ? "Results unavailable"
              : `${count} moment${count === 1 ? "" : "s"}`}
          {!busy && count === RESULT_LIMIT && mode.kind === "index" && (
            <span className="results-cap"> · newest {RESULT_LIMIT}</span>
          )}
        </h2>
        {onReview && !busy && !failed && (
          <Button variant="secondary" size="sm" onClick={onReview}>
            <Grid2X2 size={14} />
            Review these cameras together
          </Button>
        )}
      </div>
      <p className="results-sentence">
        {mode.kind === "muse" ? (
          <>
            <span className="muse-query">
              <Sparkles size={13} aria-hidden="true" />“{mode.query}”
              <button
                onClick={onClearMuse}
                aria-label="Clear Muse search and return to filters"
              >
                <X size={13} />
              </button>
            </span>
          </>
        ) : (
          <span>{topicLabel}</span>
        )}
        {period && <span>{windowLabel(period.start, period.end)}</span>}
        {response && !busy && (
          <span className={`coverage-note coverage-${coverage}`}>
            {coverage === "complete" ? (
              <Check size={13} />
            ) : (
              <CircleAlert size={13} />
            )}
            {coverage === "complete"
              ? "All recorded video here was analyzed"
              : coverage === "partial"
                ? `${formatDuration(response.analyzed_ms)} of ${formatDuration(response.available_ms)} recorded here was analyzed`
                : "No analyzed video in this period"}
          </span>
        )}
      </p>
      {mode.kind === "muse" && response && !busy && (
        <MuseUnderstanding response={response} />
      )}
      {mode.kind === "index" && topicNote && !busy && (
        <p className="results-note">{topicNote}</p>
      )}
    </div>
  );
}

function MuseUnderstanding({ response }: { response: SearchResponse }) {
  const c = response.constraints;
  const chips = [
    ...c.camera_names.map((name) => `Camera: ${name}`),
    ...c.objects.map(objectLabel),
    ...c.event_types.map((type) => eventLabels[type] ?? type),
    ...(c.motion_only ? ["Motion only"] : []),
    ...c.keywords.map((word) => `“${word}”`),
  ];
  return (
    <div className="muse-understanding">
      <span>Muse understood</span>
      <ul aria-label="How Muse understood your words">
        {chips.length ? (
          chips.map((chip, index) => <li key={`${chip}-${index}`}>{chip}</li>)
        ) : (
          <li>No specific conditions</li>
        )}
      </ul>
      <small>
        Answered in {(response.latency_ms / 1000).toFixed(1)}s · stored analysis
        only, no new video uploaded
      </small>
    </div>
  );
}

function ResultList({
  hits,
  selected,
  onSelect,
}: {
  hits: SearchHit[];
  selected: string | null;
  onSelect: (hit: SearchHit) => void;
}) {
  const { preview } = useWorkspace();
  const list = useRef<HTMLOListElement>(null);
  const [shown, setShown] = useState(PAGE);
  const selectedIndex = hits.findIndex((hit) => hitKey(hit) === selected);
  // Keep a timeline-selected result visible even when it is beyond the first page.
  const visible = Math.max(shown, selectedIndex + 1);
  return (
    <>
      <ol
        className="result-grid"
        ref={list}
        onKeyDown={(event) => {
          if (
            !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(
              event.key,
            )
          )
            return;
          const buttons = [
            ...(list.current?.querySelectorAll<HTMLButtonElement>(
              "button.result-card",
            ) ?? []),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (index < 0) return;
          event.preventDefault();
          const next =
            buttons[
              Math.min(
                buttons.length - 1,
                Math.max(
                  0,
                  index +
                    (event.key === "ArrowDown" || event.key === "ArrowRight"
                      ? 1
                      : -1),
                ),
              )
            ];
          next.focus();
          next.click();
        }}
      >
        {hits.slice(0, visible).map((hit) => {
          const key = hitKey(hit);
          const seconds = Math.max(
            1,
            Math.round((Date.parse(hit.end) - Date.parse(hit.start)) / 1000),
          );
          return (
            <li key={key}>
              <button
                className={`result-card ${selected === key ? "is-selected" : ""}`}
                aria-current={selected === key ? "true" : undefined}
                onClick={() => onSelect(hit)}
              >
                {preview ? (
                  <div className="evidence-frame">
                    <SpaceArt />
                    <span className="evidence-frame-label">
                      Illustration · no video
                    </span>
                  </div>
                ) : (
                  <EvidenceFrame
                    src={hitFrameUrl(hit)}
                    alt={`Frame from ${hit.camera_name} at ${clockTime(hit.start, true)}`}
                    label={`${clockTime(hit.start, true)} · ${seconds}s`}
                  />
                )}
                <span className="result-card-meta">
                  <strong>{hit.camera_name}</strong>
                  <span>{dayLabel(hit.start)}</span>
                </span>
                <span className="result-card-summary">{hit.summary}</span>
                <span className="result-card-tags">
                  {hit.metadata_id ? (
                    hit.event_types
                      .slice(0, 2)
                      .map((type) => (
                        <span key={type}>{eventLabels[type] ?? type}</span>
                      ))
                  ) : (
                    <span>Motion signal</span>
                  )}
                  {hit.uncertainty !== "low" && (
                    <span className="tag-uncertain">
                      {hit.uncertainty} uncertainty
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {hits.length > visible && (
        <div className="results-more">
          <Button variant="secondary" onClick={() => setShown(visible + PAGE)}>
            Show {Math.min(PAGE, hits.length - visible)} more
          </Button>
          <span>
            Showing {visible} of {hits.length}
          </span>
        </div>
      )}
    </>
  );
}

function Inspector({
  hit,
  recordingSource,
  onFocusCamera,
  onAround,
}: {
  hit: SearchHit;
  recordingSource?: Camera["source_media"];
  onFocusCamera: (cameraId: string) => void;
  onAround: (start: number, end: number) => void;
}) {
  const { preview, href, cameras } = useWorkspace();
  const camera =
    cameras.state === "ready"
      ? cameras.data.find((item) => item.id === hit.camera_id)
      : undefined;
  const target = recordingHref(hit.recording_id, hit.offset_ms, hit.segment_id);
  const startMs = Date.parse(hit.start);
  const endMs = Date.parse(hit.end);
  const [related, setRelated] = useState<Resource<SearchHit[]>>({
    state: "loading",
  });
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    request<SearchResponse>("/index-query", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        camera_ids: [hit.camera_id],
        start: new Date(startMs - 5 * 60000).toISOString(),
        end: new Date(endMs + 5 * 60000).toISOString(),
        limit: 9,
      }),
    })
      .then((data) =>
        setRelated({
          state: "ready",
          data: data.items
            .filter((item) => hitKey(item) !== hitKey(hit))
            .slice(0, 6),
        }),
      )
      .catch((error) => {
        if (!controller.signal.aborted && !isAbort(error))
          setRelated({
            state: "error",
            message: "Related moments couldn’t load.",
          });
      });
    return () => controller.abort();
  }, [hit, preview, startMs, endMs]);
  const boundary =
    hit.evidence.boundary_accuracy === "sampled_pixel_change"
      ? "Sampled pixel change"
      : "Estimated by Muse within a verified clip";
  return (
    <div className="inspector">
      <div className="inspector-stage">
        <MediaPlayer
          recordingId={hit.recording_id}
          segmentId={hit.segment_id}
          offsetMs={hit.offset_ms}
          durationMs={10000}
          sourceMedia={recordingSource}
        />
      </div>
      <div className="inspector-when">
        <span>
          <CameraIcon size={14} />
          {hit.camera_name}
        </span>
        <span>
          <Clock3 size={14} />
          <time dateTime={hit.start}>
            {dayLabel(hit.start)}, {clockTime(hit.start, true)}
          </time>
          –<time dateTime={hit.end}>{clockTime(hit.end, true)}</time>
        </span>
        <span className="inspector-offset">
          {formatOffset(hit.evidence.start_offset_ms)}–
          {formatOffset(hit.evidence.end_offset_ms)} in recording
        </span>
      </div>
      <h2 className="inspector-title">{hit.summary}</h2>
      {hit.evidence_text && hit.evidence_text !== hit.summary && (
        <p className="inspector-evidence">{hit.evidence_text}</p>
      )}
      <div className="inspector-actions">
        <Button asChild>
          <Link href={href(target)}>
            <Play size={15} />
            Open in recording at {formatOffset(hit.offset_ms)}
          </Link>
        </Button>
        {camera?.enabled && (
          <Button asChild variant="secondary">
            <Link href={href(`/live?camera_id=${hit.camera_id}`)}>
              <Video size={15} />
              Watch live
            </Link>
          </Button>
        )}
      </div>
      {!!hit.objects.length && (
        <section className="inspector-section">
          <h3>What Muse saw</h3>
          <ul className="seen-list">
            {hit.objects.slice(0, 6).map((object, index) => (
              <li key={`${object.category}-${index}`}>
                <strong>{objectLabel(object)}</strong>
                <span>{object.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="inspector-section inspector-trust">
        <h3>How sure is this?</h3>
        <p>
          <Badge tone={hit.uncertainty === "low" ? "neutral" : "amber"}>
            {hit.uncertainty} uncertainty
          </Badge>{" "}
          {hit.uncertainty_notes}
        </p>
        <p className="trust-note">
          A model description, not verified fact. Watch the footage before
          acting on it. Muse describes what is visible and does not identify
          people.
        </p>
        <details>
          <summary>Source and processing</summary>
          <dl>
            <dt>Described by</dt>
            <dd>
              {hit.metadata_id ? `Meta Muse · ${hit.model_id}` : hit.model_id}
            </dd>
            <dt>Time boundaries</dt>
            <dd>{boundary}</dd>
            <dt>Analyzed</dt>
            <dd>
              {new Date(hit.indexed_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </dd>
            <dt>Preview frame</dt>
            <dd>Decoded from the same recorded clip; illustrative only</dd>
          </dl>
        </details>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-head">
          <h3>Around this moment</h3>
          <button
            className="text-button"
            onClick={() => onAround(startMs - 5 * 60000, endMs + 5 * 60000)}
          >
            Focus timeline ±5 min
          </button>
        </div>
        {preview ? null : related.state === "loading" ? (
          <Skeleton />
        ) : related.state === "error" ? (
          <p className="muted">{related.message}</p>
        ) : related.data.length ? (
          <ul className="related-list">
            {related.data.map((item) => (
              <li key={hitKey(item)}>
                <Link
                  href={href(
                    recordingHref(
                      item.recording_id,
                      item.offset_ms,
                      item.segment_id,
                    ),
                  )}
                >
                  <EvidenceFrame
                    src={hitFrameUrl(item)}
                    alt={`Frame from ${item.camera_name} at ${clockTime(item.start, true)}`}
                  />
                  <span>
                    <time dateTime={item.start}>
                      {clockTime(item.start, true)}
                    </time>
                    {item.summary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No other analyzed moments on this camera within five minutes.
          </p>
        )}
        <button
          className="text-button"
          onClick={() => onFocusCamera(hit.camera_id)}
        >
          Show only {hit.camera_name}
          <ArrowUpRight size={13} />
        </button>
      </section>
    </div>
  );
}

function ResultsError({
  error,
  mode,
  onRetry,
  onTopic,
  onMuse,
}: {
  error: Extract<Resource<never>, { state: "error" }>;
  mode: Mode;
  onRetry: () => void;
  onTopic: (id: TopicId) => void;
  onMuse: (query: string) => void;
}) {
  const fallback = mode.kind === "muse" ? closestTopic(mode.query) : null;
  const unavailable =
    error.code === "MODEL_BUDGET_EXHAUSTED" ||
    error.code === "MODEL_UNAVAILABLE" ||
    error.code === "MODEL_BUSY" ||
    error.code === "MODEL_NOT_CONFIGURED";
  if (mode.kind === "muse" && error.code && correctable.has(error.code))
    return (
      <StatePanel
        kind="search"
        title="Try describing it a little differently"
        description="Muse couldn’t turn these words into a search Veyra supports. Nothing was searched."
      >
        <ErrorMessage
          message={error.message}
          code={error.code}
          requestId={error.requestId}
        />
      </StatePanel>
    );
  return (
    <StatePanel
      kind="error"
      title={
        mode.kind === "muse"
          ? unavailable
            ? error.code === "MODEL_BUDGET_EXHAUSTED"
              ? "Muse has reached today’s request limit"
              : "Muse isn’t available right now"
            : "Muse search couldn’t be completed"
          : "Stored analysis couldn’t be read"
      }
      description="No results are shown, because none were returned."
    >
      <ErrorMessage
        message={error.message}
        code={error.code}
        requestId={error.requestId}
      />
      {fallback && (
        <Button variant="secondary" onClick={() => onTopic(fallback)}>
          Show the “{topicById(fallback).label}” filter instead
        </Button>
      )}
      {!unavailable && (
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
      {mode.kind === "muse" && !unavailable && (
        <Button variant="ghost" onClick={() => onMuse(mode.query)}>
          Ask in the Muse panel
        </Button>
      )}
    </StatePanel>
  );
}

function NoResults({
  mode,
  response,
  zoomed,
  onReset,
  onAll,
}: {
  mode: Mode;
  response: SearchResponse | null;
  zoomed: boolean;
  onReset: () => void;
  onAll: () => void;
}) {
  const reason = response?.constraints.unsupported_reason;
  return (
    <StatePanel
      kind="search"
      title={
        reason
          ? "This search isn’t supported"
          : response?.coverage === "none"
            ? "Nothing analyzed in this period"
            : "No matching moments"
      }
      description={
        reason
          ? (unsupported[reason] ?? "Try a simpler description.")
          : response?.coverage === "none"
            ? "Recordings here haven’t been analyzed by Muse yet. Open a recording to make it searchable, or widen the period."
            : `${mode.kind === "muse" ? "Muse searched the stored analysis" : "The stored analysis was checked"} and found no match. Only analyzed clips can match, so this doesn’t prove it didn’t happen.`
      }
    >
      {zoomed && (
        <Button variant="secondary" onClick={onReset}>
          Show the full range
        </Button>
      )}
      <Button variant="ghost" onClick={onAll}>
        Show all moments
      </Button>
    </StatePanel>
  );
}

function ReviewViewDialog({
  open,
  onOpenChange,
  cameraIds,
  label,
  onAskMuse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cameraIds: string[];
  label: string;
  onAskMuse: (prompt: string) => void;
}) {
  const { cameras, layouts, href, reload } = useWorkspace();
  const requestKey = useRequestKey();
  const chosen =
    cameras.state === "ready"
      ? cameraIds
          .map((id) => cameras.data.find((camera) => camera.id === id))
          .filter((camera): camera is Camera => !!camera?.enabled)
          .slice(0, 4)
      : [];
  const defaultName = `Review · ${label}`.slice(0, 100);
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; layout: Layout }
    | { kind: "failed"; error: unknown }
  >({ kind: "idle" });
  const columns = chosen.length > 1 ? 2 : 1;
  const duplicate =
    layouts.state === "ready" &&
    layouts.data.some(
      (layout) =>
        layout.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  async function save() {
    const body = {
      name: name.trim(),
      columns,
      cells: chosen.map((camera, position) => ({
        position,
        camera_id: camera.id,
      })),
    };
    setState({ kind: "saving" });
    try {
      const layout = await request<Layout>(
        "/layouts",
        mutationOptions(body, requestKey(body)),
      );
      setState({ kind: "saved", layout });
      reload();
    } catch (error) {
      setState({ kind: "failed", error });
    }
  }
  const names = chosen.map((camera) => camera.name);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Review these cameras together"
      description="Save a view with the cameras in these results, so you can watch them side by side."
    >
      {state.kind === "saved" ? (
        <div className="review-receipt" role="status">
          <Check size={18} />
          <div>
            <strong>Saved “{state.layout.name}”</strong>
            <p>
              {state.layout.cells.length} camera
              {state.layout.cells.length === 1 ? "" : "s"} ·{" "}
              {state.layout.columns} column
              {state.layout.columns === 1 ? "" : "s"} · stored in your workspace
            </p>
          </div>
          <Button asChild size="sm">
            <Link href={href(`/layouts/${state.layout.id}`)}>
              Open view <ArrowUpRight size={14} />
            </Link>
          </Button>
        </div>
      ) : chosen.length ? (
        <form
          className="review-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="form-field">
            <span>View name</span>
            <input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <div className="review-plan">
            <span>This will create</span>
            <p>
              A saved view with {names.join(", ")} in {columns} column
              {columns === 1 ? "" : "s"}.
              {cameraIds.length > chosen.length &&
                " Only the first four connected cameras are included."}
            </p>
            <div className={`review-mosaic cols-${columns}`} aria-hidden="true">
              {chosen.map((camera) => (
                <span key={camera.id}>{camera.name}</span>
              ))}
            </div>
          </div>
          {duplicate && (
            <p className="field-warning">
              A saved view with this name already exists. Saving creates a
              second one.
            </p>
          )}
          {state.kind === "failed" && <ProblemMessage error={state.error} />}
          <div className="dialog-actions">
            <Button
              variant="ghost"
              onClick={() =>
                onAskMuse(
                  `Create a ${columns}-column saved view named "${name.trim()}" with ${names.join(", ")}.`,
                )
              }
            >
              <Sparkles size={14} />
              Ask Muse to propose it instead
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || state.kind === "saving"}
            >
              {state.kind === "saving" ? "Saving…" : "Save view"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="muted">
          None of these cameras are currently connected, so there is nothing to
          arrange.
        </p>
      )}
    </Dialog>
  );
}
