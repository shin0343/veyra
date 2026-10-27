"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, Pencil, Plus, Sparkles } from "lucide-react";
import { mutationOptions, request } from "@/lib/client-api";
import { isTestCamera, isTestLayout, plural, testCameraIds } from "@/lib/demo";
import { useRequestKey } from "@/lib/use-request-key";
import type { Camera, Layout, Schema } from "@/lib/types";
import { useWorkspace } from "../workspace-provider";
import { CameraFrame } from "../camera-card";
import { ResourceState } from "../resource-state";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  Badge,
  CameraStatus,
  PageHeading,
  ProblemMessage,
} from "../ui/primitives";

export function LayoutsScreen() {
  const {
    layouts,
    cameras,
    href,
    preview,
    showTestSources,
    setShowTestSources,
  } = useWorkspace();
  const [editor, setEditor] = useState<{ layout?: Layout } | null>(null);
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const testIds = testCameraIds(cameraData);
  const all = layouts.state === "ready" ? layouts.data : [];
  const tests = all.filter((layout) => isTestLayout(layout, testIds));
  return (
    <div className="views">
      <PageHeading
        title="Saved views"
        description={
          layouts.state === "ready" ? (
            <>
              <span>
                {plural(
                  all.length - (showTestSources ? 0 : tests.length),
                  "view",
                )}
              </span>
              {!showTestSources && !!tests.length && (
                <span>
                  {plural(tests.length, "view")} with test sources hidden
                </span>
              )}
            </>
          ) : undefined
        }
      >
        {!!tests.length && (
          <label className="test-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={showTestSources}
              onChange={(event) => setShowTestSources(event.target.checked)}
            />
            Show test views ({tests.length})
          </label>
        )}
        <Button onClick={() => setEditor({})}>
          <Plus size={16} />
          New view
        </Button>
      </PageHeading>
      <ResourceState
        resource={layouts}
        emptyTitle="No saved views yet"
        emptyDescription="A saved view keeps several cameras side by side, one click away."
        emptyAction={
          <Button onClick={() => setEditor({})}>
            <Plus size={16} />
            Create your first view
          </Button>
        }
      >
        {(data) => {
          const shown = showTestSources
            ? data
            : data.filter((layout) => !isTestLayout(layout, testIds));
          return (
            <ul className="views-gallery">
              {shown.map((layout) => (
                <li key={layout.id} className="views-item">
                  <Link
                    href={href(`/layouts/${layout.id}`)}
                    className="views-open"
                  >
                    <ViewMosaic layout={layout} cameras={cameraData} />
                    <span className="views-name">{layout.name}</span>
                  </Link>
                  <p className="views-meta">
                    {layout.cells
                      .map(
                        (cell) =>
                          cameraData.find((c) => c.id === cell.camera_id)
                            ?.name ?? "Removed camera",
                      )
                      .join(" · ")}
                  </p>
                  <p className="views-meta">
                    {plural(layout.columns, "column")} · version{" "}
                    {layout.version}
                    {preview && " · preview arrangement, no video"}
                    <button
                      className="text-button"
                      onClick={() => setEditor({ layout })}
                      aria-label={`Edit ${layout.name}`}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          );
        }}
      </ResourceState>
      {editor && (
        <LayoutEditor
          layout={editor.layout}
          open
          onOpenChange={(open) => !open && setEditor(null)}
        />
      )}
    </div>
  );
}

/** A saved arrangement drawn with each camera's real preview frame, at its saved position. */
export function ViewMosaic({
  layout,
  cameras,
}: {
  layout: Pick<Layout, "columns" | "cells">;
  cameras: Camera[];
}) {
  const last = Math.max(0, ...layout.cells.map((cell) => cell.position));
  const rows = Math.floor(last / layout.columns) + 1;
  return (
    <span
      className="view-mosaic"
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: rows * layout.columns }, (_, position) => {
        const cell = layout.cells.find((item) => item.position === position);
        const camera = cameras.find((item) => item.id === cell?.camera_id);
        return camera ? (
          <CameraFrame key={position} camera={camera} />
        ) : (
          <span key={position} className="view-mosaic-empty" />
        );
      })}
    </span>
  );
}

/**
 * Create a view, or edit one: name, cameras in order and columns. Editing replaces the saved
 * view with `expected_version`, so a concurrent change is rejected instead of overwritten.
 */
export function LayoutEditor({
  layout,
  initialCameraIds,
  open,
  onOpenChange,
}: {
  layout?: Layout;
  /** Cameras to start a new view from, such as the ones on the live wall. */
  initialCameraIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    cameras,
    preview,
    addPreviewLayout,
    reload,
    href,
    openMuse,
    showTestSources,
  } = useWorkspace();
  const [name, setName] = useState(layout?.name ?? "");
  const [selected, setSelected] = useState<string[]>(
    layout
      ? [...layout.cells]
          .sort((a, b) => a.position - b.position)
          .map((cell) => cell.camera_id)
      : (initialCameraIds ?? []).slice(0, 9),
  );
  const [columns, setColumns] = useState<1 | 2 | 3>(layout?.columns ?? 2);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<Layout | null>(null);
  const requestKey = useRequestKey();
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const choices = cameraData.filter(
    (camera) =>
      showTestSources || !isTestCamera(camera) || selected.includes(camera.id),
  );
  const cells = selected.map((camera_id, position) => ({
    camera_id,
    position,
  }));
  const names = selected.map(
    (id) => cameraData.find((camera) => camera.id === id)?.name ?? "Camera",
  );
  async function save() {
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), columns, cells };
    try {
      if (preview) {
        const local: Layout = {
          ...body,
          id: crypto.randomUUID(),
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        addPreviewLayout(local);
        setSaved(local);
      } else if (layout) {
        const replace: Schema["LayoutReplace"] = {
          ...body,
          expected_version: layout.version,
        };
        setSaved(
          await request<Layout>(
            `/layouts/${layout.id}`,
            mutationOptions(replace, requestKey(replace), "PUT"),
          ),
        );
        reload();
      } else {
        setSaved(
          await request<Layout>(
            "/layouts",
            mutationOptions(body, requestKey(body)),
          ),
        );
        reload();
      }
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  const editing = Boolean(layout);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="view-editor"
      title={
        saved
          ? preview
            ? "Preview view created"
            : editing
              ? "View updated"
              : "View saved"
          : reviewing
            ? "Check before saving"
            : editing
              ? `Edit “${layout!.name}”`
              : "New saved view"
      }
      description={
        saved
          ? preview
            ? "Saved in this preview session only. Nothing changed on the server."
            : "The workspace confirmed this arrangement."
          : "Choose cameras in the order they should appear."
      }
    >
      {saved ? (
        <div className="review-receipt" role="status">
          <Check size={18} />
          <div>
            <strong>
              {editing ? "Updated" : "Saved"} “{saved.name}”
            </strong>
            <p>
              {plural(saved.cells.length, "camera")} ·{" "}
              {plural(saved.columns, "column")} · version {saved.version}
            </p>
          </div>
          <Button asChild size="sm">
            <Link
              href={href(`/layouts/${saved.id}`)}
              onClick={() => onOpenChange(false)}
            >
              Open view <ArrowUpRight size={14} />
            </Link>
          </Button>
        </div>
      ) : reviewing ? (
        <>
          <div className="review-plan">
            <span>{editing ? "This will replace" : "This will create"}</span>
            <p>
              “{name.trim()}” with {names.join(", ")} in{" "}
              {plural(columns, "column")}.
              {editing &&
                ` The current version (${layout!.version}) is replaced; if someone changed it since you opened it, nothing is saved.`}
            </p>
            <ViewMosaic layout={{ columns, cells }} cameras={cameraData} />
          </div>
          {!!error && (
            <ProblemMessage
              error={error}
              fallback="This view couldn’t be saved."
            />
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setReviewing(false)}>
              Go back
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy
                ? "Saving…"
                : preview
                  ? "Create preview view"
                  : editing
                    ? "Replace view"
                    : "Save view"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <label className="form-field">
            View name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, Morning walk-through"
              maxLength={100}
            />
          </label>
          <fieldset className="view-picker">
            <legend>
              Cameras{" "}
              <small>{selected.length} of up to 9 · order is position</small>
            </legend>
            {cameras.state !== "ready" ? (
              <p className="muted">
                Cameras appear when the workspace is connected.
              </p>
            ) : !choices.length ? (
              <p className="muted">Connect a camera to create a saved view.</p>
            ) : (
              <ul>
                {choices.map((camera) => {
                  const index = selected.indexOf(camera.id);
                  return (
                    <li key={camera.id}>
                      <button
                        type="button"
                        className={index >= 0 ? "is-chosen" : ""}
                        aria-pressed={index >= 0}
                        disabled={index < 0 && selected.length >= 9}
                        onClick={() =>
                          setSelected((current) =>
                            index >= 0
                              ? current.filter((id) => id !== camera.id)
                              : [...current, camera.id],
                          )
                        }
                      >
                        <CameraFrame camera={camera} />
                        {index >= 0 && (
                          <span
                            className="view-picker-order"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                        )}
                        <strong>{camera.name}</strong>
                        <CameraStatus status={camera.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
          <div className="view-editor-row">
            <div className="segmented-control" aria-label="Columns">
              {([1, 2, 3] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={columns === value}
                  onClick={() => setColumns(value)}
                >
                  {plural(value, "column")}
                </button>
              ))}
            </div>
            {!!selected.length && (
              <ViewMosaic layout={{ columns, cells }} cameras={cameraData} />
            )}
          </div>
          {preview && editing && (
            <p className="muted">Editing needs a connected workspace.</p>
          )}
          <div className="dialog-actions">
            {!preview && !editing && (
              <Button
                variant="ghost"
                disabled={!selected.length}
                onClick={() => {
                  onOpenChange(false);
                  openMuse(
                    `Create a ${columns}-column saved view named "${name.trim() || "New view"}" with ${names.join(", ")}.`,
                  );
                }}
              >
                <Sparkles size={14} />
                Write it for Muse instead
              </Button>
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !name.trim() || !selected.length || (preview && editing)
              }
              onClick={() => setReviewing(true)}
            >
              Review view
            </Button>
          </div>
          {preview && !editing && (
            <Badge tone="blue">
              Preview views disappear when this tab is refreshed
            </Badge>
          )}
        </>
      )}
    </Dialog>
  );
}
