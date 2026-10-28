"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  CloudOff,
  Film,
  Plus,
  ScanSearch,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { ApiError, mutationOptions, request } from "@/lib/client-api";
import { isTestCamera, plural } from "@/lib/demo";
import { useCoverage } from "@/lib/use-coverage";
import { useRequestKey } from "@/lib/use-request-key";
import type { Camera as CameraType, Schema } from "@/lib/types";
import { useWorkspace } from "../workspace-provider";
import { CameraFrame } from "../camera-card";
import { MediaPlayer } from "../media-player";
import { SourceMediaCredit } from "../source-media";
import { ResourceState } from "../resource-state";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  Badge,
  CameraStatus,
  PageHeading,
  ProblemMessage,
} from "../ui/primitives";

export function CamerasScreen() {
  const { cameras, preview, href, showTestSources, setShowTestSources } =
    useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<CameraType | null>(null);
  const coverage = useCoverage(!preview);
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const tests = cameraData.filter(isTestCamera);
  const library = showTestSources
    ? cameraData
    : cameraData.filter((camera) => !isTestCamera(camera));
  const groups = [
    ...new Set(library.flatMap((camera) => camera.group_name ?? [])),
  ].sort();
  const selectedId = params.get("camera");
  const selected = cameraData.find((camera) => camera.id === selectedId);
  const select = (id: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (id) next.set("camera", id);
    else next.delete("camera");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  };
  // Follow polled status while the dialog is open; keep the snapshot after a removal.
  const editing = opened
    ? (cameraData.find((camera) => camera.id === opened.id) ?? opened)
    : null;
  const sending = cameraData.filter((c) => c.status === "online").length;
  const unreachable = cameraData.filter(
    (c) => c.status === "offline" || c.status === "error",
  ).length;
  const moments = (id: string) =>
    coverage.state === "ready"
      ? (coverage.data.items.find((item) => item.camera_id === id)
          ?.observations ?? 0)
      : 0;
  return (
    <div className="cam">
      <PageHeading
        title="Cameras"
        description={
          cameras.state === "ready" ? (
            <>
              <span>{plural(cameraData.length, "camera")}</span>
              <span>{sending} sending video</span>
              {!!unreachable && (
                <span className="facts-alert">{unreachable} not reachable</span>
              )}
              {!showTestSources && !!tests.length && (
                <span>{plural(tests.length, "test source")} hidden</span>
              )}
            </>
          ) : undefined
        }
      >
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} />
          Connect a camera
        </Button>
      </PageHeading>
      <div className="cam-toolbar">
        <div className="segmented-control" aria-label="Filter cameras by group">
          {[
            { value: "all", label: "All" },
            ...groups.map((group) => ({ value: group, label: group })),
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
          <Search size={15} />
          <input
            aria-label="Find a camera"
            placeholder="Find a camera"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!!tests.length && (
          <label className="test-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={showTestSources}
              onChange={(event) => setShowTestSources(event.target.checked)}
            />
            Show test sources ({tests.length})
          </label>
        )}
      </div>
      <div className={`cam-body ${selected ? "has-selection" : ""}`}>
        <ResourceState
          resource={cameras}
          emptyTitle="No cameras yet"
          emptyDescription="Choose a camera source approved for this workspace. Camera addresses and credentials stay on the server."
          emptyAction={
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} />
              Connect a camera
            </Button>
          }
        >
          {() => {
            const needle = query.trim().toLowerCase();
            const filtered = library.filter(
              (camera) =>
                (filter === "all" || camera.group_name === filter) &&
                [camera.name, camera.location, camera.group_name].some(
                  (value) => value?.toLowerCase().includes(needle),
                ),
            );
            const sections = [
              ...groups.map((group) => ({
                group,
                items: filtered.filter((c) => c.group_name === group),
              })),
              {
                group: "Not grouped",
                items: filtered.filter((c) => !c.group_name),
              },
            ].filter((section) => section.items.length);
            return (
              <div className="cam-library">
                {sections.map(({ group, items }) => (
                  <section key={group} aria-label={group}>
                    <h2 className="cam-group">
                      {group}
                      <span>{items.length}</span>
                    </h2>
                    <ul className="cam-sheet">
                      {items.map((camera) => (
                        <li key={camera.id}>
                          <button
                            className={`cam-item ${camera.id === selected?.id ? "is-selected" : ""}`}
                            aria-pressed={camera.id === selected?.id}
                            onClick={() =>
                              select(
                                camera.id === selected?.id ? null : camera.id,
                              )
                            }
                          >
                            <CameraFrame camera={camera} />
                            <span className="cam-item-name">
                              <strong>{camera.name}</strong>
                              {!!moments(camera.id) && (
                                <span className="tc">
                                  {moments(camera.id)}
                                  <span className="sr-only"> moments</span>
                                </span>
                              )}
                            </span>
                            <span className="cam-item-meta">
                              <CameraStatus status={camera.status} />
                              {camera.location && (
                                <span>{camera.location.split(" · ")[0]}</span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {!filtered.length && (
                  <div className="filter-empty">
                    <Camera size={22} />
                    <h3>No cameras match</h3>
                    <p>Try another group or camera name.</p>
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
              </div>
            );
          }}
        </ResourceState>
        {selected && (
          <CameraPanel
            key={selected.id}
            camera={selected}
            moments={moments(selected.id)}
            onClose={() => select(null)}
            onSettings={() => setOpened(selected)}
          />
        )}
      </div>
      <p className="quiet-note">
        <ShieldCheck size={16} />
        Cloud analysis stays off for a camera until you allow it. Watching and
        recording never send video to Meta.{" "}
        <Link href={href("/settings#privacy")}>Privacy settings</Link>
      </p>
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
    </div>
  );
}

/** The opened camera: its live picture, plain facts and every place it leads. */
function CameraPanel({
  camera,
  moments,
  onClose,
  onSettings,
}: {
  camera: CameraType;
  moments: number;
  onClose: () => void;
  onSettings: () => void;
}) {
  const { href, preview, recordings, layouts, openMuse } = useWorkspace();
  const own =
    recordings.state === "ready"
      ? recordings.data.filter((r) => r.camera_id === camera.id)
      : [];
  const views =
    layouts.state === "ready"
      ? layouts.data.filter((l) =>
          l.cells.some((cell) => cell.camera_id === camera.id),
        )
      : [];
  const latest = [...own].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
  )[0];
  return (
    <aside className="cam-panel" aria-label={`${camera.name} details`}>
      <div className="cam-panel-stage">
        {camera.status === "online" || preview ? (
          <MediaPlayer camera={camera} />
        ) : (
          <CameraFrame camera={camera} />
        )}
      </div>
      <div className="cam-panel-body">
        <div className="cam-panel-head">
          <h2>{camera.name}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close camera details"
          >
            <X size={16} />
          </button>
        </div>
        <p className="cam-panel-status">
          <CameraStatus status={camera.status} />
          {camera.last_observed_at && (
            <span>
              checked{" "}
              {new Date(camera.last_observed_at).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </p>
        {camera.connection_error && camera.status !== "online" && (
          <p className="camera-error" role="note">
            {camera.connection_error.message}
            <small className="error-reference">
              {camera.connection_error.code}
            </small>
          </p>
        )}
        <div className="cam-panel-actions">
          {camera.enabled && (
            <Button asChild size="sm">
              <Link href={href(`/live?camera_id=${camera.id}`)}>
                <Video size={14} />
                Live view
              </Link>
            </Button>
          )}
          {latest && (
            <Button asChild size="sm" variant="secondary">
              <Link href={href(`/recordings/${latest.id}`)}>
                <Film size={14} />
                Latest recording
              </Link>
            </Button>
          )}
          {!!moments && (
            <Button asChild size="sm" variant="secondary">
              <Link href={href(`/explore?camera=${camera.id}`)}>
                <ScanSearch size={14} />
                {plural(moments, "moment")}
              </Link>
            </Button>
          )}
        </div>
        <dl className="facts-list">
          <dt>Group</dt>
          <dd>{camera.group_name ?? "Not grouped"}</dd>
          <dt>Location</dt>
          <dd>{camera.location ?? "Not set"}</dd>
          <dt>Recordings</dt>
          <dd>{own.length}</dd>
          <dt>Encoded video size</dt>
          <dd>
            {camera.video_width && camera.video_height
              ? `${camera.video_width} × ${camera.video_height}`
              : "Not available"}
          </dd>
          <dt>In views</dt>
          <dd>
            {views.length
              ? views.map((view, index) => (
                  <span key={view.id}>
                    {index ? ", " : ""}
                    <Link href={href(`/layouts/${view.id}`)}>{view.name}</Link>
                  </span>
                ))
              : "None"}
          </dd>
          <dt>Analysis</dt>
          <dd>
            {camera.cloud_analysis_allowed
              ? "Allowed when you ask to make a recording searchable"
              : "Off"}
          </dd>
        </dl>
        {camera.source_media && !preview && (
          <SourceMediaCredit media={camera.source_media} />
        )}
        <div className="cam-panel-foot">
          <Button variant="secondary" size="sm" onClick={onSettings}>
            <Settings2 size={14} />
            Camera settings
          </Button>
          {!!moments && !preview && (
            <button
              className="text-button"
              onClick={() => openMuse(`Find recent moments on ${camera.name}`)}
            >
              <Sparkles size={13} />
              Write a question for Muse
            </button>
          )}
        </div>
      </div>
    </aside>
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
            <span className="muted">
              {camera.source_media?.title ??
                (isTestCamera(camera)
                  ? "Development test source"
                  : "Approved source")}
            </span>
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
