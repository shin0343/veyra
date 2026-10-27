"use client";

import type { ReactNode } from "react";
import type { Resource } from "@/lib/types";
import { useWorkspace } from "./workspace-provider";
import { Retry, Skeleton, StatePanel } from "./ui/primitives";

export function ResourceState<T>({
  resource,
  emptyTitle,
  emptyDescription,
  children,
  compact = false,
  emptyAction,
}: {
  resource: Resource<T[]>;
  emptyTitle: string;
  emptyDescription: string;
  children: (data: T[]) => ReactNode;
  compact?: boolean;
  emptyAction?: ReactNode;
}) {
  const { reload } = useWorkspace();
  if (resource.state === "loading")
    return (
      <div
        className={`resource-loading ${compact ? "resource-loading-compact" : ""}`}
        role="status"
        aria-label="Loading workspace data"
      >
        <Skeleton className="skeleton-title" />
        <Skeleton />
        <Skeleton />
        <span className="sr-only">Loading workspace data</span>
      </div>
    );
  if (resource.state === "error")
    return (
      <StatePanel
        kind="error"
        compact={compact}
        title={
          resource.code === "NOT_IMPLEMENTED"
            ? "This part is taking shape"
            : "Let’s reconnect your workspace"
        }
        description={resource.message}
      >
        <Retry onClick={reload} />
      </StatePanel>
    );
  if (!resource.data.length)
    return (
      <StatePanel
        compact={compact}
        title={emptyTitle}
        description={emptyDescription}
      >
        {emptyAction}
      </StatePanel>
    );
  return <>{children(resource.data)}</>;
}
