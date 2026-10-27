"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  CloudOff,
  Keyboard,
  Leaf,
  Monitor,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "../workspace-provider";
import { Button } from "../ui/button";
import { Badge, PageHeading } from "../ui/primitives";
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
    <>
      <div className="setting-readonly">
        <span>Muse, analysis & search requests today (UTC)</span>
        <strong>{usage ? usage.requests : "…"}</strong>
      </div>
      <div className="setting-readonly">
        <span>Video uploaded for analysis today</span>
        <strong>
          {usage ? `${(usage.bytes_uploaded / 1048576).toFixed(1)} MB` : "…"}
        </strong>
      </div>
      <div className="setting-readonly">
        <span>Budget reserved today</span>
        <strong>
          {usage
            ? `$${usage.reserved_usd.toFixed(2)}${usage.estimated_usd != null ? ` · est. $${usage.estimated_usd.toFixed(2)}` : ""}`
            : "…"}
        </strong>
      </div>
      <p className="muted">
        Reservations are admission limits set by your operator, not Meta’s bill.
        Actual billing is unknown here.
      </p>
    </>
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
    openMuse,
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
  return (
    <>
      <PageHeading
        title="Settings"
        description="A few thoughtful preferences. Always in your control."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#appearance">
            <Monitor size={17} />
            Your experience
          </a>
          <a href="#recording">
            <Camera size={17} />
            Recording
          </a>
          <a href="#privacy">
            <ShieldCheck size={17} />
            Privacy & video
          </a>
          <a href="#keyboard">
            <Keyboard size={17} />
            Keyboard shortcuts
          </a>
          {preview && (
            <a href="#preview">
              <Leaf size={17} />
              Preview controls
            </a>
          )}
        </nav>
        <div className="settings-sections">
          <section className="settings-section" id="appearance">
            <h2>Your experience</h2>
            <p>Comfortable by design. These preferences apply to this tab.</p>
            <div className="setting-control">
              <span>
                <strong>Reduce interface motion</strong>
                <small>
                  Keep transitions still and subtle. Your system setting is also
                  respected.
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
                <strong>Compact workspace</strong>
                <small>
                  A little less space between items, with the same readable
                  text.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Compact workspace"
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
          </section>
          <section className="settings-section" id="recording">
            <h2>Recording</h2>
            <p>
              Recording availability and retention are managed by your workspace
              service.
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
              <span>How long video is kept</span>
              <span>Set by your Veyra service; not editable here</span>
            </div>
            <div className="settings-callout">
              <Camera size={21} />
              <div>
                <strong>Start with a camera</strong>
                <p>
                  Review each camera’s connection and video privacy settings.
                </p>
                <Button asChild variant="secondary" size="sm">
                  <Link href={href("/cameras")}>
                    Open cameras
                    <ArrowUpRight size={14} />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
          <section className="settings-section" id="privacy">
            <h2>Your video, your choice</h2>
            <p>
              Cloud analysis is separate from watching or recording video. Allow
              it for each camera before requesting indexing.
            </p>
            <div className="privacy-principles">
              <span>
                <ShieldCheck size={18} />
                No face recognition
              </span>
              <span>
                <Check size={18} />
                No demographic profiling
              </span>
              <span>
                <CloudOff size={18} />
                Cloud analysis off by default
              </span>
            </div>
            <div className="setting-readonly">
              <span>
                {preview
                  ? "Sample cameras allowing analysis"
                  : "Cameras allowing analysis"}
              </span>
              <strong>
                {cameras.state === "ready"
                  ? `${cameraData.filter((camera) => camera.cloud_analysis_allowed).length} of ${cameraData.length}`
                  : "Not verified"}
              </strong>
            </div>
            {!preview && <UsageSummary />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                openMuse("Where do I review camera privacy settings?")
              }
            >
              <Sparkles size={15} />
              Find privacy controls
            </Button>
          </section>
          <section className="settings-section" id="keyboard">
            <h2>A few useful shortcuts</h2>
            <div className="shortcut-row">
              <span>Search commands & destinations</span>
              <span>
                <kbd>⌘ / Ctrl</kbd> <kbd>K</kbd>
              </span>
            </div>
            <div className="shortcut-row">
              <span>Close a dialog or Muse</span>
              <kbd>Esc</kbd>
            </div>
            <div className="shortcut-row">
              <span>Move through the command palette</span>
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd>
              </span>
            </div>
            <div className="shortcut-row">
              <span>Move between controls</span>
              <span>
                <kbd>Tab</kbd> <kbd>Shift + Tab</kbd>
              </span>
            </div>
          </section>
          {preview && (
            <section className="settings-section" id="preview">
              <Badge tone="blue">Development fixtures</Badge>
              <h2>Explore the in-between states</h2>
              <p>
                These controls change authored sample states only. No camera,
                indexing job, or model behavior is simulated as real.
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
              <p className="muted">
                Your choice follows the preview URL. Exit preview to return to
                real service responses.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
