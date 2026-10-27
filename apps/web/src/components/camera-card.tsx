"use client";

import Image from "next/image";
import { useState } from "react";
import { CameraOff, CloudOff } from "lucide-react";
import type { Camera } from "@/lib/types";
import { SpaceArt } from "./space-art";
import { useWorkspace } from "./workspace-provider";

const reason: Record<Camera["status"], string> = {
  online: "No preview frame",
  unknown: "Checking the connection…",
  disabled: "Paused",
  offline: "No video is arriving",
  error: "Connection issue",
};

/**
 * A camera's preview frame: the server's video-derived poster for prerecorded sources, an
 * illustration labelled as such in preview mode, otherwise an honest placeholder. A poster is
 * never presented as proof that the camera is live; callers state status in text beside it.
 */
export function CameraFrame({ camera }: { camera: Camera }) {
  const { preview } = useWorkspace();
  const [failed, setFailed] = useState(false);
  return (
    <span className={`camera-frame is-${camera.status}`}>
      {preview ? (
        <>
          <SpaceArt variant={camera.source_id} />
          <span className="camera-frame-label">Illustration · no video</span>
        </>
      ) : camera.source_media?.kind === "prerecorded" && !failed ? (
        <Image
          src={`/api/v1/cameras/${camera.id}/thumbnail`}
          alt=""
          width={480}
          height={270}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="camera-frame-none">
          {camera.status === "online" ? (
            <CameraOff size={18} aria-hidden="true" />
          ) : (
            <CloudOff size={18} aria-hidden="true" />
          )}
          {reason[camera.status]}
        </span>
      )}
    </span>
  );
}
