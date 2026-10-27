"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CornerDownLeft,
  Crosshair,
  Grid2X2,
  ListFilter,
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
  Schema,
  SearchHit,
  SearchResponse,
} from "@/lib/types";
import { useCoverage } from "@/lib/use-coverage";
import { useRequestKey } from "@/lib/use-request-key";
import { EvidenceFrame } from "../evidence-frame";
import { MediaPlayer, formatOffset } from "../media-player";
import { SourceMediaCredit } from "../source-media";
import { SpaceArt } from "../space-art";
import { Timeline } from "../timeline";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { ErrorMessage, ProblemMessage, Skeleton } from "../ui/primitives";
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
const PAGE = 16;
const PARSE_CACHE = "veyra.muse-parse.v1";

type Mode = { kind: "index" } | { kind: "muse"; query: string };
type Pane = "moments" | "details" | "timeline";
/** Where the visible results came from: a Muse parse (1 request) or the stored index (free). */
type Source = "index" | "muse" | "refined";
type Parsed = Omit<SearchResponse, "items">;

/**
 * Muse's reading of a sentence is kept for the browser session, so Back, reload and every
 * camera/period refinement reuse it through the free index instead of a new model request.
 */
function readParse(query: string): Parsed | null {
  try {
    const all = JSON.parse(sessionStorage.getItem(PARSE_CACHE) ?? "{}");
    return all[query] ?? null;
  } catch {
    return null;
  }
}
function writeParse(query: string, value: Parsed) {
  try {
    const all = JSON.parse(sessionStorage.getItem(PARSE_CACHE) ?? "{}");
    all[query] = value;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - 20)))
      delete all[key];
    sessionStorage.setItem(PARSE_CACHE, JSON.stringify(all));
  } catch {
    // Storage can be unavailable; the refinement still works for this page.
  }
}

/** The part of Muse's reading the stored index can express directly. */
function refinement(c: Schema["StructuredSearch"]) {
  const categories = [...new Set(c.objects.map((o) => o.category))].slice(0, 4);
  const lost =
    c.objects.some(
      (o) => o.attributes.length > 0 || (o.apparel?.length ?? 0) > 0,
    ) || new Set(c.objects.map((o) => o.category)).size > 4;
  return {
    query: {
      categories,
      event_types: c.event_types,
      keywords: c.keywords.slice(0, 6),
      motion_only: c.motion_only,
    } satisfies Partial<IndexQuery>,
    lost,
  };
}

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
  // The effect reads Muse's readings from the ref; rendering reads the state mirror.
  const parsedRef = useRef<Record<string, Parsed>>({});
  const [parsedMap, setParsedMap] = useState<Record<string, Parsed>>({});
  const remember = useCallback((query: string, value: Parsed | null) => {
    if (value) parsedRef.current[query] = value;
    else delete parsedRef.current[query];
    setParsedMap({ ...parsedRef.current });
  }, []);
  const [loaded, setLoaded] = useState<{
    key: string;
    value: Resource<SearchResponse>;
    source: Source;
  }>({ key: "", value: { state: "loading" }, source: "index" });
  const [attempt, setAttempt] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>("moments");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRound, setReviewRound] = useState(0);
  const askField = useRef<HTMLInputElement>(null);
  const initialMoment = useRef(params.get("moment"));

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
    }),
    { segments: 0, indexed: 0 },
  );

  const windowStart = period?.start;
  const windowEnd = period?.end;
  // Each response is tagged with the request it answers; anything else reads as loading.
  const resultKey = JSON.stringify([
    mode.kind === "muse" ? mode.query : null,
    topic.id,
    cameraId,
    windowStart,
    windowEnd,
    attempt,
  ]);
  const results: Resource<SearchResponse> =
    loaded.key === resultKey ? loaded.value : { state: "loading" };
  const source: Source = loaded.key === resultKey ? loaded.source : "index";
  const museQuery = mode.kind === "muse" ? mode.query : null;
  useEffect(() => {
    if (preview || windowStart === undefined || windowEnd === undefined) return;
    const controller = new AbortController();
    const window = {
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
    };
    const cameraScope = cameraId === "all" ? [] : [cameraId];
    const parsed = museQuery ? parsedRef.current[museQuery] : undefined;
    let call: Promise<SearchResponse>;
    let from: Source;
    if (museQuery && parsed?.constraints.unsupported_reason) {
      // Muse already said this can't be searched; nothing to refine.
      call = Promise.resolve({ ...parsed, items: [] });
      from = "refined";
    } else if (museQuery && parsed) {
      // Free refinement: Muse's earlier reading, re-scoped, through the stored index.
      const c = parsed.constraints;
      const muse = refinement(c);
      from = "refined";
      call = request<SearchResponse>("/index-query", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          camera_ids: cameraScope.length ? cameraScope : (c.camera_ids ?? []),
          ...(range || !c.start || !c.end
            ? window
            : { start: c.start, end: c.end }),
          ...muse.query,
          limit: RESULT_LIMIT,
        }),
      });
    } else if (museQuery) {
      from = "muse";
      call = request<SearchResponse>("/search", {
        method: "POST",
        signal: controller.signal,
        timeoutMs: 65000,
        body: JSON.stringify({
          query: museQuery,
          camera_ids: cameraScope,
          ...window,
          limit: 24,
          timezone: timeZoneName(),
        }),
      });
    } else {
      from = "index";
      call = request<SearchResponse>("/index-query", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          camera_ids: cameraScope,
          ...window,
          ...(topic.query as Partial<IndexQuery>),
          limit: RESULT_LIMIT,
        }),
      });
    }
    call
      .then((data) => {
        if (controller.signal.aborted) return;
        if (from === "muse" && museQuery) {
          const { items: _items, ...reading } = data;
          void _items;
          remember(museQuery, reading);
          writeParse(museQuery, reading);
        }
        setLoaded({
          key: resultKey,
          value: { state: "ready", data },
          source: from,
        });
        const wanted = initialMoment.current
          ? data.items.find((hit) => hit.segment_id === initialMoment.current)
          : undefined;
        initialMoment.current = null;
        setSelectedKey((current) =>
          wanted
            ? hitKey(wanted)
            : current && data.items.some((hit) => hitKey(hit) === current)
              ? current
              : data.items[0]
                ? hitKey(data.items[0])
                : null,
        );
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setLoaded({
          key: resultKey,
          source: from,
          value: {
            state: "error",
            message:
              error instanceof Error ? error.message : "Search couldn’t run.",
            code: error instanceof ApiError ? error.code : undefined,
            requestId: error instanceof ApiError ? error.requestId : undefined,
          },
        });
      });
    return () => controller.abort();
    // resultKey captures every input; `range` and `topic` only matter through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, resultKey]);

  // A sentence in the URL (Back, reload, a link from Muse) reuses Muse's earlier reading for
  // free. Only an explicit "Ask Muse" choice elsewhere (run=1, from ⌘K) spends a request here.
  const initialQuery = useRef({
    q: params.get("q")?.trim() ?? "",
    run: params.get("run") === "1",
  });
  useEffect(() => {
    const { q, run } = initialQuery.current;
    if (!q || preview || !full) return;
    initialQuery.current = { q: "", run: false };
    const cached = readParse(q);
    if (cached) remember(q, cached);
    if (cached || run) setMode({ kind: "muse", query: q });
    if (run) setParam("run", null);
  }, [full, preview, setParam, remember]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target.isContentEditable) return;
      if (event.key === "/") {
        event.preventDefault();
        askField.current?.focus();
      }
      if (event.key === "Escape" && range) setRange(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [range]);

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const query = ask.trim();
    if (!query) return;
    // A deliberate Ask always re-reads the words with Muse (1 request).
    remember(query, null);
    setMode({ kind: "muse", query });
    setAttempt((value) => value + 1);
    setParam("q", query);
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
  const selectedIndex = selected ? hits.indexOf(selected) : -1;
  const response = results.state === "ready" ? results.data : null;
  const parsed = museQuery ? parsedMap[museQuery] : undefined;
  const busy = !preview && results.state === "loading";
  const museBusy = busy && mode.kind === "muse" && !parsed;
  const resultCameras = [...new Set(hits.map((hit) => hit.camera_id))];
  const select = (hit: SearchHit) => {
    setSelectedKey(hitKey(hit));
    setPlayhead(null);
  };
  const step = (delta: number) => {
    const next = hits[selectedIndex + delta];
    if (next) select(next);
  };
  const recordingSource =
    selected && recordings.state === "ready"
      ? recordings.data.find((r) => r.id === selected.recording_id)
          ?.source_media
      : undefined;
  const pendingAsk =
    mode.kind === "index" && ask.trim() && ask.trim() === params.get("q");

  const noVideo = !preview && coverage.state === "ready" && !full;
  return (
    <div className="ws" data-pane={pane}>
      {/* The top bar names the page; the workspace gives that room to the video. */}
      <h1 className="sr-only">Explore</h1>
      <form className="ws-ask" onSubmit={submit} role="search">
        <Sparkles size={17} className="ws-ask-mark" aria-hidden="true" />
        <label htmlFor="explore-ask" className="sr-only">
          Describe a moment for Muse to find
        </label>
        <input
          id="explore-ask"
          ref={askField}
          value={ask}
          onChange={(event) => setAsk(event.target.value)}
          maxLength={2000}
          placeholder="Describe a moment, such as “squirrels at the feeder”"
          autoComplete="off"
        />
        <kbd className="ws-ask-key" aria-hidden="true">
          /
        </kbd>
        <Button
          type="submit"
          size="sm"
          disabled={!ask.trim() || museBusy || preview}
          aria-label="Ask Muse, uses 1 request"
        >
          {museBusy ? (
            <LoaderCircle size={14} className="is-loading" />
          ) : (
            <CornerDownLeft size={14} />
          )}
          Ask Muse
          <span className="ws-cost">1 request</span>
        </Button>
        <p className="ws-facts">
          {coverage.state === "ready" ? (
            <>
              <strong>
                {totals.indexed.toLocaleString()} of{" "}
                {totals.segments.toLocaleString()}
              </strong>{" "}
              clips analyzed · {analyzedCameras.length} of {items.length}{" "}
              cameras
            </>
          ) : preview ? (
            "Preview · authored examples"
          ) : (
            " "
          )}
        </p>
      </form>

      <nav className="ws-switch" aria-label="Workspace panels">
        {(
          [
            ["moments", `Moments${hits.length ? ` · ${hits.length}` : ""}`],
            ["details", "Details"],
            ["timeline", "Timeline"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`ws-switch-${id}`}
            aria-pressed={pane === id}
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="ws-browser" aria-labelledby="results-title">
        <div className="ws-filters" role="group" aria-label="Filters">
          <div
            className="ws-topics"
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
                  className={`ws-topic ${active ? "is-active" : ""}`}
                  onClick={() => {
                    if (mode.kind === "muse") clearMuse();
                    setParam("topic", item.id === "all" ? null : item.id);
                  }}
                >
                  {item.id === "all" ? "All" : item.label}
                  {count !== null && <span>{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="ws-filter-row">
            <label className="ws-select">
              <ListFilter size={13} aria-hidden="true" />
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
                      {item.indexed_segments ? "" : " (not analyzed)"}
                    </option>
                  ))}
              </select>
            </label>
            {!!resultCameras.length && !preview && !busy && (
              <button
                className="ws-text-button"
                onClick={() => {
                  setReviewRound((value) => value + 1);
                  setReviewOpen(true);
                }}
              >
                <Grid2X2 size={13} />
                Watch together
              </button>
            )}
          </div>
        </div>

        <ResultsHeading
          mode={mode}
          source={source}
          topicLabel={topic.label}
          topicNote={"note" in topic ? topic.note : undefined}
          response={response}
          parsed={parsed}
          count={hits.length}
          busy={busy}
          failed={!preview && results.state === "error"}
          period={period}
          zoomed={!!range}
          onClearMuse={clearMuse}
          onReask={() => {
            if (!museQuery) return;
            remember(museQuery, null);
            setAttempt((value) => value + 1);
          }}
        />
        {pendingAsk && (
          <p className="ws-pending-ask">
            “{ask.trim()}” is ready to ask. Press Ask Muse to search for it · 1
            request.
          </p>
        )}

        {preview && (
          <p className="ws-note">
            Preview · authored example results with illustrations. Connect a
            workspace to explore real footage.
          </p>
        )}
        {preview && previewState === "indexing" && (
          <div className="ws-state">
            <h3>Getting this recording ready to search</h3>
            <p>
              Example progress only. Moments appear here as each clip finishes
              analysis.
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
        )}
        {noVideo ? (
          <p className="ws-note">
            Explore starts working once a camera has finished recordings.{" "}
            <Link href="/cameras">Open cameras</Link>
          </p>
        ) : coverage.state === "error" ? (
          <div className="ws-state" role="alert">
            <h3>Your video index couldn’t be read</h3>
            <p>No results are shown, because none were returned.</p>
            <ErrorMessage
              message={coverage.message}
              code={coverage.code}
              requestId={coverage.requestId}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCoverageAttempt((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        ) : !preview && results.state === "error" ? (
          <ResultsError
            error={results}
            mode={mode}
            source={source}
            onRetry={() => setAttempt((value) => value + 1)}
            onTopic={(id) => {
              clearMuse();
              setParam("topic", id === "all" ? null : id);
            }}
            onMuse={(query) => openMuse(query)}
          />
        ) : busy || (!preview && coverage.state === "loading") ? (
          <ol className="ws-results" aria-busy="true">
            {[0, 1, 2, 3, 4].map((item) => (
              <li key={item} className="ws-result is-skeleton">
                <Skeleton className="ws-thumb-skeleton" />
                <span>
                  <Skeleton />
                  <Skeleton className="skeleton-short" />
                </span>
              </li>
            ))}
          </ol>
        ) : hits.length ? (
          <ResultList
            hits={hits}
            selected={selected ? hitKey(selected) : null}
            onSelect={(hit) => {
              select(hit);
            }}
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

      <section className="ws-center" aria-label="Player and timeline">
        <div className="ws-stage">
          {selected ? (
            <MediaPlayer
              key={hitKey(selected)}
              recordingId={selected.recording_id}
              segmentId={selected.segment_id}
              offsetMs={selected.offset_ms}
              durationMs={10000}
              sourceMedia={recordingSource}
              onPosition={(offset) =>
                setPlayhead(
                  Date.parse(selected.start) +
                    (offset - selected.evidence.start_offset_ms),
                )
              }
            />
          ) : (
            <div className="ws-stage-empty" role="status">
              <Play size={22} aria-hidden="true" />
              <p>
                {busy
                  ? "Finding moments…"
                  : noVideo
                    ? "No recorded video yet."
                    : "Choose a moment to watch its footage here."}
              </p>
            </div>
          )}
        </div>
        <Transport
          hit={selected}
          index={selectedIndex}
          count={hits.length}
          prerecorded={recordingSource?.kind === "prerecorded"}
          onStep={step}
        />
        {!preview && period && coverage.state === "ready" && (
          <Timeline
            cameras={laneCameras}
            start={period.start}
            end={period.end}
            hits={hits}
            selected={selected}
            playhead={playhead}
            onSelect={select}
            onWindow={(start, end) => setRange({ start, end })}
            zoomed={!!range}
            onReset={() => setRange(null)}
          />
        )}
      </section>

      <aside className="ws-inspector" aria-label="Selected moment">
        {selected ? (
          <Inspector
            key={hitKey(selected)}
            hit={selected}
            hits={hits}
            onSelect={select}
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
            recordingSource={recordingSource}
            onSimilar={(text) => {
              setAsk(text);
              askField.current?.focus();
            }}
          />
        ) : (
          <p className="ws-note">Details of the selected moment appear here.</p>
        )}
      </aside>
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

function Transport({
  hit,
  index,
  count,
  prerecorded,
  onStep,
}: {
  hit: SearchHit | null;
  index: number;
  count: number;
  prerecorded: boolean;
  onStep: (delta: number) => void;
}) {
  const { href } = useWorkspace();
  return (
    <div className="ws-transport">
      {hit ? (
        <>
          <span className="ws-transport-what">
            <strong>{hit.camera_name}</strong>
            <time className="ws-tc" dateTime={hit.start}>
              {clockTime(hit.start, true)}–{clockTime(hit.end, true)}
            </time>
            <span className="ws-transport-meta">
              {formatOffset(hit.evidence.start_offset_ms)}–
              {formatOffset(hit.evidence.end_offset_ms)} in recording
              {prerecorded ? " · prerecorded demo footage" : ""}
            </span>
          </span>
          <span
            className="ws-stepper"
            role="group"
            aria-label="Step through moments"
          >
            <button
              onClick={() => onStep(-1)}
              disabled={index <= 0}
              aria-label="Previous moment"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="ws-tc">
              {index + 1} / {count}
            </span>
            <button
              onClick={() => onStep(1)}
              disabled={index < 0 || index >= count - 1}
              aria-label="Next moment"
            >
              <ChevronRight size={15} />
            </button>
          </span>
          <Button asChild size="sm" className="ws-open">
            <Link
              href={href(
                recordingHref(hit.recording_id, hit.offset_ms, hit.segment_id),
              )}
              aria-label={`Open in recording at ${formatOffset(hit.offset_ms)}`}
            >
              <Play size={13} />
              Open in recording
            </Link>
          </Button>
        </>
      ) : (
        <span className="ws-transport-meta">No moment selected</span>
      )}
    </div>
  );
}

function ResultsHeading({
  mode,
  source,
  topicLabel,
  topicNote,
  response,
  parsed,
  count,
  busy,
  failed,
  period,
  zoomed,
  onClearMuse,
  onReask,
}: {
  mode: Mode;
  source: Source;
  topicLabel: string;
  topicNote?: string;
  response: SearchResponse | null;
  parsed?: Parsed;
  count: number;
  busy: boolean;
  failed: boolean;
  period: { start: number; end: number } | null;
  zoomed: boolean;
  onClearMuse: () => void;
  onReask: () => void;
}) {
  const coverage = response?.coverage;
  return (
    <div className="ws-results-head">
      {mode.kind === "muse" && (
        <div className="ws-muse-query">
          <Sparkles size={13} aria-hidden="true" />
          <span>“{mode.query}”</span>
          <button
            onClick={onClearMuse}
            aria-label="Clear Muse search and return to filters"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <h2 id="results-title">
        {busy
          ? mode.kind === "muse" && source !== "refined" && !parsed
            ? "Muse is reading your words…"
            : "Reading stored analysis…"
          : failed
            ? "Results unavailable"
            : `${count} moment${count === 1 ? "" : "s"}`}
        {!busy && !failed && (
          <span className="ws-results-scope">
            {" "}
            · {mode.kind === "muse" ? "Muse search" : topicLabel}
            {zoomed && period
              ? ` · ${windowLabel(period.start, period.end)}`
              : ""}
            {count === RESULT_LIMIT ? ` · newest ${RESULT_LIMIT}` : ""}
          </span>
        )}
      </h2>
      {response && !busy && (
        <p className={`ws-coverage coverage-${coverage}`}>
          {coverage === "complete" ? (
            <Check size={12} />
          ) : (
            <CircleAlert size={12} />
          )}
          {coverage === "complete"
            ? "All recorded video here was analyzed"
            : coverage === "partial"
              ? `${formatDuration(response.analyzed_ms)} of ${formatDuration(response.available_ms)} recorded here was analyzed`
              : "No analyzed video in this period"}
        </p>
      )}
      {mode.kind === "muse" && parsed && !busy && (
        <MuseUnderstanding parsed={parsed} source={source} onReask={onReask} />
      )}
      {mode.kind === "index" && topicNote && !busy && (
        <p className="ws-hint">{topicNote}</p>
      )}
    </div>
  );
}

function MuseUnderstanding({
  parsed,
  source,
  onReask,
}: {
  parsed: Parsed;
  source: Source;
  onReask: () => void;
}) {
  const c = parsed.constraints;
  const chips = [
    ...c.camera_names.map((name) => `Camera: ${name}`),
    ...c.objects.map(objectLabel),
    ...c.event_types.map((type) => eventLabels[type] ?? type),
    ...(c.motion_only ? ["Motion only"] : []),
    ...c.keywords.map((word) => `“${word}”`),
  ];
  const lost = refinement(c).lost;
  return (
    <div className="ws-understood">
      <span>Muse understood</span>
      <ul aria-label="How Muse understood your words">
        {chips.length ? (
          chips.map((chip, index) => <li key={`${chip}-${index}`}>{chip}</li>)
        ) : (
          <li>No specific conditions</li>
        )}
      </ul>
      <small>
        {source === "muse"
          ? `Read in ${(parsed.latency_ms / 1000).toFixed(1)}s · 1 request · stored analysis only`
          : "Reusing Muse’s reading · filtered in the stored index · no new request"}
        {source === "refined" && lost && (
          <>
            {" "}
            · colour and clothing details aren’t applied here.{" "}
            <button className="ws-text-button" onClick={onReask}>
              Ask Muse again · 1 request
            </button>
          </>
        )}
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
  const sameDay = hits.every(
    (hit) => dayLabel(hit.start) === dayLabel(hits[0].start),
  );
  useEffect(() => {
    // A selection made elsewhere (timeline, stepper) scrolls its row into the list's view.
    list.current
      ?.querySelector<HTMLElement>("[aria-current='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <>
      <ol
        className="ws-results"
        ref={list}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          const buttons = [
            ...(list.current?.querySelectorAll<HTMLButtonElement>(
              "button.ws-result",
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
                Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
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
                className={`ws-result ${selected === key ? "is-selected" : ""}`}
                aria-current={selected === key ? "true" : undefined}
                data-result
                onClick={() => onSelect(hit)}
              >
                {preview ? (
                  <span className="evidence-frame">
                    <SpaceArt />
                    <span className="evidence-frame-label">
                      Illustration · no video
                    </span>
                  </span>
                ) : (
                  <EvidenceFrame
                    src={hitFrameUrl(hit)}
                    alt={`Frame from ${hit.camera_name} at ${clockTime(hit.start, true)}`}
                    label={`${seconds}s`}
                  />
                )}
                <span className="ws-result-text">
                  <span className="ws-result-meta">
                    <strong>{hit.camera_name}</strong>
                    <time className="ws-tc" dateTime={hit.start}>
                      {!sameDay && `${dayLabel(hit.start)} `}
                      {clockTime(hit.start, true)}
                    </time>
                  </span>
                  <span className="ws-result-summary">{hit.summary}</span>
                  <span className="ws-result-tags">
                    {hit.metadata_id
                      ? hit.event_types
                          .slice(0, 2)
                          .map((type) => eventLabels[type] ?? type)
                          .join(" · ")
                      : "Motion signal"}
                    {hit.uncertainty === "high" && (
                      <span className="ws-unsure">Muse is unsure</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {hits.length > visible && (
        <div className="ws-more">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShown(visible + PAGE)}
          >
            Show {Math.min(PAGE, hits.length - visible)} more
          </Button>
          <span>
            {visible} of {hits.length}
          </span>
        </div>
      )}
    </>
  );
}

const certainty = {
  low: "Muse is fairly sure",
  medium: "Muse is reasonably sure",
  high: "Muse is unsure",
} as const;

function Inspector({
  hit,
  hits,
  onSelect,
  onFocusCamera,
  onAround,
  onSimilar,
  recordingSource,
}: {
  recordingSource?: Camera["source_media"];
  hit: SearchHit;
  hits: SearchHit[];
  onSelect: (hit: SearchHit) => void;
  onFocusCamera: (cameraId: string) => void;
  onAround: (start: number, end: number) => void;
  onSimilar: (text: string) => void;
}) {
  const { preview, href, cameras } = useWorkspace();
  const camera =
    cameras.state === "ready"
      ? cameras.data.find((item) => item.id === hit.camera_id)
      : undefined;
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
  // Repeated categories are numbered so "Object, Object" reads as two distinct things.
  const seen = hit.objects.slice(0, 6).map((object, index, all) => {
    const label = objectLabel(object);
    const same = all.filter((other) => objectLabel(other) === label);
    return {
      label: same.length > 1 ? `${label} ${same.indexOf(object) + 1}` : label,
      evidence: object.evidence,
      key: `${object.category}-${index}`,
    };
  });
  const short = hit.summary.split(/[.;]/)[0].slice(0, 90);
  return (
    <article className="ws-detail">
      <p className="ws-eyebrow">
        {hit.metadata_id ? "Muse observation" : "Motion signal"}
        <span className={hit.uncertainty === "high" ? "ws-unsure" : ""}>
          {certainty[hit.uncertainty]}
        </span>
      </p>
      <h2 className="ws-detail-title">{hit.summary}</h2>
      {hit.evidence_text && hit.evidence_text !== hit.summary && (
        <p className="ws-detail-evidence">{hit.evidence_text}</p>
      )}
      <dl className="ws-facts-list">
        <dt>Camera</dt>
        <dd>{hit.camera_name}</dd>
        <dt>When</dt>
        <dd>
          <time dateTime={hit.start}>
            {dayLabel(hit.start)}, {clockTime(hit.start, true)}
          </time>
          –<time dateTime={hit.end}>{clockTime(hit.end, true)}</time>
        </dd>
        <dt>Tagged</dt>
        <dd>
          {hit.event_types
            .map((type) => eventLabels[type] ?? type)
            .join(", ") || "—"}
        </dd>
      </dl>
      <div className="ws-detail-actions">
        {camera?.enabled && (
          <Button asChild variant="secondary" size="sm">
            <Link href={href(`/live?camera_id=${hit.camera_id}`)}>
              <Video size={14} />
              Watch live
            </Link>
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onAround(startMs - 5 * 60000, endMs + 5 * 60000)}
        >
          <Crosshair size={14} />
          ±5 min
        </Button>
        <button
          className="ws-text-button"
          onClick={() => onFocusCamera(hit.camera_id)}
        >
          Only {hit.camera_name}
        </button>
      </div>

      {!!seen.length && (
        <section className="ws-section">
          <h3>What Muse saw</h3>
          <ul className="ws-seen">
            {seen.map((item) => (
              <li key={item.key}>
                <p>{item.evidence}</p>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ws-section">
        <h3>Around this moment</h3>
        {preview ? null : related.state === "loading" ? (
          <Skeleton />
        ) : related.state === "error" ? (
          <p className="ws-hint">{related.message}</p>
        ) : related.data.length ? (
          <ul className="ws-related">
            {related.data.map((item) => {
              const inResults = hits.find(
                (other) => hitKey(other) === hitKey(item),
              );
              const frame = (
                <>
                  <EvidenceFrame
                    src={hitFrameUrl(item)}
                    alt={`Frame from ${item.camera_name} at ${clockTime(item.start, true)}`}
                  />
                  <time className="ws-tc" dateTime={item.start}>
                    {clockTime(item.start, true)}
                  </time>
                </>
              );
              return (
                <li key={hitKey(item)}>
                  {inResults ? (
                    <button
                      onClick={() => onSelect(inResults)}
                      aria-label={`Show ${clockTime(item.start, true)}: ${item.summary}`}
                    >
                      {frame}
                    </button>
                  ) : (
                    <Link
                      href={href(
                        recordingHref(
                          item.recording_id,
                          item.offset_ms,
                          item.segment_id,
                        ),
                      )}
                      aria-label={`Open recording at ${clockTime(item.start, true)}: ${item.summary}`}
                    >
                      {frame}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ws-hint">
            No other analyzed moments on this camera within five minutes.
          </p>
        )}
      </section>

      <section className="ws-section">
        <h3>How sure is this?</h3>
        <p className="ws-hint">
          {hit.uncertainty_notes ? `${hit.uncertainty_notes} ` : ""}A model
          description, not verified fact. Watch the footage before acting on it.
          Muse describes what is visible and does not identify people.
        </p>
        <details className="ws-provenance">
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
          <SourceMediaCredit media={recordingSource} />
        </details>
      </section>

      {!preview && (
        <button
          className="ws-muse-context"
          onClick={() => onSimilar(`Moments like “${short}”`)}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>
            Find moments like this
            <small>Writes a question in the search box · sends nothing</small>
          </span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      )}
    </article>
  );
}

function ResultsError({
  error,
  mode,
  source,
  onRetry,
  onTopic,
  onMuse,
}: {
  error: Extract<Resource<never>, { state: "error" }>;
  mode: Mode;
  source: Source;
  onRetry: () => void;
  onTopic: (id: TopicId) => void;
  onMuse: (query: string) => void;
}) {
  const museFailed = mode.kind === "muse" && source === "muse";
  const fallback = museFailed ? closestTopic(mode.query) : null;
  const unavailable =
    error.code === "MODEL_BUDGET_EXHAUSTED" ||
    error.code === "MODEL_UNAVAILABLE" ||
    error.code === "MODEL_BUSY" ||
    error.code === "MODEL_NOT_CONFIGURED";
  if (museFailed && error.code && correctable.has(error.code))
    return (
      <div className="ws-state">
        <h3>Try describing it differently</h3>
        <p>
          Muse couldn’t turn these words into a search Veyra supports. Nothing
          was searched.
        </p>
        <ErrorMessage
          message={error.message}
          code={error.code}
          requestId={error.requestId}
        />
      </div>
    );
  return (
    <div className="ws-state" role="alert">
      <h3>
        {museFailed
          ? unavailable
            ? error.code === "MODEL_BUDGET_EXHAUSTED"
              ? "Muse has reached today’s request limit"
              : "Muse isn’t available right now"
            : "Muse search couldn’t be completed"
          : "Stored analysis couldn’t be read"}
      </h3>
      <p>No results are shown, because none were returned.</p>
      <ErrorMessage
        message={error.message}
        code={error.code}
        requestId={error.requestId}
      />
      <div className="ws-state-actions">
        {fallback && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onTopic(fallback)}
          >
            Show the “{topicById(fallback).label}” filter instead · free
          </Button>
        )}
        {!(museFailed && unavailable) && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again{museFailed ? " · 1 request" : ""}
          </Button>
        )}
        {museFailed && !unavailable && mode.kind === "muse" && (
          <Button variant="ghost" size="sm" onClick={() => onMuse(mode.query)}>
            Write it in the Muse panel
          </Button>
        )}
      </div>
    </div>
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
    <div className="ws-state">
      <h3>
        {reason
          ? "This search isn’t supported"
          : response?.coverage === "none"
            ? "Nothing analyzed in this period"
            : "No matching moments"}
      </h3>
      <p>
        {reason
          ? (unsupported[reason] ?? "Try a simpler description.")
          : response?.coverage === "none"
            ? "Recordings here haven’t been analyzed by Muse yet. Open a recording to make it searchable, or widen the period."
            : `${mode.kind === "muse" ? "Muse searched the stored analysis" : "The stored analysis was checked"} and found no match. Only analyzed clips can match, so this doesn’t prove it didn’t happen.`}
      </p>
      <div className="ws-state-actions">
        {zoomed && (
          <Button variant="secondary" size="sm" onClick={onReset}>
            Show the full range
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onAll}>
          Show all moments
        </Button>
      </div>
    </div>
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
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Watch these cameras together"
      description="Save a view with the cameras in these results, so you can watch them side by side."
    >
      {state.kind === "saved" ? (
        <div className="review-receipt" role="status">
          <Check size={18} />
          <div>
            <strong>Saved “{state.layout.name}”</strong>
            <p>
              {plural(state.layout.cells.length, "camera")} ·{" "}
              {plural(state.layout.columns, "column")} · stored in your
              workspace
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
              A saved view with {names.join(", ")} in{" "}
              {plural(columns, "column")}.
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
              Write it for Muse instead
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
