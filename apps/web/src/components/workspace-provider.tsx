"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  fixtureCameras,
  fixtureEvents,
  fixtureLayouts,
  fixtureRecordings,
} from "@/lib/fixtures";
import { isAbort, request, resourceError } from "@/lib/client-api";
import { previewHref } from "@/lib/navigation";
import type {
  Camera,
  Event,
  Layout,
  PreviewState,
  Recording,
  Resource,
  Schema,
} from "@/lib/types";

interface WorkspaceContext {
  preview: boolean;
  previewState: PreviewState;
  cameras: Resource<Camera[]>;
  recordings: Resource<Recording[]>;
  events: Resource<Event[]>;
  layouts: Resource<Layout[]>;
  href: (href: string) => string;
  reload: () => void;
  addPreviewLayout: (layout: Layout) => void;
  setPreviewState: (state: PreviewState) => void;
  /**
   * Opens Muse with the query written into its composer. Nothing is sent (and nothing is
   * billed) unless `send` is set by a control whose own label says "Ask Muse".
   */
  openMuse: (query?: string, options?: { send?: boolean }) => void;
  museOpen: boolean;
  museQuery: string;
  museRequest: number;
  /** Muse registers its sender so a handed-over query is sent from the user's own action. */
  registerMuse: (sender: ((query: string) => void) | null) => void;
  closeMuse: () => void;
}
const Context = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace provider missing");
  return context;
}

export function WorkspaceProvider({
  children,
  preview,
}: {
  children: ReactNode;
  preview: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const candidate = params.get("state");
  const previewState: PreviewState = [
    "loading",
    "empty",
    "error",
    "indexing",
  ].includes(candidate ?? "")
    ? (candidate as PreviewState)
    : "ready";
  const [cameras, setCameras] = useState<Resource<Camera[]>>({
    state: "loading",
  });
  const [recordings, setRecordings] = useState<Resource<Recording[]>>({
    state: "loading",
  });
  const [events, setEvents] = useState<Resource<Event[]>>({ state: "loading" });
  const [layouts, setLayouts] = useState<Resource<Layout[]>>({
    state: "loading",
  });
  const [localLayouts, setLocalLayouts] = useState(fixtureLayouts);
  const [revision, setRevision] = useState(0);
  const [museOpen, setMuseOpen] = useState(false);
  const [museQuery, setMuseQuery] = useState("");
  const [museRequest, setMuseRequest] = useState(0);
  const museSender = useRef<((query: string) => void) | null>(null);
  const openMuse = useCallback(
    (query = "", options: { send?: boolean } = {}) => {
      setMuseQuery(options.send ? "" : query);
      setMuseRequest((value) => value + 1);
      setMuseOpen(true);
      if (options.send && query.trim()) museSender.current?.(query);
    },
    [],
  );
  const registerMuse = useCallback(
    (sender: ((query: string) => void) | null) => {
      museSender.current = sender;
    },
    [],
  );
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    // Refreshes keep the last verified data visible; only a first load shows skeletons.
    async function load<T extends { items: unknown[] }>(
      path: string,
      set: (
        update: (current: Resource<T["items"]>) => Resource<T["items"]>,
      ) => void,
    ) {
      try {
        const data = await request<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted)
          set(() => ({ state: "ready", data: data.items }));
      } catch (error) {
        if (!controller.signal.aborted && !isAbort(error))
          set(() => resourceError(error));
      }
    }
    void load<Schema["CameraList"]>("/cameras", setCameras);
    void load<Schema["LayoutList"]>("/layouts", setLayouts);
    // Events are read for the 24 hours ending at the latest recorded video, not "now":
    // an idle camera or a prerecorded demo would otherwise show no history at all.
    void request<Schema["RecordingList"]>("/recordings?limit=100", {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRecordings({ state: "ready", data: data.items });
        const end = Math.max(
          0,
          ...data.items.map((r) =>
            r.ended_at ? Date.parse(r.ended_at) : Date.now(),
          ),
        );
        const query = end
          ? `&start=${new Date(end - 24 * 3600000).toISOString()}&end=${new Date(end + 1000).toISOString()}`
          : "";
        void load<Schema["EventList"]>(`/events?limit=100${query}`, setEvents);
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setRecordings(resourceError(error));
        void load<Schema["EventList"]>("/events?limit=100", setEvents);
      });
    return () => controller.abort();
  }, [preview, revision]);
  useEffect(() => {
    if (preview) return;
    // Camera status is observed by the media reconciler; poll quietly while visible.
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      request<Schema["CameraList"]>("/cameras", { timeoutMs: 8000 })
        .then((data) => setCameras({ state: "ready", data: data.items }))
        .catch(() =>
          setCameras((current) =>
            current.state === "ready"
              ? {
                  state: "ready",
                  data: current.data.map((camera) =>
                    camera.enabled ? { ...camera, status: "unknown" } : camera,
                  ),
                }
              : current,
          ),
        );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [preview]);
  const fixtureResource = <T,>(data: T[]): Resource<T[]> =>
    previewState === "loading"
      ? { state: "loading" }
      : previewState === "error"
        ? {
            state: "error",
            message:
              "Preview example: the workspace service couldn’t be reached.",
            code: "PREVIEW_ERROR",
          }
        : { state: "ready", data: previewState === "empty" ? [] : data };
  return (
    <Context.Provider
      value={{
        preview,
        previewState,
        cameras: preview ? fixtureResource(fixtureCameras) : cameras,
        recordings: preview ? fixtureResource(fixtureRecordings) : recordings,
        events: preview ? fixtureResource(fixtureEvents) : events,
        layouts: preview ? fixtureResource(localLayouts) : layouts,
        href: (href) => previewHref(href, preview),
        reload: () => setRevision((r) => r + 1),
        addPreviewLayout: (layout) =>
          setLocalLayouts((current) => [layout, ...current]),
        setPreviewState: (state) => {
          const next = new URLSearchParams(params);
          if (state === "ready") next.delete("state");
          else next.set("state", state);
          router.replace(`${pathname}?${next}`);
        },
        openMuse,
        museOpen,
        museQuery,
        museRequest,
        registerMuse,
        closeMuse: () => setMuseOpen(false),
      }}
    >
      {children}
    </Context.Provider>
  );
}
