"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Maximize2,
  Plus,
  RectangleHorizontal,
  Sparkles,
} from "lucide-react";
import { ApiError, isAbort, request } from "@/lib/client-api";
import type { Camera as CameraType, Layout, Resource } from "@/lib/types";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import {
  Badge,
  CameraStatus,
  PageHeading,
  Retry,
  Skeleton,
  StatePanel,
} from "../ui/primitives";
import { ResourceState } from "../resource-state";
import { MediaPlayer } from "../media-player";

/** Reads a saved view directly, so a view created moments ago (e.g. by Muse) opens at once. */
function useLayout(layoutId?: string): [Resource<Layout> | null, () => void] {
  const { preview, layouts } = useWorkspace();
  const [state, setState] = useState<Resource<Layout>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
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
  }, [layoutId, preview, attempt]);
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

export function LiveScreen({ layoutId }: { layoutId?: string }) {
  const { cameras, href, preview, openMuse } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const requestedCamera = params.get("camera_id");
  const [layout, retryLayout] = useLayout(layoutId);
  const [mode, setMode] = useState<"single" | "grid">(
    requestedCamera ? "single" : "grid",
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(requestedCamera);
  const savedLayout = layout?.state === "ready" ? layout.data : undefined;
  return (
    <>
      <PageHeading
        title={savedLayout?.name ?? "Live view"}
        description={
          layoutId
            ? "Your saved camera arrangement, ready when you are."
            : "Check in on one space, or see a little more together."
        }
      >
        <Button asChild variant="secondary">
          <Link href={href("/layouts")}>
            <Plus size={16} />
            {layoutId ? "All saved views" : "Save a view"}
          </Link>
        </Button>
      </PageHeading>
      <div className="live-toolbar">
        <div className="button-row">
          <Camera size={18} />
          <span>
            {layoutId ? (savedLayout?.name ?? "Saved view") : "All cameras"}
          </span>
          {savedLayout && (
            <Badge>
              {savedLayout.columns} column{savedLayout.columns === 1 ? "" : "s"}{" "}
              · v{savedLayout.version}
            </Badge>
          )}
          {preview && <Badge tone="blue">Sample cameras</Badge>}
        </div>
        <div className="segmented-control" aria-label="View layout">
          <button
            aria-label="Single camera layout"
            aria-pressed={mode === "single"}
            onClick={() => setMode("single")}
          >
            <RectangleHorizontal size={17} />
            <span>Single</span>
          </button>
          <button
            aria-label={
              savedLayout ? "Saved arrangement" : "2 by 2 camera layout"
            }
            aria-pressed={mode === "grid"}
            onClick={() => setMode("grid")}
          >
            <Grid2X2 size={17} />
            <span>{savedLayout ? "Saved arrangement" : "2 × 2"}</span>
          </button>
        </div>
      </div>
      {layout?.state === "loading" ? (
        <div
          className="live-grid live-columns-2"
          role="status"
          aria-label="Loading saved view"
        >
          {[0, 1, 2, 3].map((item) => (
            <div className="live-tile" key={item}>
              <Skeleton className="skeleton-title" />
              <div className="media-player" />
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
          emptyTitle="A place for your first camera"
          emptyDescription="Once connected, your cameras will be ready to view here."
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
              tiles = data.map((camera, position) => ({ position, camera }));
            const available = tiles.flatMap((tile) => tile.camera ?? []);
            const selectedCamera =
              available.find((camera) => camera.id === selected) ??
              available[0];
            if (!selectedCamera)
              return (
                <StatePanel
                  title="No cameras in this view"
                  description="The cameras saved in this view are no longer registered."
                />
              );
            const pages = savedLayout ? 1 : Math.ceil(tiles.length / 4);
            const currentPage = Math.min(page, pages - 1);
            const visible =
              mode === "single"
                ? [{ position: 0, camera: selectedCamera }]
                : savedLayout
                  ? tiles
                  : tiles.slice(currentPage * 4, currentPage * 4 + 4);
            const gridColumns =
              mode === "single" ? 1 : savedLayout ? columns : 2;
            return (
              <>
                <div
                  className={`live-grid live-columns-${Math.min(gridColumns, 2)} ${gridColumns === 3 ? "live-columns-3" : ""}`}
                >
                  {visible.map((tile) =>
                    tile.camera ? (
                      <article
                        className={`live-tile ${selectedCamera.id === tile.camera.id && mode === "grid" ? "tile-selected" : ""}`}
                        key={`${tile.position}-${tile.camera.id}`}
                      >
                        <div className="live-tile-heading">
                          <button
                            onClick={() => setSelected(tile.camera!.id)}
                            aria-pressed={selectedCamera.id === tile.camera.id}
                          >
                            <Camera size={16} />
                            <strong>{tile.camera.name}</strong>
                          </button>
                          <CameraStatus status={tile.camera.status} />
                          {mode === "grid" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Expand ${tile.camera.name}`}
                              onClick={() => {
                                setSelected(tile.camera!.id);
                                setMode("single");
                              }}
                            >
                              <Maximize2 size={16} />
                            </Button>
                          )}
                        </div>
                        <MediaPlayer camera={tile.camera} />
                      </article>
                    ) : (
                      <article
                        className="live-tile live-tile-empty"
                        key={`empty-${tile.position}`}
                        aria-label={
                          tile.missing
                            ? "Camera no longer available"
                            : "Empty position"
                        }
                      >
                        <div className="live-tile-heading">
                          <span className="muted">
                            {tile.missing ? "Removed camera" : "Empty position"}
                          </span>
                        </div>
                        <div className="media-player player-empty">
                          <CameraOff size={22} />
                          <p>
                            {tile.missing
                              ? "This camera was removed from the workspace."
                              : "No camera saved here."}
                          </p>
                        </div>
                      </article>
                    ),
                  )}
                </div>
                {mode === "grid" && pages > 1 && (
                  <div className="live-pager">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft size={15} />
                      Previous
                    </Button>
                    <span>
                      Cameras {currentPage * 4 + 1}–
                      {Math.min(tiles.length, currentPage * 4 + 4)} of{" "}
                      {tiles.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={currentPage >= pages - 1}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                      <ChevronRight size={15} />
                    </Button>
                  </div>
                )}
                <div className="live-selection">
                  <div>
                    <span className="selection-indicator" />
                    <strong>{selectedCamera.name}</strong>
                    <span>Selected camera</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openMuse(
                        `Find recent moments from ${selectedCamera.name}`,
                      )
                    }
                  >
                    <Sparkles size={15} />
                    Find a moment
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      router.push(
                        href(`/recordings?camera_id=${selectedCamera.id}`),
                      )
                    }
                  >
                    Review recordings
                  </Button>
                </div>
                {mode === "single" && available.length > 1 && (
                  <div className="camera-switcher" aria-label="Choose camera">
                    {available.map((camera) => (
                      <button
                        key={camera.id}
                        onClick={() => setSelected(camera.id)}
                        aria-pressed={selectedCamera.id === camera.id}
                      >
                        <Camera size={16} />
                        {camera.name}
                        <CameraStatus status={camera.status} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          }}
        </ResourceState>
      )}
      <p className="quiet-note">
        {preview
          ? "Preview tiles show original space illustrations. Playback controls become available only with actual video."
          : "Live video arrives with a few seconds of delay and stays muted. Use each player’s controls to manage playback."}
      </p>
    </>
  );
}
