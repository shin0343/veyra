"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Keyboard,
  Leaf,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { isTestCamera } from "@/lib/demo";
import { useWorkspace } from "../workspace-provider";
import { Badge, CameraStatus, PageHeading } from "../ui/primitives";
import { isAbort, request } from "@/lib/client-api";
import type { PreviewState, Schema } from "@/lib/types";
import { ProblemMessage } from "../ui/primitives";

/** Today's model usage ledger. Meta's invoice amount is not known here. */
function UsageSummary() {
  const [usage, setUsage] = useState<Schema["Usage"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const controller = new AbortController();
    request<Schema["Usage"]>("/analysis-usage", { signal: controller.signal })
      .then(setUsage)
      .catch((value) => {
        if (!controller.signal.aborted && !isAbort(value)) setError(value);
      });
    return () => controller.abort();
  }, []);
  if (error)
    return <ProblemMessage error={error} fallback="Usage couldn’t be read." />;
  return (
    <div className="settings-usage" aria-label="Usage today">
      <h3>Usage today (UTC)</h3>
      <div className="setting-readonly">
        <span>Muse, analysis and search requests</span>
        <strong>{usage ? usage.requests : "…"}</strong>
      </div>
      <div className="setting-readonly">
        <span>Video uploaded for analysis</span>
        <strong>
          {usage ? `${(usage.bytes_uploaded / 1048576).toFixed(1)} MB` : "…"}
        </strong>
      </div>
      <div className="setting-readonly">
        <span>Budget reserved</span>
        <strong>
          {usage
            ? `$${usage.reserved_usd.toFixed(2)}${usage.estimated_usd != null ? ` · est. $${usage.estimated_usd.toFixed(2)}` : ""}`
            : "…"}
        </strong>
      </div>
      <p className="muted">
        Reservations are admission limits set by your operator, not Meta’s bill.
        Actual billing is unknown here. This database’s reservations do not
        guarantee an account-wide spending cap.
      </p>
      {usage?.daily_limit_usd != null && (
        <>
          <div className="setting-readonly">
            <span>Configured daily admission limit</span>
            <strong>${usage.daily_limit_usd.toFixed(2)}</strong>
          </div>
          <div className="setting-readonly">
            <span>Admission capacity remaining</span>
            <strong>
              {usage.admission_remaining_usd != null
                ? `$${usage.admission_remaining_usd.toFixed(2)}`
                : "Unknown"}
            </strong>
          </div>
          <div className="setting-readonly">
            <span>Model requests available under reservation rules</span>
            <strong>{usage.remaining_requests ?? "Unknown"}</strong>
          </div>
          <p className="muted">
            {usage.admission_enabled
              ? "Admission enabled"
              : "Paid model requests disabled"}
            {usage.observed_at
              ? ` · Checked ${new Date(usage.observed_at).toLocaleTimeString()}`
              : ""}
            {" · Billing update unavailable"}
          </p>
        </>
      )}
    </div>
  );
}

export function SettingsScreen() {
  const {
    preview,
    previewState,
    setPreviewState,
    href,
    cameras,
    recordings,
    showTestSources,
    setShowTestSources,
  } = useWorkspace();
  const [motion, setMotion] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.motion === "reduced",
  );
  const [compact, setCompact] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.density === "compact",
  );
  const cameraData = cameras.state === "ready" ? cameras.data : [];
  const sections = [
    { id: "display", label: "Display", icon: Monitor },
    { id: "privacy", label: "Privacy and analysis", icon: ShieldCheck },
    { id: "recording", label: "Recording", icon: Camera },
    { id: "keyboard", label: "Keyboard", icon: Keyboard },
    ...(preview
      ? [{ id: "preview", label: "Preview states", icon: Leaf }]
      : []),
  ];
  return (
    <div className="prefs">
      <PageHeading title="Settings" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`}>
              <Icon size={15} />
              {label}
            </a>
          ))}
        </nav>
        <div className="settings-sections">
          <section className="settings-section" id="display">
            <h2>Display</h2>
            <p>Stored in this browser only.</p>
            <div className="setting-control">
              <span>
                <strong>Reduce interface motion</strong>
                <small>
                  Turns off transitions. Your system setting is also respected.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Reduce interface motion"
                checked={motion}
                onChange={(event) => {
                  setMotion(event.target.checked);
                  document.documentElement.dataset.motion = event.target.checked
                    ? "reduced"
                    : "default";
                }}
              />
            </div>
            <div className="setting-control">
              <span>
                <strong>Compact spacing</strong>
                <small>
                  Less space between items; text stays the same size.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Compact spacing"
                checked={compact}
                onChange={(event) => {
                  setCompact(event.target.checked);
                  document.documentElement.dataset.density = event.target
                    .checked
                    ? "compact"
                    : "comfortable";
                }}
              />
            </div>
            <div className="setting-control">
              <span>
                <strong>Show development test sources</strong>
                <small>
                  Synthetic test-pattern cameras, their recordings and views
                  that include them. Hidden by default; never deleted.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Show development test sources"
                checked={showTestSources}
                onChange={(event) => setShowTestSources(event.target.checked)}
              />
            </div>
          </section>
          <section className="settings-section" id="privacy">
            <h2>Privacy and analysis</h2>
            <p>
              Watching and recording stay on your workspace. Cloud analysis
              sends short clips to Meta only when you ask to make a recording
              searchable, and only for cameras that allow it.
            </p>
            <ul className="settings-facts">
              <li>No face recognition or identity matching</li>
              <li>No age, gender or other demographic inference</li>
              <li>Cloud analysis is off for new cameras</li>
            </ul>
            {cameras.state === "ready" ? (
              <table className="settings-table">
                <caption className="sr-only">Cloud analysis per camera</caption>
                <thead>
                  <tr>
                    <th scope="col">Camera</th>
                    <th scope="col">Status</th>
                    <th scope="col">Cloud analysis</th>
                    <th scope="col">
                      <span className="sr-only">Change</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cameraData
                    .filter(
                      (camera) => showTestSources || !isTestCamera(camera),
                    )
                    .map((camera) => (
                      <tr key={camera.id}>
                        <th scope="row">{camera.name}</th>
                        <td>
                          <CameraStatus status={camera.status} />
                        </td>
                        <td>
                          {camera.cloud_analysis_allowed ? "Allowed" : "Off"}
                        </td>
                        <td>
                          <Link
                            className="text-button"
                            href={href(`/cameras?camera=${camera.id}`)}
                            aria-label={`Change ${camera.name}`}
                          >
                            Change
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">
                {cameras.state === "loading"
                  ? "Checking cameras…"
                  : "Camera settings couldn’t be read."}
              </p>
            )}
            {!preview && <UsageSummary />}
          </section>
          <section className="settings-section" id="recording">
            <h2>Recording</h2>
            <p>
              Retention is set by your Veyra service and isn’t editable here.
            </p>
            <div className="setting-readonly">
              <span>Recordings available</span>
              {preview ? (
                <Badge>Sample configuration</Badge>
              ) : (
                <strong>
                  {recordings.state === "ready"
                    ? `${recordings.data.length} · ${recordings.data.filter((item) => item.status === "recording").length} recording now`
                    : recordings.state === "loading"
                      ? "Checking…"
                      : "Couldn’t be checked"}
                </strong>
              )}
            </div>
            <div className="setting-readonly">
              <span>Connect or pause cameras</span>
              <Link className="text-button" href={href("/cameras")}>
                Open cameras
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </section>
          <section className="settings-section" id="keyboard">
            <h2>Keyboard</h2>
            <div className="shortcut-row">
              <span>Go to, find or ask</span>
              <span>
                <kbd>⌘ / Ctrl</kbd> <kbd>K</kbd>
              </span>
            </div>
            <div className="shortcut-row">
              <span>Focus the Explore ask field</span>
              <kbd>/</kbd>
            </div>
            <div className="shortcut-row">
              <span>Move between moments or timeline ticks</span>
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>
              </span>
            </div>
            <div className="shortcut-row">
              <span>Close a dialog, Muse, or a focused period</span>
              <kbd>Esc</kbd>
            </div>
          </section>
          {preview && (
            <section className="settings-section" id="preview">
              <h2>Preview states</h2>
              <p>
                These change authored sample states only. No camera, indexing
                job or model behavior is simulated as real.
              </p>
              <label className="form-field">
                Workspace state
                <select
                  value={previewState}
                  onChange={(event) =>
                    setPreviewState(event.target.value as PreviewState)
                  }
                >
                  <option value="ready">Sample data</option>
                  <option value="loading">Loading</option>
                  <option value="empty">Empty workspace</option>
                  <option value="error">Connection error</option>
                  <option value="indexing">Indexing in progress</option>
                </select>
              </label>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
