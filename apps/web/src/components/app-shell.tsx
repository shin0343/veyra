"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  Command,
  CornerDownLeft,
  Eye,
  Grid2X2,
  Home,
  Menu,
  MessageSquare,
  ScanSearch,
  Search,
  Settings2,
  Sparkles,
  Video,
  Waves,
  X,
} from "lucide-react";
import {
  appRoutes,
  destinations,
  findDestinations,
  type AppRoute,
} from "@/lib/navigation";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { WorkspaceProvider, useWorkspace } from "./workspace-provider";
import { MusePanel } from "./muse-panel";

const navigation = [
  { id: "home", label: "Overview", icon: Home },
  { id: "search", label: "Explore", icon: ScanSearch },
  { id: "cameras", label: "Cameras", icon: Camera },
  { id: "live", label: "Live view", icon: Video },
  { id: "recordings", label: "Recordings", icon: Waves },
  { id: "events", label: "Activity", icon: Eye },
  { id: "layouts", label: "Saved views", icon: Grid2X2 },
] satisfies { id: AppRoute; label: string; icon: typeof Home }[];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="11" fill="#207A70" />
        <path
          d="m9 11 8 14 8-14M17 25V9"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span>
          veyra<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const preview = params.get("preview") === "1";
  return (
    <WorkspaceProvider
      key={preview ? "preview" : "connected"}
      preview={preview}
    >
      <ShellContent>{children}</ShellContent>
    </WorkspaceProvider>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { href } = useWorkspace();
  return (
    <nav aria-label="Main navigation">
      {navigation.map(({ id, label, icon: Icon }) => (
        <Link
          key={id}
          href={href(appRoutes[id])}
          className={`nav-item ${pathname === appRoutes[id] || (id !== "home" && pathname.startsWith(`${appRoutes[id]}/`)) ? "active" : ""}`}
          aria-current={
            pathname === appRoutes[id] ||
            (id !== "home" && pathname.startsWith(`${appRoutes[id]}/`))
              ? "page"
              : undefined
          }
          title={label}
          onClick={onNavigate}
        >
          <Icon size={20} strokeWidth={1.7} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const workspace = useWorkspace();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const current =
    navigation.find(
      (item) => item.id !== "home" && pathname.startsWith(appRoutes[item.id]),
    )?.label ?? (pathname.startsWith("/settings") ? "Settings" : "Overview");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function togglePreview() {
    const next = new URLSearchParams(params);
    if (workspace.preview) {
      next.delete("preview");
      next.delete("state");
    } else next.set("preview", "1");
    router.push(`${pathname}?${next}`);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link
          className="brand-link"
          href={workspace.href("/")}
          aria-label="Veyra overview"
        >
          <Brand />
        </Link>
        <div className="workspace-name">
          <span className="workspace-glyph">
            <Home size={15} />
          </span>
          <div>
            <strong>Personal workspace</strong>
            <span>Your everyday spaces</span>
          </div>
        </div>
        <Navigation />
        <div className="sidebar-bottom">
          <div className="sidebar-muse">
            <span className="muse-symbol">
              <Sparkles size={19} />
            </span>
            <h3>A little help, right here.</h3>
            <p>
              Find a feature or a moment.
              <br />
              Just ask in your own words.
            </p>
            <button onClick={() => workspace.openMuse()}>
              Meet Muse <ArrowUpRight size={15} />
            </button>
          </div>
          <Link
            href={workspace.href("/settings")}
            className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
            title="Settings"
          >
            <Settings2 size={20} strokeWidth={1.7} />
            <span>Settings</span>
          </Link>
          <div className="workspace-footer">
            <span className="avatar">W</span>
            <div>
              <strong>Your workspace</strong>
              <span>Local environment</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-location">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </Button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={14} className="breadcrumb-root" />
            <span>{current}</span>
          </div>
          <button
            className="topbar-command"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search or ask Muse"
          >
            <Search size={16} />
            <span>Search or ask Muse</span>
            <kbd>
              <Command size={11} /> K
            </kbd>
          </button>
          <Button
            size="sm"
            variant="secondary"
            className="ask-muse"
            onClick={() => workspace.openMuse()}
          >
            <Sparkles size={16} />
            Ask Muse
          </Button>
        </header>
        {workspace.preview && (
          <div className="preview-banner" role="note">
            <span>
              <span className="preview-label">Preview workspace</span>
              <span className="preview-explanation">
                Sample data. No real camera feeds or Muse execution.
              </span>
            </span>
            <button onClick={togglePreview}>
              Exit preview <X size={14} />
            </button>
          </div>
        )}
        {!workspace.preview &&
          workspace.cameras.state === "ready" &&
          workspace.cameras.data.some(
            (camera) => camera.source_media?.kind === "prerecorded",
          ) && (
            <div className="demo-media-notice" role="note">
              <strong>Demo workspace · Prerecorded footage</strong>
              <span>
                Timeline dates show local replay and ingest time, not the
                original filming date. Connected means the demo publisher is
                sending video.
              </span>
            </div>
          )}
        <main id="main-content" tabIndex={-1} className="page-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>
            <span className="footer-mark" />A little clarity for your everyday.
          </span>
          <button onClick={togglePreview}>
            {workspace.preview
              ? "Return to workspace"
              : "Explore a preview workspace"}
            <ArrowUpRight size={13} />
          </button>
        </footer>
      </div>
      <Dialog
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title="Your workspace"
        description="Find your way around Veyra."
        className="mobile-nav-dialog"
      >
        <Navigation onNavigate={() => setMenuOpen(false)} />
        <Link
          href={workspace.href("/settings")}
          onClick={() => setMenuOpen(false)}
          className="nav-item"
        >
          <Settings2 size={20} />
          Settings
        </Link>
      </Dialog>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <MusePanel />
    </div>
  );
}

type PaletteOption =
  | { kind: "muse"; id: string }
  | { kind: "search"; id: string }
  | { kind: "destination"; id: string; item: (typeof destinations)[number] };

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const { href, openMuse } = useWorkspace();
  const router = useRouter();
  const text = query.trim();
  const places: PaletteOption[] = (
    text ? findDestinations(query) : destinations.slice(0, 5)
  ).map((item) => ({ kind: "destination", id: item.id, item }));
  const actions: PaletteOption[] = text
    ? [
        { kind: "muse", id: "ask-muse" },
        { kind: "search", id: "search-video" },
      ]
    : [];
  // A sentence is a request for Muse; a word or two is usually a place to go.
  const sentence = text.split(/\s+/).length >= 3 || !places.length;
  const items = sentence ? [...actions, ...places] : [...places, ...actions];
  const [selected, setSelected] = useState(0);
  function choose(option: PaletteOption) {
    onOpenChange(false);
    if (option.kind === "muse") openMuse(query);
    else if (option.kind === "search")
      router.push(
        href(`/explore?q=${encodeURIComponent(text.slice(0, 2000))}`),
      );
    else router.push(href(appRoutes[option.item.id]));
    setQuery("");
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Find your next step"
      description="Go to a feature, search your video, or ask Muse to do it."
      className="command-dialog"
    >
      <div className="palette-input">
        <Search size={21} />
        <input
          aria-label="Search commands"
          autoComplete="off"
          value={query}
          placeholder="Try “cameras” or “make a 2×2 view of my cameras”"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((i) => (i + 1) % Math.max(items.length, 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(
                (i) => (i - 1 + items.length) % Math.max(items.length, 1),
              );
            }
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              items[selected]
            ) {
              event.preventDefault();
              choose(items[selected]);
            }
          }}
          aria-controls="command-results"
          aria-activedescendant={
            items[selected] ? `command-${items[selected].id}` : undefined
          }
          role="combobox"
          aria-expanded={open}
        />
      </div>
      <div className="palette-label">
        {text ? "Choose what happens next" : "Go somewhere"}
        <span>
          {text ? "Muse acts only after you choose" : "Feature guide"}
        </span>
      </div>
      <div
        id="command-results"
        role="listbox"
        aria-label="Suggested next steps"
        className="command-results"
      >
        {items.map((option, index) => (
          <button
            key={option.id}
            id={`command-${option.id}`}
            role="option"
            aria-selected={selected === index}
            className={`command-result ${option.kind !== "destination" ? "command-action" : ""} ${selected === index ? "selected" : ""}`}
            onMouseMove={() => setSelected(index)}
            onClick={() => choose(option)}
          >
            <span className="command-result-icon">
              {option.kind === "muse" ? (
                <Sparkles size={18} />
              ) : option.kind === "search" ? (
                <Search size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </span>
            <span>
              <strong>
                {option.kind === "muse"
                  ? `Ask Muse: “${text}”`
                  : option.kind === "search"
                    ? `Search your video for “${text}”`
                    : option.item.title}
              </strong>
              <small>
                {option.kind === "muse"
                  ? "Muse can open pages, find moments and prepare views for your approval."
                  : option.kind === "search"
                    ? "Find recorded moments Muse has already analyzed."
                    : option.item.description}
              </small>
            </span>
            {option.kind === "destination" ? (
              <ArrowUpRight size={17} />
            ) : (
              <CornerDownLeft size={16} className="command-enter" />
            )}
          </button>
        ))}
      </div>
      <div className="palette-bottom">
        <Button
          variant="ghost"
          onClick={() => {
            onOpenChange(false);
            openMuse(query);
          }}
        >
          <MessageSquare size={17} />
          {text ? "Ask Muse about this" : "Open Muse"}
        </Button>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move <kbd>↵</kbd> to choose
        </span>
      </div>
    </Dialog>
  );
}
