"use client";

import { useEffect, useRef, useState } from "react";
import {
  CameraOff,
  CirclePlay,
  Film,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { ApiError, isAbort, request } from "@/lib/client-api";
import type { Camera, Schema } from "@/lib/types";
import { SpaceArt } from "./space-art";
import { useWorkspace } from "./workspace-provider";

type Session = Schema["MediaSession"];
type Status = "connecting" | "loading" | "buffering" | "playing" | "paused";
interface Failure {
  title: string;
  message: string;
  code?: string;
  requestId?: string;
  expired?: boolean;
}
const sessionUrl =
  /^\/api\/v1\/media\/sessions\/[a-f0-9-]{36}\/[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)$/;
// Live sessions are renewed shortly before their five-minute server expiry.
const RENEW_BEFORE_MS = 20000;

function failureFor(error: unknown, live: boolean): Failure {
  const code = error instanceof ApiError ? error.code : undefined;
  const titles: Record<string, string> = {
    SOURCE_OFFLINE: "The camera isn’t sending video",
    STREAM_UNAVAILABLE: "The live stream isn’t ready",
    CAMERA_DISABLED: "This camera is paused",
    MEDIA_GAP: "Nothing was recorded at this moment",
    RECORDING_UNAVAILABLE: "This recording file is no longer available",
    UNSUPPORTED_CODEC: "This video format isn’t supported",
    MEDIA_BUSY: "Video is still being prepared",
    MEDIA_CAPACITY: "Video storage is temporarily full",
    SESSION_CAPACITY: "Too many videos are open",
    MEDIA_UNAVAILABLE: "The media service isn’t reachable",
    UPSTREAM_TIMEOUT: "Preparing this video took too long",
  };
  return {
    title:
      (code && titles[code]) ??
      (live ? "Live video isn’t available" : "This moment can’t be played"),
    message:
      error instanceof Error && error.message
        ? error.message
        : "Video couldn’t be loaded.",
    code,
    requestId: error instanceof ApiError ? error.requestId : undefined,
  };
}

export function MediaPlayer({
  camera,
  recordingId,
  sourceMedia,
  segmentId,
  offsetMs = 0,
  durationMs = 30000,
  onPosition,
  onClipEnd,
  onResume,
}: {
  camera?: Camera;
  recordingId?: string;
  sourceMedia?: Camera["source_media"];
  /** Exact evidence segment from a search hit; optional for timeline playback. */
  segmentId?: string | null;
  offsetMs?: number;
  durationMs?: number;
  /** Recording-relative position in ms while playing. */
  onPosition?: (offsetMs: number) => void;
  /** Called with the next recording-relative offset when a clip finishes. */
  onClipEnd?: (nextOffsetMs: number) => void;
  /** Called with the current position when an expired playback link must be renewed. */
  onResume?: (offsetMs: number) => void;
}) {
  const { preview } = useWorkspace();
  const live = !recordingId;
  const origin = live ? camera?.source_media : sourceMedia;
  const video = useRef<HTMLVideoElement>(null);
  const position = useRef(offsetMs);
  const [status, setStatus] = useState<Status>("connecting");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [revision, setRevision] = useState(0);
  // The server prepares one playback clip at a time; a busy answer is retried briefly.
  const busyRetries = useRef(0);
  // Recording sessions depend on the recording, not asynchronously loaded camera details.
  const cameraId = live ? camera?.id : undefined;
  const reachable =
    !live || camera?.status === "online" || camera?.status === "unknown";
  useEffect(() => {
    if (preview || !reachable) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    const path = live
      ? `/cameras/${cameraId}/live-session`
      : "/playback-sessions";
    void request<Session>(path, {
      method: "POST",
      signal: controller.signal,
      timeoutMs: live ? 20000 : 35000,
      body: live
        ? undefined
        : JSON.stringify({
            recording_id: recordingId,
            offset_ms: offsetMs,
            duration_ms: durationMs,
            ...(segmentId ? { segment_id: segmentId } : {}),
          }),
    })
      .then((value) => {
        if (
          !sessionUrl.test(value.url) ||
          !["hls", "mp4"].includes(value.transport) ||
          !Number.isSafeInteger(value.seek_offset_ms) ||
          value.seek_offset_ms < 0 ||
          !Number.isFinite(Date.parse(value.expires_at)) ||
          Date.parse(value.expires_at) <= Date.now()
        )
          throw new Error("The playback link is invalid or has expired.");
        if (controller.signal.aborted) return;
        busyRetries.current = 0;
        setFailure(null);
        setSession(value);
        setStatus("loading");
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        if (
          error instanceof ApiError &&
          error.code === "MEDIA_BUSY" &&
          busyRetries.current < 4
        ) {
          busyRetries.current += 1;
          retryTimer = window.setTimeout(
            () => setRevision((r) => r + 1),
            1200 * busyRetries.current,
          );
          return;
        }
        setSession(null);
        setFailure(failureFor(error, live));
      });
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [
    cameraId,
    recordingId,
    segmentId,
    offsetMs,
    durationMs,
    live,
    preview,
    reachable,
    revision,
  ]);
  const cameraStatus = camera?.status;
  const previousStatus = useRef(cameraStatus);
  useEffect(() => {
    // A camera that becomes observably online after a failed attempt gets one fresh try.
    if (
      live &&
      failure &&
      cameraStatus === "online" &&
      previousStatus.current !== "online"
    ) {
      setFailure(null);
      setStatus("connecting");
      setRevision((r) => r + 1);
    }
    previousStatus.current = cameraStatus;
  }, [cameraStatus, failure, live]);
  useEffect(() => {
    if (!session || !live) return;
    const wait = Date.parse(session.expires_at) - Date.now() - RENEW_BEFORE_MS;
    const timer = window.setTimeout(
      () => setRevision((r) => r + 1),
      Math.max(wait, 5000),
    );
    return () => window.clearTimeout(timer);
  }, [session, live]);
  useEffect(() => {
    if (!session || !video.current) return;
    const element = video.current;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    if (session.transport === "hls") {
      // Prefer hls.js wherever Media Source Extensions exist. Some Chromium builds now claim
      // native HLS but fail to parse the fMP4 playlist; native playback is the iOS fallback.
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (element.canPlayType("application/vnd.apple.mpegurl"))
            element.src = session.url;
          else
            setFailure({
              title: "This browser can’t play live video",
              message: "Try a browser with HLS support.",
            });
          return;
        }
        const hls = new Hls({ liveSyncDurationCount: 3 });
        let recovered = false;
        hls.loadSource(session.url);
        hls.attachMedia(element);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            hls.recoverMediaError();
            return;
          }
          setFailure({
            title: "The stream was interrupted",
            message:
              Date.parse(session.expires_at) <= Date.now()
                ? "The viewing session expired. Reconnect to continue."
                : "The camera stopped sending video or the connection dropped.",
            code: data.details,
          });
        });
        dispose = () => hls.destroy();
      });
    } else element.src = session.url;
    return () => {
      cancelled = true;
      dispose?.();
      element.removeAttribute("src");
      element.load();
    };
  }, [session]);
  if (preview && live && camera?.status === "offline")
    return (
      <div className="media-player player-empty">
        <CameraOff size={29} />
        <strong>This sample camera is offline</strong>
        <p>Example connection state. No video is playing.</p>
      </div>
    );
  if (preview)
    return (
      <div className="media-player preview-player">
        <SpaceArt variant={camera?.source_id} />
        <div className="preview-player-note">
          <span className="player-note-icon">
            {recordingId ? <Film size={25} /> : <CirclePlay size={27} />}
          </span>
          <strong>
            {recordingId ? "Recording preview" : "Live view preview"}
          </strong>
          <p>Space illustration. No video is playing.</p>
          <span>
            {recordingId
              ? `Requested moment ${formatOffset(offsetMs)}`
              : "Connect a workspace to watch your camera."}
          </span>
        </div>
        <span className="player-preview-badge">Sample space · no footage</span>
      </div>
    );
  if (live && !reachable)
    return (
      <div className="media-player player-empty" role="status">
        <CameraOff size={29} />
        <strong>
          {camera?.status === "disabled"
            ? "This camera is paused"
            : camera?.status === "error"
              ? "This camera has a connection issue"
              : "This camera is offline"}
        </strong>
        <p>
          {camera?.connection_error?.message ??
            "No video is playing. It will be available when the camera reconnects."}
        </p>
        {camera?.connection_error?.code && (
          <small className="error-reference">
            {camera.connection_error.code}
          </small>
        )}
      </div>
    );
  const retry = () => {
    setFailure(null);
    setSession(null);
    setStatus("connecting");
    if (failure?.expired && onResume) onResume(position.current);
    else setRevision((r) => r + 1);
  };
  return (
    <div className="media-player real-player" data-player-status={status}>
      {origin && (
        <span className="player-source-label">
          {origin.kind === "prerecorded"
            ? live
              ? "Demo stream · Prerecorded footage"
              : "Demo recording · Prerecorded footage"
            : "Development test pattern"}
        </span>
      )}
      {session && (
        <video
          ref={video}
          controls
          playsInline
          muted
          autoPlay
          aria-label={
            live
              ? `${origin?.kind === "prerecorded" ? "Prerecorded demo stream" : "Live video"} from ${camera?.name ?? "camera"}`
              : "Recording playback"
          }
          onLoadedMetadata={() => {
            if (!live && video.current)
              video.current.currentTime = session.seek_offset_ms / 1000;
          }}
          onWaiting={() => setStatus("buffering")}
          onPlaying={() => setStatus("playing")}
          onPause={() => setStatus("paused")}
          onCanPlay={() =>
            setStatus((current) =>
              current === "loading" || current === "buffering"
                ? "paused"
                : current,
            )
          }
          onTimeUpdate={() => {
            if (live || !video.current) return;
            position.current = Math.round(
              session.actual_start_offset_ms + video.current.currentTime * 1000,
            );
            onPosition?.(position.current);
          }}
          onEnded={() => {
            if (!live && video.current && onClipEnd)
              onClipEnd(
                Math.round(
                  session.actual_start_offset_ms +
                    video.current.duration * 1000,
                ),
              );
          }}
          onError={() => {
            const expired = Date.parse(session.expires_at) <= Date.now();
            setFailure({
              title: expired
                ? "This viewing link expired"
                : "This video couldn’t be played",
              message: expired
                ? "Video links last five minutes. Resume to request a fresh one at the same moment."
                : "The browser couldn’t decode the media it received.",
              expired,
            });
          }}
        />
      )}
      {!failure && (status === "connecting" || status === "loading") && (
        <div className="player-state" role="status">
          <LoaderCircle size={26} className="is-loading" />
          <strong>
            {status === "connecting"
              ? live
                ? "Connecting to your camera…"
                : "Preparing this moment…"
              : "Loading video…"}
          </strong>
          <span>
            {status === "connecting"
              ? live
                ? "Requesting a private viewing session."
                : "The recorded clip is verified before it plays."
              : "Waiting for the first frames."}
          </span>
        </div>
      )}
      {!failure && status === "buffering" && (
        <span className="player-buffering" role="status">
          <LoaderCircle size={14} className="is-loading" />
          Buffering
        </span>
      )}
      {failure && (
        <div className="player-state" role="alert">
          <CameraOff size={26} />
          <strong>{failure.title}</strong>
          <span>{failure.message}</span>
          {(failure.code || failure.requestId) && (
            <small className="error-reference">
              {failure.code}
              {failure.code && failure.requestId ? " · " : ""}
              {failure.requestId
                ? `Reference ${failure.requestId.slice(0, 8)}`
                : ""}
            </small>
          )}
          {failure.code !== "MEDIA_GAP" && (
            <button onClick={retry}>
              <RotateCcw size={13} />
              {failure.expired ? "Resume here" : "Try again"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function formatOffset(ms: number) {
  const seconds = Math.floor(Math.max(ms, 0) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
/** Parses "mm:ss", "h:mm:ss" or plain seconds into milliseconds. */
export function parseOffset(value: string): number | null {
  const parts = value.trim().split(":");
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p)))
    return null;
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isSafeInteger(seconds * 1000) ? seconds * 1000 : null;
}
