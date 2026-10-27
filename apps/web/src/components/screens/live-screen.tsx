"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Film,
  Grid2X2,
  Grid3X3,
  Maximize2,
  Pencil,
  Plus,
  RectangleHorizontal,
  ScanSearch,
  Settings2,
} from "lucide-react";
import { ApiError, isAbort, request } from "@/lib/client-api";
import { isTestCamera, plural } from "@/lib/demo";
import type { Camera as CameraType, Layout, Resource } from "@/lib/types";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import { PageHeading, Retry, Skeleton, StatePanel } from "../ui/primitives";
import { ResourceState } from "../resource-state";
import { MediaPlayer } from "../media-player";
import { CameraFrame } from "../camera-card";
import { LayoutEditor } from "./layouts-screen";

/** Reads a saved view directly, so a view created moments ago (e.g. by Muse) opens at once. */
function useLayout(layoutId?: string): [Resource<Layout> | null, () => void] {
  const { preview, layouts } = useWorkspace();
  const [state, setState] = useState<Resource<Layout>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  // A saved edit bumps the workspace list; re-read the view so its version is current.
  const listed =
    layouts.state === "ready"
      ? layouts.data.find((item) => item.id === layoutId)?.version
      : undefined;
  useEffect(() => {
    if (!layoutId || preview) return;
    const controller = new AbortController();
    request<Layout>(`/layouts/${layoutId}`, { signal: controller.signal })
      .then((data) => setState({ state: "ready", data }))
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setState({
          state: "error",
          message: error instanceof Error ? error.message : "",
          code: error instanceof ApiError ? error.code : undefined,
          requestId: error instanceof ApiError ? error.requestId : undefined,
        });
      });
    return () => controller.abort();
  }, [layoutId, preview, attempt, listed]);
  const retry = () => setAttempt((value) => value + 1);
  if (!layoutId) return [null, retry];
  if (preview) {
    if (layouts.state !== "ready") return [layouts as Resource<Layout>, retry];
    const found = layouts.data.find((item) => item.id === layoutId);
    return [
      found
        ? { state: "ready", data: found }
        : { state: "error", message: "", code: "NOT_FOUND" },
      retry,
    ];
  }
  return [state, retry];
}

type Tile = { position: number; camera?: CameraType; missing?: boolean };
type Mode = "single" | "2" | "3" | "saved";
const PER_PAGE = { "2": 4, "3": 9 } as const;

/**
 * The live wall. Video sits edge to edge on the stage with a one-line caption per tile; the
 * chosen camera's facts and next steps sit in one strip under the wall, not on every tile.
 * A saved view (`layoutId`) renders its own arrangement with the same wall.
 */
export function LiveScreen({ layoutId }: { layoutId?: string }) {
  const { cameras, href, preview, showTestSources } = useWorkspace();
  const params = useSearchParams();
  const requestedCamera = params.get("camera_id");
  const [layout, retryLayout] = useLayout(layoutId);
  const [mode, setMode] = useState<Mode>(
    requestedCamera ? "single" : layoutId ? "saved" : "2",
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(requestedCamera);
  const [editor, setEditor] = useState<"edit" | "save" | null>(null);
  const savedLayout = layout?.state === "ready" ? layout.data : undefined;
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const shown = showTestSources
    ? cameraData
    : cameraData.filter(
        (camera) => !isTestCamera(camera) || camera.id === requestedCamera,
      );
  const sending = shown.filter((camera) => camera.status === "online").length;
  return (
    <div className="live">
      <PageHeading
        title={savedLayout?.name ?? (layoutId ? "Saved view" : "Live view")}
        description={
          savedLayout ? (
            <>
              <span>Saved view</span>
              <span>{plural(savedLayout.cells.length, "camera")}</span>
              <span>{plural(savedLayout.columns, "column")}</span>
              <span>version {savedLayout.version}</span>
            </>
          ) : cameras.state === "ready" && !layoutId ? (
            <>
              <span>
                {sending} of {plural(shown.length, "camera")} sending video
              </span>
              <span>a few seconds behind real time · muted</span>
            </>
          ) : undefined
        }
      >
        {savedLayout ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={href("/layouts")}>All saved views</Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditor("edit")}
            >
              <Pencil size={14} />
              Edit view
            </Button>
          </>
        ) : !layoutId ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditor("save")}
            disabled={!shown.length}
          >
            <Plus size={14} />
            Save as a view
          </Button>
        ) : null}
      </PageHeading>
      {layout?.state === "loading" ? (
        <div
          className="wall wall-2"
          role="status"
          aria-label="Loading saved view"
        >
          {[0, 1, 2, 3].map((item) => (
            <div className="wall-tile" key={item}>
              <Skeleton className="wall-skeleton" />
            </div>
          ))}
        </div>
      ) : layout?.state === "error" ? (
        <StatePanel
          kind="error"
          title={
            layout.code === "NOT_FOUND"
              ? "This view isn’t available"
              : "This view couldn’t be loaded"
          }
          description={
            layout.code === "NOT_FOUND"
              ? "It may have been removed, or it may belong to a different workspace."
              : layout.message
          }
        >
          {layout.code !== "NOT_FOUND" && <Retry onClick={retryLayout} />}
          <Button asChild variant="secondary" size="sm">
            <Link href={href("/layouts")}>See saved views</Link>
          </Button>
        </StatePanel>
      ) : (
        <ResourceState
          resource={cameras}
          emptyTitle="No cameras yet"
          emptyDescription="Once a camera is connected, its video appears here."
          emptyAction={
            <Button asChild>
              <Link href={href("/cameras")}>Connect a camera</Link>
            </Button>
          }
        >
          {(data) => {
            if (
              requestedCamera &&
              !data.some((camera) => camera.id === requestedCamera)
            )
              return (
                <StatePanel
                  kind="error"
                  title="This camera isn’t available"
                  description="It may have been removed. Choose a camera in your workspace to continue."
                >
                  <Button asChild variant="secondary" size="sm">
                    <Link href={href("/live")}>Show all cameras</Link>
                  </Button>
                </StatePanel>
              );
            const columns = savedLayout?.columns ?? 2;
            let tiles: Tile[];
            if (savedLayout) {
              const last = Math.max(
                ...savedLayout.cells.map((cell) => cell.position),
              );
              const rows = Math.floor(last / columns) + 1;
              tiles = Array.from({ length: rows * columns }, (_, position) => {
                const cell = savedLayout.cells.find(
                  (item) => item.position === position,
                );
                if (!cell) return { position };
                const camera = data.find((item) => item.id === cell.camera_id);
                return camera
                  ? { position, camera }
                  : { position, missing: true };
              });
            } else
              tiles = shown.map((camera, position) => ({ position, camera }));
            const available = tiles.flatMap((tile) => tile.camera ?? []);
            const focus =
              available.find((camera) => camera.id === selected) ??
              available[0];
            if (!focus)
              return (
                <StatePanel
                  title="No cameras in this view"
                  description="The cameras saved in this view are no longer registered."
                />
              );
            const perPage =
              mode === "2" || mode === "3" ? PER_PAGE[mode] : tiles.length;
            const pages = Math.max(1, Math.ceil(tiles.length / perPage));
            const current = Math.min(page, pages - 1);
            const visible =
              mode === "single"
                ? [{ position: 0, camera: focus }]
                : tiles.slice(current * perPage, current * perPage + perPage);
            const wallColumns =
              mode === "single"
                ? 1
                : mode === "saved"
                  ? columns
                  : mode === "3"
                    ? 3
                    : 2;
            return (
              <>
                <div className="wall-bar">
                  <div className="segmented-control" aria-label="Wall layout">
                    <button
                      aria-label="Single camera layout"
                      aria-pressed={mode === "single"}
                      onClick={() => setMode("single")}
                    >
                      <RectangleHorizontal size={15} />
                      <span>1</span>
                    </button>
                    {savedLayout ? (
                      <button
                        aria-label="Saved arrangement"
                        aria-pressed={mode === "saved"}
                        onClick={() => setMode("saved")}
                      >
                        <Grid2X2 size={15} />
                        <span>Saved arrangement</span>
                      </button>
                    ) : (
                      <>
                        <button
                          aria-label="2 by 2 camera layout"
                          aria-pressed={mode === "2"}
                          onClick={() => {
                            setMode("2");
                            setPage(0);
                          }}
                        >
                          <Grid2X2 size={15} />
                          <span>2 × 2</span>
                        </button>
                        <button
                          aria-label="3 by 3 camera layout"
                          aria-pressed={mode === "3"}
                          onClick={() => {
                            setMode("3");
                            setPage(0);
                          }}
                        >
                          <Grid3X3 size={15} />
                          <span>3 × 3</span>
                        </button>
                      </>
                    )}
                  </div>
                  {pages > 1 && mode !== "single" && (
                    <div className="wall-pager">
                      <button
                        disabled={current === 0}
                        onClick={() => setPage(current - 1)}
                        aria-label="Previous cameras"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span className="tc">
                        {current * perPage + 1}–
                        {Math.min(tiles.length, current * perPage + perPage)} of{" "}
                        {tiles.length}
                      </span>
                      <button
                        disabled={current >= pages - 1}
                        onClick={() => setPage(current + 1)}
                        aria-label="Next cameras"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div className={`wall wall-${wallColumns}`}>
                  {visible.map((tile) =>
                    tile.camera ? (
                      <figure
                        className={`wall-tile ${focus.id === tile.camera.id && mode !== "single" ? "is-focus" : ""}`}
                        key={`${tile.position}-${tile.camera.id}`}
                      >
                        <MediaPlayer camera={tile.camera} />
                        <figcaption>
                          <button
                            className="wall-name"
                            onClick={() => setSelected(tile.camera!.id)}
                            aria-pressed={focus.id === tile.camera.id}
                          >
                            <span
                              className={`wall-dot is-${tile.camera.status}`}
                              aria-hidden="true"
                            />
                            {tile.camera.name}
                          </button>
                          <span className="wall-state">
                            {statusWord(tile.camera)}
                          </span>
                          {mode !== "single" && (
                            <button
                              className="wall-expand"
                              aria-label={`Show ${tile.camera.name} alone`}
                              onClick={() => {
                                setSelected(tile.camera!.id);
                                setMode("single");
                              }}
                            >
                              <Maximize2 size={14} />
                            </button>
                          )}
                        </figcaption>
                      </figure>
                    ) : (
                      <figure
                        className="wall-tile wall-tile-empty"
                        key={`empty-${tile.position}`}
                      >
                        <div className="wall-empty">
                          <CameraOff size={18} />
                          <p>
                            {tile.missing
                              ? "This camera was removed from the workspace."
                              : "No camera saved here."}
                          </p>
                        </div>
                        <figcaption>
                          <span className="wall-state">
                            {tile.missing ? "Removed camera" : "Empty position"}
                          </span>
                        </figcaption>
                      </figure>
                    ),
                  )}
                </div>
                {mode === "single" && available.length > 1 && (
                  <ul className="wall-strip" aria-label="Choose camera">
                    {available.map((camera) => (
                      <li key={camera.id}>
                        <button
                          onClick={() => setSelected(camera.id)}
                          aria-pressed={focus.id === camera.id}
                        >
                          <CameraFrame camera={camera} />
                          <span>{camera.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <FocusStrip camera={focus} />
              </>
            );
          }}
        </ResourceState>
      )}
      {preview && (
        <p className="quiet-note">
          Preview tiles show original space illustrations. Playback controls
          appear only with actual video.
        </p>
      )}
      {editor === "edit" && savedLayout && (
        <LayoutEditor
          layout={savedLayout}
          open
          onOpenChange={(open) => !open && setEditor(null)}
        />
      )}
      {editor === "save" && (
        <LayoutEditor
          initialCameraIds={shown
            .filter((camera) => camera.status === "online")
            .slice(0, 4)
            .map((camera) => camera.id)}
          open
          onOpenChange={(open) => !open && setEditor(null)}
        />
      )}
    </div>
  );
}

function statusWord(camera: CameraType) {
  return camera.status === "online"
    ? camera.source_media?.kind === "prerecorded"
      ? "Demo stream"
      : "Live"
    : {
        offline: "Offline",
        error: "Connection issue",
        disabled: "Paused",
        unknown: "Checking",
      }[camera.status];
}

/** The chosen camera: where it is, and where to go next with it. */
function FocusStrip({ camera }: { camera: CameraType }) {
  const { href, recordings } = useWorkspace();
  const latest =
    recordings.state === "ready"
      ? recordings.data
          .filter((item) => item.camera_id === camera.id)
          .sort(
            (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
          )[0]
      : undefined;
  return (
    <div className="wall-focus" aria-label="Selected camera">
      <span className="wall-focus-name">
        <strong>{camera.name}</strong>
        {camera.location && <span>{camera.location}</span>}
      </span>
      <span className="wall-focus-actions">
        {latest && (
          <Link className="text-button" href={href(`/recordings/${latest.id}`)}>
            <Film size={14} />
            Latest recording
          </Link>
        )}
        <Link
          className="text-button"
          href={href(`/explore?camera=${camera.id}`)}
        >
          <ScanSearch size={14} />
          Moments
        </Link>
        <Link
          className="text-button"
          href={href(`/cameras?camera=${camera.id}`)}
        >
          <Settings2 size={14} />
          Camera details
        </Link>
      </span>
    </div>
  );
}
