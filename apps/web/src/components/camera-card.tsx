"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  Camera as CameraIcon,
  CloudOff,
  MoreHorizontal,
  Video,
} from "lucide-react";
import type { Camera } from "@/lib/types";
import { Button } from "./ui/button";
import { CameraStatus } from "./ui/primitives";
import { SpaceArt } from "./space-art";
import { useWorkspace } from "./workspace-provider";

export function CameraVisual({
  camera,
  compact = false,
}: {
  camera: Camera;
  compact?: boolean;
}) {
  const { preview } = useWorkspace();
  const [posterFailed, setPosterFailed] = useState(false);
  return (
    <div
      className={`camera-visual ${compact ? "visual-compact" : ""} ${camera.status === "offline" ? "visual-offline" : ""}`}
    >
      {preview ? (
        <>
          <SpaceArt variant={camera.source_id} />
          <span className="illustration-label">Illustration · no video</span>
          {camera.status === "offline" && (
            <span className="offline-cover">
              <CloudOff size={24} />
              <strong>Camera offline</strong>
              <span>Sample connection state</span>
            </span>
          )}
        </>
      ) : camera.source_media?.kind === "prerecorded" && !posterFailed ? (
        <>
          <Image
            className="camera-video-poster"
            src={`/api/v1/cameras/${camera.id}/thumbnail`}
            alt={`Preview frame from ${camera.name}'s prerecorded demo video`}
            width={960}
            height={540}
            unoptimized
            onError={() => setPosterFailed(true)}
          />
          <span className="illustration-label">
            Video preview · Prerecorded footage
          </span>
        </>
      ) : (
        <div className="visual-placeholder">
          {camera.status === "online" ? (
            <CameraIcon size={24} />
          ) : (
            <CloudOff size={24} />
          )}
          <span>
            {camera.status === "online"
              ? "Open live view to watch"
              : camera.status === "unknown"
                ? "Checking the connection…"
                : camera.status === "disabled"
                  ? "Camera paused"
                  : "No video is arriving"}
          </span>
        </div>
      )}
    </div>
  );
}
export function CameraCard({
  camera,
  onSettings,
}: {
  camera: Camera;
  onSettings?: () => void;
}) {
  const { href, preview } = useWorkspace();
  return (
    <article className="camera-card">
      <div className="camera-card-media">
        <CameraVisual camera={camera} />
        <span className="camera-space-tag">
          {camera.group_name ?? (preview ? "Preview space" : "No group")}
        </span>
      </div>
      <div className="camera-card-content">
        <div className="camera-card-title">
          <div>
            <h3>{camera.name}</h3>
            <CameraStatus status={camera.status} />
            {camera.location && (
              <span className="camera-location">{camera.location}</span>
            )}
            {camera.source_media && (
              <span className="camera-location">
                {camera.source_media.kind === "prerecorded"
                  ? "Demo stream · Prerecorded footage"
                  : "Development test source"}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Settings for ${camera.name}`}
            onClick={onSettings}
          >
            <MoreHorizontal size={19} />
          </Button>
        </div>
        {camera.connection_error && camera.status !== "online" && (
          <p className="camera-error" role="note">
            {camera.connection_error.message}
            <small className="error-reference">
              {camera.connection_error.code}
            </small>
          </p>
        )}
        <div className="camera-card-bottom">
          <span>
            {camera.cloud_analysis_allowed
              ? "Video search allowed"
              : "Cloud analysis off"}
          </span>
          <Link href={href(`/live?camera_id=${camera.id}`)}>
            <Video size={14} />
            Open view
          </Link>
        </div>
      </div>
    </article>
  );
}
