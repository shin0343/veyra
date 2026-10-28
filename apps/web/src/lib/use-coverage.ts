"use client";

import { useEffect, useState } from "react";
import { isAbort, request, resourceError } from "./client-api";
import type { Coverage } from "./explore";
import type { Resource } from "./types";
import { useWorkspace } from "../components/workspace-provider";

/** Index coverage per camera (GET /index-coverage). Reads only; never calls a model. */
export function useCoverage(enabled: boolean, attempt = 0) {
  const { showTestSources } = useWorkspace();
  const [coverage, setCoverage] = useState<Resource<Coverage>>({
    state: "loading",
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    request<Coverage>(`/index-coverage?curated_only=${!showTestSources}`, {
      signal: controller.signal,
    })
      .then((data) => setCoverage({ state: "ready", data }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbort(error))
          setCoverage(resourceError(error));
      });
    return () => controller.abort();
  }, [enabled, attempt, showTestSources]);
  return coverage;
}
