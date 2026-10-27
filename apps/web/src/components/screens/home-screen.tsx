"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Plus,
  ShieldCheck,
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
import type { Camera, Resource, SearchHit, SearchResponse } from "@/lib/types";
import { useCoverage } from "@/lib/use-coverage";
import { EvidenceFrame } from "../evidence-frame";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import {
  Badge,
  CameraStatus,
  SectionTitle,
  Skeleton,
  TextLink,
} from "../ui/primitives";
import { ResourceState } from "../resource-state";
import { CameraVisual } from "../camera-card";
import { MediaPlayer } from "../media-player";
import { suggestedPrompts } from "../muse-panel";
import { recordingHref } from "./recordings-screen";

export function HomeScreen() {
  const { preview, cameras, layouts, events, href, openMuse } = useWorkspace();
  const [query, setQuery] = useState("");
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const coverage = useCoverage(!preview);
  const found = useFoundMoments(coverage);
  const latest =
    found.state === "ready" && found.data[0] ? found.data[0].start : null;
  return (
    <div className="home-screen">
      <header className="home-head">
        <h1>{greeting()}.</h1>
        <p className="home-status">
          {cameras.state === "ready" ? (
            <>
              <span>
                <strong>
                  {cameraData.filter((c) => c.status === "online").length}
                </strong>{" "}
                of {cameraData.filter((c) => c.enabled).length} cameras sending
                video
                {cameraData.some((c) => c.status === "offline") &&
                  ` · ${cameraData.filter((c) => c.status === "offline").length} offline`}
              </span>
              {coverage.state === "ready" && (
                <span>
                  <strong>
                    {coverage.data.items.reduce(
                      (sum, item) => sum + item.indexed_segments,
                      0,
                    )}
                  </strong>{" "}
                  clips analyzed by Muse
                </span>
              )}
              {latest && (
                <span>
                  Latest moment {dayLabel(latest)}, {clockTime(latest)}
                </span>
              )}
            </>
          ) : (
            <span>Checking your cameras…</span>
          )}
          <Link href={href("/cameras")}>
            Manage cameras <ChevronRight size={14} />
          </Link>
        </p>
      </header>
      <form
        className="home-command"
        onSubmit={(event) => {
          event.preventDefault();
          openMuse(query);
        }}
      >
        <span className="command-spark">
          <Sparkles size={22} />
        </span>
        <label htmlFor="home-query" className="sr-only">
          Ask Muse about your workspace
        </label>
        <input
          id="home-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a moment, or ask Muse to lend a hand…"
          maxLength={4000}
        />
        <Button type="submit" size="icon" aria-label="Ask Muse">
          <ArrowRight size={20} />
        </Button>
      </form>
      <div className="suggested-prompts">
        <span>Try asking</span>
        {suggestedPrompts(cameraData).map((prompt) => (
          <button key={prompt} onClick={() => openMuse(prompt)}>
            {prompt}
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <div className="home-columns">
        <section className="home-main-section">
          <SectionTitle
            title="Your everyday view"
            description="A familiar place to check in."
          >
            <Link href={href("/live")}>
              <TextLink>Open live view</TextLink>
            </Link>
          </SectionTitle>
          <ResourceState
            resource={cameras}
            emptyTitle="Make yourself at home"
            emptyDescription="Connect your first approved camera to bring your spaces into view."
            emptyAction={
              <Button asChild>
                <Link href={href("/cameras")}>
                  <Plus size={16} />
                  Connect a camera
                </Link>
              </Button>
            }
          >
            {(data) => {
              // Lead with a camera that is actually sending video, preferring the one with
              // the most recent activity; its feed plays here.
              const online = data.filter(
                (camera) => camera.status === "online",
              );
              const recent =
                found.state === "ready"
                  ? found.data[0]?.camera_id
                  : events.state === "ready"
                    ? [...events.data].sort(
                        (a, b) =>
                          Date.parse(b.started_at) - Date.parse(a.started_at),
                      )[0]?.camera_id
                    : undefined;
              const spotlight =
                online.find((camera) => camera.id === recent) ??
                online[0] ??
                data[0];
              return (
                <article className="spotlight-card">
                  {preview || spotlight.status !== "online" ? (
                    <CameraVisual camera={spotlight} />
                  ) : (
                    <MediaPlayer camera={spotlight} />
                  )}
                  <div className="spotlight-caption">
                    <div>
                      <span className="subtle-label">
                        {preview
                          ? "Sample space"
                          : spotlight.status === "online"
                            ? spotlight.source_media?.kind === "prerecorded"
                              ? "Demo stream · Prerecorded footage"
                              : "Live now · muted"
                            : "Your workspace"}
                      </span>
                      <h3>{spotlight.name}</h3>
                      <CameraStatus status={spotlight.status} />
                    </div>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={href(`/live?camera_id=${spotlight.id}`)}>
                        <Video size={15} />
                        Open view
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            }}
          </ResourceState>
        </section>
        <section className="recent-activity">
          <SectionTitle title="Recently found by Muse">
            <Link href={href("/explore")}>
              <TextLink>Explore all</TextLink>
            </Link>
          </SectionTitle>
          {preview ? (
            <PreviewMoments />
          ) : found.state === "loading" ? (
            <div className="found-list" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="found-skeleton" />
              ))}
            </div>
          ) : found.state === "error" || !found.data.length ? (
            <p className="muted found-empty">
              {found.state === "error"
                ? "Recent moments couldn’t load. Explore still works."
                : "Nothing has been analyzed yet. Open a recording and make it searchable to see moments here."}
            </p>
          ) : (
            <ul className="found-list">
              {found.data.map((hit) => (
                <li key={hitKey(hit)}>
                  <Link
                    href={href(
                      recordingHref(
                        hit.recording_id,
                        hit.offset_ms,
                        hit.segment_id,
                      ),
                    )}
                    className="found-row"
                  >
                    <EvidenceFrame
                      src={hitFrameUrl(hit)}
                      alt={`Frame from ${hit.camera_name} at ${clockTime(hit.start, true)}`}
                    />
                    <span>
                      <span className="found-meta">
                        <strong>{hit.camera_name}</strong>
                        {clockTime(hit.start)}
                      </span>
                      <span className="found-summary">{hit.summary}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {coverage.state === "ready" && (
            <nav className="look-for" aria-label="Look for in your video">
              <span>Look for</span>
              {topics
                .filter((topic) => "count" in topic)
                .map((topic) => {
                  const counter = "count" in topic ? topic.count : undefined;
                  const count = counter
                    ? coverage.data.items.reduce(
                        (sum, item) => sum + counter(item),
                        0,
                      )
                    : 0;
                  return count ? (
                    <Link
                      key={topic.id}
                      href={href(`/explore?topic=${topic.id}`)}
                    >
                      {topic.label}
                      <span>{count}</span>
                    </Link>
                  ) : null;
                })}
            </nav>
          )}
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Your space. Your say.</strong>
              <p>You choose which cameras can use cloud video analysis.</p>
              <Link href={href("/settings#privacy")}>
                Review privacy
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </div>
      <section className="saved-views-section">
        <SectionTitle
          title="Saved views"
          description="Camera arrangements you come back to."
        >
          <Link href={href("/layouts")}>
            <TextLink>All saved views</TextLink>
          </Link>
        </SectionTitle>
        <ResourceState
          compact
          resource={layouts}
          emptyTitle="Your favorite spaces, together"
          emptyDescription="Create a saved view to keep a camera arrangement close at hand."
          emptyAction={
            <Button asChild variant="secondary" size="sm">
              <Link href={href("/layouts")}>Create a view</Link>
            </Button>
          }
        >
          {(data) => (
            <div className="saved-view-grid">
              {data.slice(0, 2).map((layout) => (
                <Link
                  key={layout.id}
                  href={href(`/layouts/${layout.id}`)}
                  className="saved-view-card"
                >
                  <FrameMosaic
                    cameras={layout.cells
                      .slice(0, 4)
                      .map((cell) =>
                        cameraData.find(
                          (camera) => camera.id === cell.camera_id,
                        ),
                      )}
                    columns={layout.columns}
                    preview={preview}
                  />
                  <div>
                    <h3>{layout.name}</h3>
                    <p>
                      {layout.cells.length} cameras · {layout.columns} columns
                    </p>
                  </div>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
              <Link
                href={href("/layouts")}
                className="saved-view-card new-view-card"
              >
                <span className="new-view-icon">
                  <Plus size={22} />
                </span>
                <div>
                  <h3>Make it your own</h3>
                  <p>Create a new saved view</p>
                </div>
              </Link>
            </div>
          )}
        </ResourceState>
      </section>
      {preview && (
        <p className="fixture-footnote">
          <Badge tone="blue">Design preview</Badge>Camera states, activity, and
          saved views above are authored examples.
        </p>
      )}
    </div>
  );
}

/** Authored preview events keep their labels; no frames exist for fixtures. */
function PreviewMoments() {
  const { events, href } = useWorkspace();
  if (events.state !== "ready") return null;
  return (
    <ul className="found-list">
      {events.data.slice(0, 3).map((event) => (
        <li key={event.id}>
          <Link
            className="found-row"
            href={href(
              recordingHref(
                event.recording_id,
                event.evidence_offset_ms,
                event.segment_id,
              ),
            )}
          >
            <span className="evidence-frame">
              <span className="evidence-frame-missing">Sample</span>
            </span>
            <span>
              <span className="found-meta">
                <strong>Sample moment</strong>
                {clockTime(event.started_at)}
              </span>
              <span className="found-summary">{eventTitle(event, true)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 5
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";
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
        limit: 12,
      }),
    })
      .then((data) => {
        // One moment per camera first, so a single busy camera doesn't fill the list.
        const seen = new Set<string>();
        const spread = [
          ...data.items.filter((hit) =>
            seen.has(hit.camera_id) ? false : seen.add(hit.camera_id),
          ),
          ...data.items.filter((hit) => !seen.has(hit.camera_id)),
        ];
        setFound({ state: "ready", data: spread.slice(0, 4) });
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

function FrameMosaic({
  cameras,
  columns,
  preview,
}: {
  cameras: (Camera | undefined)[];
  columns: number;
  preview: boolean;
}) {
  return (
    <div
      className={`view-mosaic cols-${Math.min(columns, 2)}`}
      aria-hidden="true"
    >
      {cameras.map((camera, index) =>
        !preview && camera?.source_media?.kind === "prerecorded" ? (
          <Image
            key={`${camera.id}-${index}`}
            src={`/api/v1/cameras/${camera.id}/thumbnail`}
            alt=""
            width={96}
            height={54}
            unoptimized
          />
        ) : (
          <span key={`${camera?.id ?? "missing"}-${index}`} />
        ),
      )}
    </div>
  );
}
