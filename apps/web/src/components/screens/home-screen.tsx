"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CameraOff,
  CornerDownLeft,
  Layers2,
  Plus,
  ScanSearch,
  Sparkles,
  Video,
} from "lucide-react";
import { isAbort, request } from "@/lib/client-api";
import { eventTitle } from "@/lib/events";
import {
  anchoredWindow,
  clockTime,
  dayLabel,
  hitFrameUrl,
  hitKey,
  topics,
} from "@/lib/explore";
import { isTestLayout, testCameraIds } from "@/lib/demo";
import { appRoutes, findDestinations } from "@/lib/navigation";
import type { Camera, Resource, SearchHit, SearchResponse } from "@/lib/types";
import { useCoverage } from "@/lib/use-coverage";
import { EvidenceFrame } from "../evidence-frame";
import { MediaPlayer } from "../media-player";
import { SourceMediaCredit } from "../source-media";
import { SpaceArt } from "../space-art";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import { Badge, CameraStatus, Skeleton } from "../ui/primitives";
import { ResourceState } from "../resource-state";
import { ViewMosaic } from "./layouts-screen";

const statusWord: Record<Camera["status"], string> = {
  online: "Sending video",
  offline: "Offline",
  error: "Connection issue",
  disabled: "Paused",
  unknown: "Checking",
};

export function HomeScreen() {
  const { preview, cameras, layouts, href, showTestSources } = useWorkspace();
  const allCameras = useMemo(
    () => (cameras.state === "ready" ? cameras.data : []),
    [cameras],
  );
  const testIds = testCameraIds(allCameras);
  const cameraData = showTestSources
    ? allCameras
    : allCameras.filter((camera) => !testIds.has(camera.id));
  const hiddenTests = allCameras.length - cameraData.length;
  const coverage = useCoverage(!preview);
  const found = useFoundMoments(coverage);
  const shape = useFrameShapes(cameraData, preview);
  const observations = (id: string) =>
    coverage.state === "ready"
      ? (coverage.data.items.find((item) => item.camera_id === id)
          ?.observations ?? 0)
      : 0;
  // Cameras sending video lead; among them, ones with Muse observations; paused ones last.
  const ordered = [...cameraData].sort(
    (a, b) =>
      Number(b.status === "online") - Number(a.status === "online") ||
      Number(b.enabled) - Number(a.enabled) ||
      observations(b.id) - observations(a.id) ||
      a.name.localeCompare(b.name),
  );
  // The stage plays one camera. Prefer a landscape source with the newest moment, so the
  // stage isn't mostly pillarbox; wait until frame shapes are known to avoid a restart.
  const latestByCamera =
    found.state === "ready" ? found.data.map((hit) => hit.camera_id) : [];
  const online = ordered.filter((camera) => camera.status === "online");
  const shapesKnown = online.every(
    (camera) => camera.source_media?.kind !== "prerecorded" || shape[camera.id],
  );
  const automatic =
    online
      .slice()
      .sort(
        (a, b) =>
          Number(shape[b.id] !== "portrait") -
            Number(shape[a.id] !== "portrait") ||
          rank(latestByCamera, a.id) - rank(latestByCamera, b.id),
      )[0] ?? ordered[0];
  const [chosen, setChosen] = useState<string | null>(null);
  const featured =
    ordered.find((camera) => camera.id === chosen) ??
    (shapesKnown || preview ? automatic : undefined);
  const indexed =
    coverage.state === "ready"
      ? coverage.data.items.reduce(
          (sum, item) => sum + item.indexed_segments,
          0,
        )
      : null;
  const latest =
    found.state === "ready" && found.data[0] ? found.data[0].start : null;

  return (
    <div className="hm">
      <header className="hm-head">
        <h1>Your spaces</h1>
        <p className="hm-status">
          {cameras.state === "ready" ? (
            <>
              <span>
                <strong>
                  {cameraData.filter((c) => c.status === "online").length}
                </strong>{" "}
                of {cameraData.length} cameras sending video
              </span>
              {cameraData.some((c) => c.status === "disabled") && (
                <span>
                  {cameraData.filter((c) => c.status === "disabled").length}{" "}
                  paused
                </span>
              )}
              {!!hiddenTests && (
                <span>
                  {hiddenTests} test source{hiddenTests === 1 ? "" : "s"} hidden
                </span>
              )}
              {cameraData.some(
                (c) => c.status === "offline" || c.status === "error",
              ) && (
                <span className="hm-status-alert">
                  {
                    cameraData.filter(
                      (c) => c.status === "offline" || c.status === "error",
                    ).length
                  }{" "}
                  not reachable
                </span>
              )}
              {indexed !== null && (
                <span>
                  <strong>{indexed}</strong> clips analyzed by Muse
                </span>
              )}
              {latest && (
                <span>
                  Latest moment {dayLabel(latest)},{" "}
                  <span className="tc">{clockTime(latest)}</span>
                </span>
              )}
            </>
          ) : cameras.state === "error" ? (
            <span className="hm-status-alert">
              Camera status couldn’t be read
            </span>
          ) : (
            <span>Checking your cameras…</span>
          )}
        </p>
      </header>

      <HomeFind coverage={coverage} />

      <div className="hm-body">
        <section className="hm-wall" aria-label="Your cameras">
          <ResourceState
            resource={cameras}
            emptyTitle="No cameras yet"
            emptyDescription="Connect an approved camera and its video appears here."
            emptyAction={
              <Button asChild>
                <Link href={href("/cameras")}>
                  <Plus size={15} />
                  Connect a camera
                </Link>
              </Button>
            }
          >
            {() => (
              <>
                <figure className="hm-stage">
                  <div className="hm-stage-frame">
                    {!featured ? (
                      <Skeleton className="hm-stage-skeleton" />
                    ) : preview ? (
                      <MediaPlayer camera={featured} />
                    ) : featured.status === "online" ? (
                      <MediaPlayer key={featured.id} camera={featured} />
                    ) : (
                      <div className="hm-stage-off" role="status">
                        <CameraOff size={22} />
                        <strong>{statusWord[featured.status]}</strong>
                        <p>
                          No video is playing from {featured.name}.
                          {featured.connection_error?.message
                            ? ` ${featured.connection_error.message}`
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                  {featured && (
                    <figcaption className="hm-stage-caption">
                      <span className="hm-stage-name">
                        <strong>{featured.name}</strong>
                        <CameraStatus status={featured.status} />
                        {featured.source_media?.kind === "prerecorded" &&
                          !preview && (
                            <span className="hm-stage-kind">
                              Demo stream · prerecorded
                            </span>
                          )}
                      </span>
                      <span className="hm-stage-actions">
                        <Link
                          className="hm-link"
                          href={href(`/explore?camera=${featured.id}`)}
                        >
                          <ScanSearch size={14} />
                          Moments here
                          {observations(featured.id)
                            ? ` · ${observations(featured.id)}`
                            : ""}
                        </Link>
                        <Button asChild size="sm" variant="secondary">
                          <Link href={href(`/live?camera_id=${featured.id}`)}>
                            <Video size={14} />
                            Live view
                          </Link>
                        </Button>
                      </span>
                      {!preview && featured.source_media && (
                        <SourceMediaCredit media={featured.source_media} />
                      )}
                    </figcaption>
                  )}
                </figure>
                <ul className="hm-spaces" aria-label="Choose a camera to watch">
                  {ordered.map((camera) => (
                    <li key={camera.id}>
                      <button
                        className={`hm-space ${camera.id === featured?.id ? "is-on-stage" : ""} is-${camera.status}`}
                        aria-pressed={camera.id === featured?.id}
                        onClick={() => setChosen(camera.id)}
                      >
                        <SpaceFrame camera={camera} preview={preview} />
                        <span className="hm-space-text">
                          <strong>{camera.name}</strong>
                          <span>
                            <span
                              className={`hm-dot is-${camera.status}`}
                              aria-hidden="true"
                            />
                            {statusWord[camera.status]}
                            {!!observations(camera.id) && (
                              <span className="hm-space-count tc">
                                {observations(camera.id)}
                                <span className="sr-only"> moments</span>
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ResourceState>
        </section>

        <aside className="hm-journal" aria-labelledby="journal-title">
          <div className="hm-journal-head">
            <h2 id="journal-title">Latest moments</h2>
            <Link className="hm-link" href={href("/explore")}>
              Explore all <ArrowRight size={14} />
            </Link>
          </div>
          {preview ? (
            <PreviewMoments />
          ) : found.state === "loading" ? (
            <div className="hm-entries" aria-busy="true">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="hm-entry-skeleton" />
              ))}
            </div>
          ) : found.state === "error" ? (
            <p className="hm-quiet">
              Recent moments couldn’t load. Explore still works.
            </p>
          ) : !found.data.length ? (
            <p className="hm-quiet">
              Nothing has been analyzed yet. Open a recording and make it
              searchable to see moments here.
            </p>
          ) : (
            <Journal hits={found.data} />
          )}
          {coverage.state === "ready" && <LookFor coverage={coverage.data} />}
        </aside>
      </div>

      <section className="hm-views" aria-labelledby="views-title">
        <div className="hm-views-head">
          <h2 id="views-title">Saved views</h2>
          <Link className="hm-link" href={href("/layouts")}>
            All saved views <ArrowRight size={14} />
          </Link>
        </div>
        <ResourceState
          compact
          resource={layouts}
          emptyTitle="No saved views yet"
          emptyDescription="A saved view keeps several cameras side by side."
          emptyAction={
            <Button asChild variant="secondary" size="sm">
              <Link href={href("/layouts")}>Create a view</Link>
            </Button>
          }
        >
          {(data) => (
            <ul className="hm-view-strip">
              {data
                .filter(
                  (layout) => showTestSources || !isTestLayout(layout, testIds),
                )
                .slice(0, 4)
                .map((layout) => (
                  <li key={layout.id}>
                    <Link
                      href={href(`/layouts/${layout.id}`)}
                      className="hm-view"
                    >
                      <ViewMosaic layout={layout} cameras={allCameras} />
                      <strong>{layout.name}</strong>
                      <span>
                        {layout.cells.length}{" "}
                        {layout.cells.length === 1 ? "camera" : "cameras"}
                      </span>
                    </Link>
                  </li>
                ))}
              <li>
                <Link href={href("/layouts")} className="hm-view hm-view-new">
                  <span className="hm-view-plus">
                    <Plus size={18} />
                  </span>
                  <strong>New view</strong>
                  <span>Arrange cameras side by side</span>
                </Link>
              </li>
            </ul>
          )}
        </ResourceState>
      </section>
      {preview && (
        <p className="fixture-footnote">
          <Badge tone="blue">Design preview</Badge>Camera states, moments and
          saved views above are authored examples.
        </p>
      )}
    </div>
  );
}

function rank(list: string[], id: string) {
  const index = list.indexOf(id);
  return index < 0 ? list.length : index;
}

/**
 * One find field. Words that name a place go there for free; anything else becomes a Muse
 * search in Explore, and the button says it costs one request before it is pressed.
 */
function HomeFind({ coverage }: { coverage: ReturnType<typeof useCoverage> }) {
  const { href, preview } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const text = query.trim();
  const places = text ? findDestinations(text).slice(0, 2) : [];
  // A word or two that matches a page is navigation, not a question.
  const goes = places.length > 0 && text.split(/\s+/).length <= 2;
  return (
    <div className="hm-find">
      <form
        className="hm-find-field"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text) return;
          if (goes) router.push(href(appRoutes[places[0].id]));
          else if (!preview)
            router.push(
              href(
                `/explore?q=${encodeURIComponent(text.slice(0, 2000))}&run=1`,
              ),
            );
        }}
      >
        <Sparkles size={18} className="hm-find-mark" aria-hidden="true" />
        <label htmlFor="home-query" className="sr-only">
          Find a moment in your video, or go to a page
        </label>
        <input
          id="home-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a moment — “a bus on the street”, or type a page like “recordings”"
          maxLength={2000}
          autoComplete="off"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!text || (!goes && preview)}
          aria-label={
            goes
              ? `Go to ${places[0].title}`
              : "Ask Muse to find it, uses 1 request"
          }
        >
          {goes ? (
            <>
              <ArrowRight size={14} />
              Go
            </>
          ) : (
            <>
              <CornerDownLeft size={14} />
              Ask Muse<span className="ws-cost">1 request</span>
            </>
          )}
        </Button>
      </form>
      {!!places.length && (
        <div className="hm-find-places" aria-label="Pages matching your words">
          {places.map((item) => (
            <Link key={item.id} href={href(appRoutes[item.id])}>
              <Layers2 size={13} />
              {item.title}
              <small>No request</small>
            </Link>
          ))}
        </div>
      )}
      {!places.length && coverage.state === "ready" && !text && (
        <p className="hm-find-hint">
          Searches only footage Muse has analyzed. Topics below and in Explore
          are free.
        </p>
      )}
    </div>
  );
}

function LookFor({
  coverage,
}: {
  coverage: NonNullable<
    Extract<ReturnType<typeof useCoverage>, { state: "ready" }>
  >["data"];
}) {
  const { href } = useWorkspace();
  const entries = topics.flatMap((topic) => {
    const counter = "count" in topic ? topic.count : undefined;
    if (!counter) return [];
    const count = coverage.items.reduce((sum, item) => sum + counter(item), 0);
    return count ? [{ topic, count }] : [];
  });
  if (!entries.length) return null;
  return (
    <nav className="hm-lookfor" aria-label="Look for in your video">
      <span>Look for</span>
      {entries.map(({ topic, count }) => (
        <Link key={topic.id} href={href(`/explore?topic=${topic.id}`)}>
          {topic.label}
          <span className="tc">{count}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Moments grouped under the minute they started, newest first; each opens in Explore. */
function Journal({ hits }: { hits: SearchHit[] }) {
  const { href } = useWorkspace();
  const groups: { label: string; hits: SearchHit[] }[] = [];
  for (const hit of hits) {
    const label = clockTime(hit.start);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.hits.push(hit);
    else groups.push({ label, hits: [hit] });
  }
  return (
    <ol className="hm-entries">
      {groups.map((group) => (
        <li key={group.label + group.hits.map(hitKey).join()}>
          <time className="hm-entry-time tc" dateTime={group.hits[0].start}>
            {group.label}
          </time>
          <ul>
            {group.hits.map((hit) => (
              <li key={hitKey(hit)}>
                <Link
                  className="hm-entry"
                  href={href(`/explore?moment=${hit.segment_id}`)}
                >
                  <EvidenceFrame
                    src={hitFrameUrl(hit)}
                    alt={`Frame from ${hit.camera_name} at ${clockTime(hit.start, true)}`}
                  />
                  <span>
                    <strong>{hit.camera_name}</strong>
                    <span className="hm-entry-summary">{hit.summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Authored preview events keep their labels; no frames exist for fixtures. */
function PreviewMoments() {
  const { events } = useWorkspace();
  if (events.state !== "ready") return null;
  return (
    <ol className="hm-entries">
      {events.data.slice(0, 3).map((event) => (
        <li key={event.id}>
          <time className="hm-entry-time tc">
            {clockTime(event.started_at)}
          </time>
          <ul>
            <li>
              <span className="hm-entry">
                <span className="evidence-frame">
                  <span className="evidence-frame-missing">Sample</span>
                </span>
                <span>
                  <strong>Sample moment</strong>
                  <span className="hm-entry-summary">
                    {eventTitle(event, true)}
                  </span>
                </span>
              </span>
            </li>
          </ul>
        </li>
      ))}
    </ol>
  );
}

function SpaceFrame({ camera, preview }: { camera: Camera; preview: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="hm-space-frame">
      {preview ? (
        <SpaceArt variant={camera.source_id} />
      ) : camera.source_media?.kind === "prerecorded" && !failed ? (
        // A video-derived poster, labelled by status text beside it, never as proof of live video.
        <Image
          src={`/api/v1/cameras/${camera.id}/thumbnail`}
          alt=""
          width={192}
          height={108}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="hm-space-none">
          <CameraOff size={16} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** Natural frame shape of each prerecorded camera's poster, to keep portrait films off the stage. */
function useFrameShapes(cameras: Camera[], preview: boolean) {
  const [shapes, setShapes] = useState<
    Record<string, "portrait" | "landscape" | "unknown">
  >({});
  const ids = cameras
    .filter((camera) => camera.source_media?.kind === "prerecorded")
    .map((camera) => camera.id)
    .join();
  useEffect(() => {
    if (preview || !ids) return;
    let live = true;
    for (const id of ids.split(",")) {
      const image = new window.Image();
      image.onload = () =>
        live &&
        setShapes((current) => ({
          ...current,
          [id]:
            image.naturalHeight > image.naturalWidth ? "portrait" : "landscape",
        }));
      image.onerror = () =>
        live && setShapes((current) => ({ ...current, [id]: "unknown" }));
      image.src = `/api/v1/cameras/${id}/thumbnail`;
    }
    return () => {
      live = false;
    };
  }, [ids, preview]);
  return shapes;
}

/** Newest stored Muse observations in the window that ends at the latest recorded video. */
function useFoundMoments(coverage: ReturnType<typeof useCoverage>) {
  const [found, setFound] = useState<Resource<SearchHit[]>>({
    state: "loading",
  });
  const window = useMemo(
    () =>
      coverage.state === "ready" ? anchoredWindow(coverage.data.items) : null,
    [coverage],
  );
  useEffect(() => {
    if (!window) return;
    const controller = new AbortController();
    request<SearchResponse>("/index-query", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        start: new Date(window.start).toISOString(),
        end: new Date(window.end).toISOString(),
        limit: 16,
      }),
    })
      .then((data) => {
        // One moment per camera first, so a single busy camera doesn't fill the journal.
        const seen = new Set<string>();
        const spread = [
          ...data.items.filter((hit) =>
            seen.has(hit.camera_id) ? false : seen.add(hit.camera_id),
          ),
          ...data.items.filter((hit) => !seen.has(hit.camera_id)),
        ]
          .slice(0, 6)
          .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
        setFound({ state: "ready", data: spread });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbort(error))
          setFound({ state: "error", message: "Moments couldn’t load." });
      });
    return () => controller.abort();
  }, [window]);
  if (coverage.state === "error")
    return { state: "error", message: coverage.message } as const;
  if (coverage.state === "ready" && !window)
    return { state: "ready", data: [] as SearchHit[] } as const;
  return found;
}
