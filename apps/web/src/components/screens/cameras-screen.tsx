"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  CloudOff,
  Grid2X2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { ApiError, mutationOptions, request } from "@/lib/client-api";
import { useRequestKey } from "@/lib/use-request-key";
import type { Camera as CameraType, Schema } from "@/lib/types";
import { useWorkspace } from "../workspace-provider";
import { CameraCard } from "../camera-card";
import { ResourceState } from "../resource-state";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  Badge,
  CameraStatus,
  PageHeading,
  ProblemMessage,
} from "../ui/primitives";

const NO_GROUP = "__none__";

export function CamerasScreen() {
  const { cameras, preview, openMuse } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<CameraType | null>(null);
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const groups = [
    ...new Set(cameraData.flatMap((camera) => camera.group_name ?? [])),
  ].sort();
  const ungrouped = cameraData.some((camera) => !camera.group_name);
  // Follow polled status while the dialog is open; keep the snapshot after a removal.
  const editing = opened
    ? (cameraData.find((camera) => camera.id === opened.id) ?? opened)
    : null;
  return (
    <>
      <PageHeading
        title="Cameras"
        description="A little connection to the places that matter."
      >
        <Button
          variant="secondary"
          onClick={() => openMuse("How do I connect a camera?")}
        >
          Connection help
        </Button>
        <Button onClick={() => setAdding(true)}>
          <Plus size={17} />
          Connect a camera
        </Button>
      </PageHeading>
      <div className="filter-toolbar">
        <div className="segmented-control" aria-label="Filter cameras by group">
          {[
            { value: "all", label: "All spaces" },
            ...groups.map((group) => ({ value: group, label: group })),
            ...(ungrouped && groups.length
              ? [{ value: NO_GROUP, label: "No group" }]
              : []),
          ].map((item) => (
            <button
              key={item.value}
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="compact-search">
          <Search size={17} />
          <input
            aria-label="Find a camera"
            placeholder="Find a camera"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <ResourceState
        resource={cameras}
        emptyTitle="Your first connection starts here"
        emptyDescription="Choose a camera source approved for this workspace. Camera addresses and credentials stay on the server."
        emptyAction={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} />
            Connect a camera
          </Button>
        }
      >
        {(data) => {
          const needle = query.trim().toLowerCase();
          const filtered = data.filter(
            (camera) =>
              (filter === "all" ||
                (filter === NO_GROUP
                  ? !camera.group_name
                  : camera.group_name === filter)) &&
              [camera.name, camera.location, camera.group_name].some((value) =>
                value?.toLowerCase().includes(needle),
              ),
          );
          const offline = data.filter(
            (camera) => !["online", "disabled"].includes(camera.status),
          ).length;
          return (
            <>
              <div className="collection-summary">
                <span>
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "camera" : "cameras"}
                  {!!offline && (
                    <span className="summary-offline">
                      {offline} not connected
                    </span>
                  )}
                </span>
                <span>
                  <Grid2X2 size={14} />
                  Status refreshes every few seconds
                </span>
              </div>
              <div className="camera-grid">
                {filtered.map((camera) => (
                  <CameraCard
                    camera={camera}
                    key={camera.id}
                    onSettings={() => setOpened(camera)}
                  />
                ))}
              </div>
              {!filtered.length && (
                <div className="filter-empty">
                  <Camera size={22} />
                  <h3>No cameras match</h3>
                  <p>Try another space or camera name.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </>
          );
        }}
      </ResourceState>
      <div className="quiet-note">
        <ShieldCheck size={18} />
        <span>
          Video analysis is a choice. Cloud analysis stays off until you allow
          it for a camera.
        </span>
      </div>
      {adding && (
        <ConnectCamera
          open={adding}
          onOpenChange={setAdding}
          existing={cameraData}
          preview={preview}
        />
      )}
      {editing && (
        <CameraSettings camera={editing} onClose={() => setOpened(null)} />
      )}
    </>
  );
}

function ConnectCamera({
  open,
  onOpenChange,
  existing,
  preview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: CameraType[];
  preview: boolean;
}) {
  const { reload, href } = useWorkspace();
  const [sources, setSources] = useState<Schema["CameraSource"][] | null>(null);
  const [sourceError, setSourceError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [group, setGroup] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CameraType | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = useRequestKey();
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    request<Schema["CameraSourceList"]>("/camera-sources", {
      signal: controller.signal,
    })
      .then((data) => {
        setSources(data.items);
        setSourceError(null);
      })
      .catch((value) => {
        if (!controller.signal.aborted) setSourceError(value);
      });
    return () => controller.abort();
  }, [preview, attempt]);
  const used = new Set(existing.map((camera) => camera.source_id));
  const available = sources?.filter((item) => !used.has(item.id)) ?? [];
  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      source_id: source,
      cloud_analysis_allowed: false,
      ...(group.trim() ? { group_name: group.trim() } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
    };
    try {
      setCreated(
        await request<CameraType>(
          "/cameras",
          mutationOptions(body, requestKey(body)),
        ),
      );
      reload();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={created ? "Camera registered" : "Connect a camera"}
      description={
        created
          ? "Registration is saved. Its connection is checked separately."
          : "Choose an approved source. Your connection details stay private."
      }
    >
      {preview ? (
        <div className="dialog-note">
          <Badge tone="blue">Preview workspace</Badge>
          <p>
            Sample cameras are already available to explore. Connecting a real
            camera requires your workspace service.
          </p>
        </div>
      ) : created ? (
        <div className="dialog-note">
          <span className="created-check">
            <Check size={24} />
          </span>
          <h3>{created.name}</h3>
          <p>
            Veyra is now checking whether video is arriving. Status updates on
            its own; a registered camera isn’t assumed to be live.
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <Button asChild>
              <Link
                href={href(`/live?camera_id=${created.id}`)}
                onClick={() => onOpenChange(false)}
              >
                Open live view
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label className="form-field">
            Camera name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, Garden entrance"
              maxLength={100}
            />
          </label>
          <label className="form-field">
            Approved source
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              disabled={!sources}
              aria-describedby="source-help"
            >
              <option value="">
                {sources ? "Choose a source" : "Checking approved sources…"}
              </option>
              {available.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label ?? item.id} ·{" "}
                  {item.source_media?.kind === "prerecorded"
                    ? "prerecorded footage"
                    : item.mode === "publisher"
                      ? "published stream"
                      : "camera pull"}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" id="source-help">
            {sources && !available.length
              ? sources.length
                ? "Every approved source is already connected. Ask your workspace operator to provision another."
                : "No approved sources are available yet. Ask your workspace operator to provision one."
              : "Only sources provisioned on the server can be chosen."}
          </p>
          {!!sourceError && (
            <>
              <ProblemMessage
                error={sourceError}
                fallback="Approved sources couldn’t be loaded."
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </Button>
            </>
          )}
          <div className="form-pair">
            <label className="form-field">
              Group <small>optional</small>
              <input
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                placeholder="For example, Outdoors"
                maxLength={100}
                list="camera-groups"
              />
              <datalist id="camera-groups">
                {[
                  ...new Set(
                    existing.flatMap((camera) => camera.group_name ?? []),
                  ),
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="form-field">
              Location <small>optional</small>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="For example, Back gate"
                maxLength={100}
              />
            </label>
          </div>
          <p className="privacy-inline">
            <CloudOff size={17} />
            Cloud video analysis will be off.
          </p>
          {!!error && (
            <ProblemMessage
              error={error}
              fallback="This camera couldn’t be connected."
            />
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              disabled={busy || !name.trim() || !source}
            >
              {busy ? "Connecting…" : "Connect camera"}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

type Step = "edit" | "privacy" | "delete" | "saved" | "deleted";

function CameraSettings({
  camera,
  onClose,
}: {
  camera: CameraType;
  onClose: () => void;
}) {
  const { preview, reload, layouts } = useWorkspace();
  const [name, setName] = useState(camera.name);
  const [group, setGroup] = useState(camera.group_name ?? "");
  const [location, setLocation] = useState(camera.location ?? "");
  const [enabled, setEnabled] = useState(camera.enabled);
  const [consent, setConsent] = useState(camera.cloud_analysis_allowed);
  const [step, setStep] = useState<Step>("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestKey = useRequestKey();
  const deleteKey = useRequestKey();
  const changes: Schema["CameraUpdate"] = {};
  if (name.trim() && name.trim() !== camera.name) changes.name = name.trim();
  if (group.trim() !== (camera.group_name ?? ""))
    changes.group_name = group.trim() || null;
  if (location.trim() !== (camera.location ?? ""))
    changes.location = location.trim() || null;
  if (enabled !== camera.enabled) changes.enabled = enabled;
  if (consent !== camera.cloud_analysis_allowed)
    changes.cloud_analysis_allowed = consent;
  const changed = Object.keys(changes).length > 0;
  const usedBy =
    layouts.state === "ready"
      ? layouts.data.filter((layout) =>
          layout.cells.some((cell) => cell.camera_id === camera.id),
        )
      : [];
  async function save() {
    if (preview) {
      setStep("saved");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await request<CameraType>(
        `/cameras/${camera.id}`,
        mutationOptions(changes, requestKey(changes), "PATCH"),
      );
      reload();
      setStep("saved");
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await request<void>(`/cameras/${camera.id}`, {
        method: "DELETE",
        headers: { "Idempotency-Key": deleteKey({ delete: camera.id }) },
      });
      setStep("deleted");
      reload();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  const title = {
    edit: camera.name,
    privacy: "Review video privacy",
    delete: `Remove ${camera.name}?`,
    saved: "Changes saved",
    deleted: "Camera removed",
  }[step];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={
        step === "delete"
          ? "Past recordings stay available. Live viewing stops."
          : "Choose how this camera is named and used."
      }
    >
      {step === "saved" || step === "deleted" ? (
        <div className="dialog-note">
          <span className="created-check">
            <Check size={24} />
          </span>
          <p>
            {preview
              ? "This was an interaction preview. No device setting or server data changed."
              : step === "deleted"
                ? "The registration was removed. Its recordings remain in your library."
                : "The workspace confirmed these changes."}
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : step === "delete" ? (
        <div
          className="confirmation-card"
          role="alertdialog"
          aria-label="Confirm removal"
        >
          <Badge tone="amber">Please review</Badge>
          <p>
            Removing <strong>{camera.name}</strong> stops live viewing and frees
            its source. Recordings it already made are kept.
          </p>
          {!!usedBy.length && (
            <p>
              It’s used by{" "}
              {usedBy.map((layout) => `“${layout.name}”`).join(", ")}. Remove it
              from {usedBy.length === 1 ? "that view" : "those views"} first.
            </p>
          )}
          {!!error && (
            <ProblemMessage
              error={error}
              fallback="The camera couldn’t be removed."
            />
          )}
          {error instanceof ApiError && error.code === "CAMERA_IN_USE" && (
            <p className="muted">Nothing was removed.</p>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setStep("edit")}>
              Keep camera
            </Button>
            <Button
              variant="danger"
              onClick={() => void remove()}
              disabled={busy || preview}
            >
              {busy ? "Removing…" : "Remove camera"}
            </Button>
          </div>
        </div>
      ) : step === "privacy" ? (
        <div className="confirmation-card">
          <Badge tone="amber">Please review</Badge>
          <h3>
            {consent
              ? "Allow cloud video analysis?"
              : "Turn cloud video analysis off?"}
          </h3>
          <p>
            {consent
              ? `Short clips from ${camera.name} may be sent to Meta for analysis, but only when you ask to make a recording searchable. Nothing is uploaded by this change alone.`
              : `New analysis uploads for ${camera.name} will stop and waiting work is cancelled. Previously indexed data isn’t deleted.`}
          </p>
          {!!error && (
            <ProblemMessage
              error={error}
              fallback="The change couldn’t be saved."
            />
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setStep("edit")}>
              Go back
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy
                ? "Saving…"
                : preview
                  ? "Finish preview"
                  : "Confirm changes"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="camera-settings-status">
            <CameraStatus status={camera.status} />
            <span className="muted">Source {camera.source_id}</span>
          </div>
          {camera.connection_error && camera.status !== "online" && (
            <p className="camera-error">
              {camera.connection_error.message}
              <small className="error-reference">
                {camera.connection_error.code}
              </small>
            </p>
          )}
          <label className="form-field">
            Camera name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
          </label>
          <div className="form-pair">
            <label className="form-field">
              Group <small>optional</small>
              <input
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                maxLength={100}
              />
            </label>
            <label className="form-field">
              Location <small>optional</small>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={100}
              />
            </label>
          </div>
          <div className="setting-control">
            <span>
              <strong>Camera active</strong>
              <small>Pausing stops live viewing and new recording.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Camera active"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </div>
          <div className="setting-control">
            <span>
              <strong>Cloud video analysis</strong>
              <small>
                Allow selected clips to be analyzed when you request indexing.
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Allow cloud video analysis"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
          </div>
          {!!error && (
            <ProblemMessage
              error={error}
              fallback="The change couldn’t be saved."
            />
          )}
          <div className="dialog-actions dialog-actions-split">
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setStep("delete");
              }}
            >
              <Trash2 size={15} />
              Remove
            </Button>
            <span className="button-row">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button
                disabled={!changed || busy}
                onClick={() =>
                  "cloud_analysis_allowed" in changes
                    ? setStep("privacy")
                    : void save()
                }
              >
                {busy
                  ? "Saving…"
                  : "cloud_analysis_allowed" in changes
                    ? "Review changes"
                    : "Save changes"}
              </Button>
            </span>
          </div>
        </>
      )}
    </Dialog>
  );
}
