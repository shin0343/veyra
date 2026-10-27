"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  Grid2X2,
  Plus,
  Sparkles,
} from "lucide-react";
import { mutationOptions, request } from "@/lib/client-api";
import { useRequestKey } from "@/lib/use-request-key";
import type { Layout, Schema } from "@/lib/types";
import { useWorkspace } from "../workspace-provider";
import { suggestedPrompts } from "../muse-panel";
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
  const { layouts, cameras, href, preview, openMuse } = useWorkspace();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeading
        title="Saved views"
        description="Save an arrangement that feels right for your day."
      >
        <Button
          variant="secondary"
          onClick={() =>
            openMuse(
              suggestedPrompts(
                cameras.state === "ready" ? cameras.data : [],
              )[1],
            )
          }
        >
          <Sparkles size={16} />
          Plan with Muse
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus size={17} />
          Create a view
        </Button>
      </PageHeading>
      <ResourceState
        resource={layouts}
        emptyTitle="A view that feels like yours"
        emptyDescription="Choose a few cameras and save their arrangement. Your favorite spaces will be one click away."
        emptyAction={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            Create your first view
          </Button>
        }
      >
        {(data) => (
          <div className="layout-card-grid">
            {data.map((layout) => (
              <article key={layout.id} className="layout-card">
                <Link
                  href={href(`/layouts/${layout.id}`)}
                  className="layout-mosaic"
                  aria-label={`Open ${layout.name}`}
                  style={{
                    gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
                  }}
                >
                  {[...layout.cells]
                    .sort((a, b) => a.position - b.position)
                    .map((cell) => (
                      <span
                        key={cell.position}
                        style={{
                          gridColumn: (cell.position % layout.columns) + 1,
                          gridRow:
                            Math.floor(cell.position / layout.columns) + 1,
                        }}
                      >
                        <Camera size={22} strokeWidth={1.4} />
                        <span>
                          {cameras.state === "ready"
                            ? (cameras.data.find(
                                (camera) => camera.id === cell.camera_id,
                              )?.name ?? "Camera")
                            : "Camera"}
                        </span>
                      </span>
                    ))}
                </Link>
                <div className="layout-card-body">
                  <div>
                    <h2>{layout.name}</h2>
                    <p>
                      {layout.cells.length} cameras · {layout.columns} columns
                    </p>
                  </div>
                  <Link
                    href={href(`/layouts/${layout.id}`)}
                    aria-label={`Open ${layout.name}`}
                  >
                    <ArrowUpRight size={21} />
                  </Link>
                </div>
                {preview && (
                  <span className="layout-preview-note">
                    Preview arrangement · no video
                  </span>
                )}
              </article>
            ))}
            <button
              className="create-layout-card"
              onClick={() => setCreating(true)}
            >
              <span>
                <Plus size={24} />
              </span>
              <strong>Create another view</strong>
              <small>Make a little room for your routine.</small>
            </button>
          </div>
        )}
      </ResourceState>
      {creating && <CreateLayout open={creating} onOpenChange={setCreating} />}
    </>
  );
}

function CreateLayout({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { cameras, preview, addPreviewLayout, reload, href } = useWorkspace();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [columns, setColumns] = useState<1 | 2 | 3>(2);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<Layout | null>(null);
  const requestKey = useRequestKey();
  async function create() {
    setBusy(true);
    setError(null);
    const body: Schema["LayoutCreate"] = {
      name: name.trim(),
      columns,
      cells: selected.map((camera_id, position) => ({ camera_id, position })),
    };
    try {
      if (preview) {
        const layout: Layout = {
          ...body,
          id: crypto.randomUUID(),
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        addPreviewLayout(layout);
        setCreated(layout);
      } else {
        const layout = await request<Schema["Layout"]>(
          "/layouts",
          mutationOptions(body, requestKey(body)),
        );
        setCreated(layout);
        reload();
      }
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setReviewing(false);
          setCreated(null);
          setError(null);
        }
      }}
      title={
        created
          ? preview
            ? "Preview view created"
            : "Your view is ready"
          : reviewing
            ? "A quick look before saving"
            : "Create a saved view"
      }
      description={
        created
          ? preview
            ? "Saved in this preview session only. Nothing changed on the server."
            : "Your camera arrangement has been saved to this workspace."
          : "Bring the cameras you care about into one place."
      }
    >
      {created ? (
        <div className="dialog-note">
          <span className="created-check">
            <Check size={24} />
          </span>
          <h3>{created.name}</h3>
          <p>
            {created.cells.length} cameras, arranged in {created.columns}{" "}
            columns.
          </p>
          {preview && (
            <Badge tone="blue">Disappears when this tab is refreshed</Badge>
          )}
          <div className="dialog-actions">
            <Button asChild>
              <Link
                href={href(`/layouts/${created.id}`)}
                onClick={() => onOpenChange(false)}
              >
                Open saved view
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      ) : reviewing ? (
        <>
          <div className="layout-review">
            <Grid2X2 size={28} />
            <h3>{name}</h3>
            <p>
              {selected.length} cameras ·{" "}
              {["One column", "Two columns", "Three columns"][columns - 1]}
            </p>
            {cameras.state === "ready" &&
              selected.map((id) => (
                <span key={id}>
                  <Camera size={15} />
                  {cameras.data.find((camera) => camera.id === id)?.name}
                </span>
              ))}
          </div>
          {preview && (
            <p className="muted">
              This creates a local preview arrangement, not a saved server
              resource.
            </p>
          )}
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
            <Button onClick={() => void create()} disabled={busy}>
              {busy ? "Saving…" : preview ? "Create preview view" : "Save view"}
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
              placeholder="For example, Everyday spaces"
              maxLength={100}
            />
          </label>
          <fieldset className="camera-picker">
            <legend>
              Choose up to nine cameras, in the order they should appear
            </legend>
            {cameras.state === "ready" &&
              cameras.data.map((camera) => (
                <label key={camera.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(camera.id)}
                    disabled={
                      !selected.includes(camera.id) && selected.length >= 9
                    }
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, camera.id]
                          : current.filter((id) => id !== camera.id),
                      )
                    }
                  />
                  <span>
                    <strong>{camera.name}</strong>
                    <CameraStatus status={camera.status} />
                  </span>
                </label>
              ))}
            {cameras.state !== "ready" && (
              <p className="muted">
                Camera choices will appear when the workspace is connected.
              </p>
            )}
            {cameras.state === "ready" && !cameras.data.length && (
              <p className="muted">
                Connect at least one camera to create a saved view.
              </p>
            )}
          </fieldset>
          <label className="form-field">
            Arrangement
            <select
              value={columns}
              onChange={(event) =>
                setColumns(Number(event.target.value) as 1 | 2 | 3)
              }
            >
              <option value={2}>Two columns (2 × 2 for four cameras)</option>
              <option value={1}>One column</option>
              <option value={3}>Three columns</option>
            </select>
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !selected.length}
              onClick={() => setReviewing(true)}
            >
              Review view
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
