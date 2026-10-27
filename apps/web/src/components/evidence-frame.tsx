"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * A preview frame decoded server-side from the evidence segment. It illustrates an
 * interval; it is not a frame-exact detection, so callers label it with that interval.
 */
export function EvidenceFrame({
  src,
  alt,
  label,
  className = "",
}: {
  src: string;
  alt: string;
  /** Short factual overlay such as "8:09:18 AM · 10s". */
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <div className={`evidence-frame is-${state} ${className}`}>
      {state !== "failed" ? (
        <Image
          src={src}
          alt={alt}
          width={480}
          height={270}
          unoptimized
          loading="lazy"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
      ) : (
        <span className="evidence-frame-missing">
          <ImageOff size={18} />
          Preview frame unavailable
        </span>
      )}
      {label && <span className="evidence-frame-label">{label}</span>}
    </div>
  );
}
