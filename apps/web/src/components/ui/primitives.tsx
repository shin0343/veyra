import {
  ArrowUpRight,
  CameraOff,
  CircleAlert,
  Inbox,
  LoaderCircle,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Camera } from "@/lib/types";
import { Button } from "./button";

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </header>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "teal" | "amber" | "blue";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function CameraStatus({ status }: { status: Camera["status"] }) {
  const label = {
    online: "Connected",
    offline: "Offline",
    unknown: "Not checked",
    error: "Connection issue",
    disabled: "Paused",
  }[status];
  return (
    <span className={`camera-status status-${status}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
export function StatePanel({
  kind = "empty",
  title,
  description,
  children,
  compact = false,
}: {
  kind?: "empty" | "error" | "loading" | "search" | "offline";
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  const Icon = {
    empty: Inbox,
    error: CircleAlert,
    loading: LoaderCircle,
    search: Search,
    offline: CameraOff,
  }[kind];
  return (
    <div
      className={`state-panel ${compact ? "state-compact" : ""}`}
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading"}
    >
      <span className={`state-icon ${kind === "loading" ? "is-loading" : ""}`}>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children && <div className="state-actions">{children}</div>}
    </div>
  );
}
export function SectionTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
export function TextLink({ children }: { children: ReactNode }) {
  return (
    <span className="text-link">
      {children}
      <ArrowUpRight size={15} />
    </span>
  );
}
export function Retry({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      Try again
    </Button>
  );
}
export function ErrorMessage({
  message,
  code,
  requestId,
}: {
  message: string;
  code?: string;
  requestId?: string;
}) {
  return (
    <p className="inline-error" role="alert">
      <CircleAlert size={17} />
      <span>
        {message}
        {(code || requestId) && (
          <small className="error-reference">
            {code}
            {code && requestId ? " · " : ""}
            {requestId ? `Reference ${requestId.slice(0, 8)}` : ""}
          </small>
        )}
      </span>
    </p>
  );
}
/** Shows an ApiError (or any thrown value) with its stable code and request reference. */
export function ProblemMessage({
  error,
  fallback = "This request couldn’t be completed.",
}: {
  error: unknown;
  fallback?: string;
}) {
  const detail = error as
    { message?: string; code?: string; requestId?: string } | undefined;
  return (
    <ErrorMessage
      message={
        error instanceof Error && error.message ? error.message : fallback
      }
      code={detail?.code}
      requestId={detail?.requestId}
    />
  );
}
