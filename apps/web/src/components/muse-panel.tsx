"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Ban,
  Camera,
  Check,
  CircleAlert,
  Clock3,
  Film,
  Grid2X2,
  Layers2,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import {
  appRoutes,
  destinations,
  findDestinations,
  targetHref,
} from "@/lib/navigation";
import {
  ApiError,
  errorMessage,
  isAbort,
  mutationOptions,
  request,
} from "@/lib/client-api";
import type {
  ActionResult,
  AgentResponse,
  Camera as CameraType,
  NavigationAction,
  Schema,
} from "@/lib/types";
import { useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Badge, CameraStatus, ErrorMessage } from "./ui/primitives";
import { formatOffset } from "./media-player";
import { readableReceipt } from "@/lib/receipts";

interface Turn {
  id: string;
  message: string;
  /** Stable Idempotency-Key: a retry recovers the same server run instead of starting another. */
  key: string;
  state: "pending" | "done" | "error";
  startedAt: number;
  response?: AgentResponse;
  error?: ApiError | Error;
  decision?: AgentResponse;
}

export function MusePanel() {
  const { museOpen, closeMuse, museQuery, museRequest, registerMuse, preview } =
    useWorkspace();
  // The thread lives with the always-mounted panel so closing Muse keeps context.
  const [turns, setTurns] = useState<Turn[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const conversationId =
    [...turns].reverse().find((turn) => turn.response)?.response
      ?.conversation_id ?? null;
  async function send(message: string, existing?: Turn) {
    const text = message.trim();
    if (!text || preview) return;
    const turn: Turn = existing
      ? {
          ...existing,
          state: "pending",
          error: undefined,
          startedAt: Date.now(),
        }
      : {
          id: crypto.randomUUID(),
          message: text,
          key: crypto.randomUUID(),
          state: "pending",
          startedAt: Date.now(),
        };
    setTurns((current) =>
      existing
        ? current.map((item) => (item.id === turn.id ? turn : item))
        : [...current, turn],
    );
    const controller = new AbortController();
    controllers.current.set(turn.id, controller);
    try {
      const response = await request<AgentResponse>("/agent/messages", {
        ...mutationOptions(
          { message: turn.message, conversation_id: conversationId },
          turn.key,
        ),
        signal: controller.signal,
        timeoutMs: 75000,
      });
      setTurns((current) =>
        current.map((item) =>
          item.id === turn.id ? { ...item, state: "done", response } : item,
        ),
      );
    } catch (error) {
      const value = isAbort(error)
        ? new ApiError(
            "You stopped waiting. Muse may still finish this request on the server; check again to see its receipt.",
            "STOPPED_WAITING",
          )
        : error instanceof Error
          ? error
          : new Error("Muse couldn’t complete your request.");
      setTurns((current) =>
        current.map((item) =>
          item.id === turn.id
            ? { ...item, state: "error", error: value }
            : item,
        ),
      );
    } finally {
      controllers.current.delete(turn.id);
    }
  }
  useEffect(() => {
    // A query handed over from the command bar or a prompt is the user's request.
    registerMuse(preview ? null : (query) => void send(query));
    return () => registerMuse(null);
  });
  return (
    <Dialog
      open={museOpen}
      onOpenChange={(open) => {
        if (!open) closeMuse();
      }}
      title="Muse"
      description="Answers come from your workspace. Anything that changes it waits for your approval."
      className="muse-panel"
    >
      {museOpen &&
        (preview ? (
          <PreviewGuide key={museRequest} initialQuery={museQuery} />
        ) : (
          <MuseThread
            key={museRequest}
            initialQuery={museQuery}
            turns={turns}
            onSend={(message) => void send(message)}
            onRetry={(turn) => void send(turn.message, turn)}
            onStop={(turn) => controllers.current.get(turn.id)?.abort()}
            onDecision={(id, decision) =>
              setTurns((current) =>
                current.map((item) =>
                  item.id === id ? { ...item, decision } : item,
                ),
              )
            }
            onReset={() => setTurns([])}
          />
        ))}
    </Dialog>
  );
}

function listNames(names: string[]) {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Starter questions for the page the person is on, built from real camera names. They only
 * fill the composer; each says whether Muse would only read or would prepare a change.
 */
function contextualPrompts(pathname: string, cameras: CameraType[]) {
  const names = cameras.slice(0, 4).map((camera) => camera.name);
  const first = names[0];
  const searchable = cameras.find(
    (camera) => camera.cloud_analysis_allowed,
  )?.name;
  const view = {
    text:
      names.length >= 2
        ? `Create a saved view named “Everyday” with ${listNames(names)}`
        : "How do I connect a camera?",
    changes: names.length >= 2,
  };
  const moment = {
    text: searchable
      ? `Find footage with a person on ${searchable}`
      : "Where can I find my recordings?",
    changes: false,
  };
  if (pathname.startsWith("/cameras"))
    return [
      { text: "Which cameras allow cloud analysis?", changes: false },
      {
        text: first
          ? `Is ${first} sending video right now?`
          : "How do I connect a camera?",
        changes: false,
      },
      view,
    ];
  if (pathname.startsWith("/layouts") || pathname.startsWith("/live"))
    return [
      view,
      { text: "Which saved views do I have?", changes: false },
      moment,
    ];
  if (pathname.startsWith("/recordings") || pathname.startsWith("/events"))
    return [
      moment,
      {
        text: searchable
          ? `Find vehicles on ${searchable} this morning`
          : "Which recordings are searchable?",
        changes: false,
      },
      { text: "Where can I change a camera’s settings?", changes: false },
    ];
  return [
    moment,
    view,
    { text: "Where can I change a camera’s settings?", changes: false },
  ];
}

function MuseThread({
  initialQuery,
  turns,
  onSend,
  onRetry,
  onStop,
  onDecision,
  onReset,
}: {
  initialQuery: string;
  turns: Turn[];
  onSend: (message: string) => void;
  onRetry: (turn: Turn) => void;
  onStop: (turn: Turn) => void;
  onDecision: (turnId: string, response: AgentResponse) => void;
  onReset: () => void;
}) {
  // A handed-over request is written into the composer; the person decides to send it.
  const [query, setQuery] = useState(initialQuery);
  const { cameras, href, closeMuse } = useWorkspace();
  const pathname = usePathname();
  const starterPrompts = contextualPrompts(
    pathname,
    cameras.state === "ready"
      ? cameras.data.filter(
          (camera) => camera.source_media?.kind !== "synthetic",
        )
      : [],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    composer.current?.focus();
    composer.current?.setSelectionRange(
      composer.current.value.length,
      composer.current.value.length,
    );
  }, []);
  // Known places answer for free; Muse is only needed for what a link can't do.
  const shortcuts = query.trim() ? findDestinations(query).slice(0, 2) : [];
  const pending = turns.some((turn) => turn.state === "pending");
  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);
  function submit(text = query) {
    if (!text.trim() || pending) return;
    onSend(text);
    setQuery("");
  }
  return (
    <div className="muse-content">
      <div className="muse-context">
        <span>
          <Sparkles size={14} />
          Muse · 1 request per question
        </span>
        {!!turns.length && (
          <button className="muse-reset" onClick={onReset} disabled={pending}>
            New conversation
          </button>
        )}
      </div>
      <div className="muse-scroll" ref={scroller} aria-live="polite">
        {!turns.length && (
          <div className="muse-welcome">
            <p className="palette-label">
              Suggested for this page<span>Fills the box · sends nothing</span>
            </p>
            <div className="muse-prompts">
              {starterPrompts.map(({ text, changes }) => (
                <button
                  key={text}
                  onClick={() => {
                    setQuery(text);
                    composer.current?.focus();
                  }}
                >
                  <span>{text}</span>
                  <small>
                    {changes
                      ? "Prepares a change for your approval"
                      : "Reads your workspace"}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn) => (
          <div className="muse-turn" key={turn.id}>
            <div className="user-message">{turn.message}</div>
            {turn.state === "pending" && (
              <PendingNote turn={turn} onStop={() => onStop(turn)} />
            )}
            {turn.state === "error" && turn.error && (
              <RequestFailure
                turn={turn}
                error={turn.error}
                onRetry={() => onRetry(turn)}
              />
            )}
            {turn.response && (
              <ResponseView
                userMessage={turn.message}
                response={turn.response}
                decision={turn.decision}
                onDecision={(value) => onDecision(turn.id, value)}
                onSend={submit}
                busy={pending}
              />
            )}
          </div>
        ))}
      </div>
      {!!shortcuts.length && (
        <div className="muse-local" aria-label="Pages matching your words">
          {shortcuts.map((item) => (
            <Link
              key={item.id}
              href={href(appRoutes[item.id])}
              onClick={closeMuse}
              className="muse-local-row"
            >
              <Layers2 size={14} />
              <span>
                Go to {item.title}
                <small>No request</small>
              </span>
              <ArrowUpRight size={13} />
            </Link>
          ))}
        </div>
      )}
      <form
        className="muse-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="muse-query">
          Ask Muse
        </label>
        <textarea
          id="muse-query"
          ref={composer}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask in your own words…"
          rows={2}
          maxLength={4000}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!query.trim() || pending}
          aria-label="Send message: Ask Muse, uses 1 request"
        >
          <ArrowUp size={15} />
          Ask Muse · 1 request
        </Button>
      </form>
      <p className="composer-note">
        Outcomes come from Veyra’s own receipts, not from Muse’s wording.
      </p>
    </div>
  );
}

function PendingNote({ turn, onStop }: { turn: Turn; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - turn.startedAt) / 1000));
  return (
    <div className="muse-pending" role="status">
      <span className="muse-pending-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        Muse is working on it · {seconds}s
        <small>
          {seconds < 15
            ? "Reading your workspace with allowed tools."
            : "Some requests take up to a minute. Nothing changes without your approval."}
        </small>
      </span>
      {seconds >= 10 && (
        <button className="muse-link-button" onClick={onStop}>
          Stop waiting
        </button>
      )}
    </div>
  );
}

function RequestFailure({
  turn,
  error,
  onRetry,
}: {
  turn: Turn;
  error: Error;
  onRetry: () => void;
}) {
  const { href, closeMuse } = useWorkspace();
  const code = error instanceof ApiError ? error.code : undefined;
  const retryable =
    !(error instanceof ApiError) ||
    error.retryable ||
    [
      "CONNECTION_FAILED",
      "STOPPED_WAITING",
      "AGENT_RUN_IN_PROGRESS",
      "UPSTREAM_TIMEOUT",
    ].includes(error.code) ||
    error.status >= 500;
  const shortcuts = findDestinations(turn.message).slice(0, 3);
  return (
    <div className="assistant-answer">
      <div className="receipt receipt-failed">
        <CircleAlert size={19} />
        <div>
          <strong>
            {code === "STOPPED_WAITING"
              ? "Stopped waiting for Muse"
              : code === "AGENT_RUN_IN_PROGRESS"
                ? "Muse is still finishing this request"
                : "Muse couldn’t answer"}
          </strong>
          <ErrorMessage
            message={errorMessage(
              error,
              "Muse couldn’t complete your request.",
            )}
            code={code}
            requestId={error instanceof ApiError ? error.requestId : undefined}
          />
          <p className="muted">
            No completed action receipt was received, so no change is assumed.
            {retryable &&
              " Checking again reuses this request, so nothing runs twice."}
          </p>
          {retryable && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Check again
            </Button>
          )}
        </div>
      </div>
      {!!shortcuts.length && (
        <div className="muse-shortcuts">
          <p className="palette-label">
            Pages matching your words<span>Local shortcut, not Muse</span>
          </p>
          {shortcuts.map((item) => (
            <Link
              key={item.id}
              href={href(appRoutes[item.id])}
              onClick={closeMuse}
              className="muse-nav-row"
            >
              <Layers2 size={16} />
              <span>{item.title}</span>
              <ArrowUpRight size={14} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ResponseView({
  userMessage,
  response,
  decision,
  onDecision,
  onSend,
  busy,
}: {
  userMessage: string;
  response: AgentResponse;
  decision?: AgentResponse;
  onDecision: (response: AgentResponse) => void;
  onSend: (text: string) => void;
  busy: boolean;
}) {
  // Destinations come from server receipts: suggested_actions plus each succeeded action's
  // navigation (older responses carry only the latter). Several tools can return the same
  // destination (discover + navigate); show each once.
  const suggestions = [
    ...(response.suggested_actions ?? []),
    ...response.actions.flatMap((action) =>
      action.status === "succeeded" && action.navigation
        ? [action.navigation]
        : [],
    ),
  ].filter(
    (item, index, all) =>
      all.findIndex(
        (other) => JSON.stringify(other.target) === JSON.stringify(item.target),
      ) === index,
  );
  const features = suggestions.filter((item) => item.target.kind === "feature");
  const searched = response.actions.some(
    (action) =>
      action.tool_name === "video.search" && action.status === "succeeded",
  );
  const searchFailed =
    !searched &&
    response.actions.some(
      (action) =>
        action.tool_name === "video.search" && action.status === "failed",
    );
  const places = suggestions.filter(
    (item) =>
      item.target.kind === "camera_live" ||
      item.target.kind === "layout" ||
      (item.target.kind === "recording" && !searched),
  );
  const moments = searched
    ? suggestions.filter((item) => item.target.kind === "recording")
    : [];
  const proposal = response.confirmation_request;
  const pendingActions = response.actions.filter(
    (action) =>
      action.status === "confirmation_required" &&
      action.confirmation.id !== proposal?.confirmation.id,
  );
  const errors = errorsOf(response);
  // A completed run that only read data has nothing to show; say so instead of implying success.
  const readOnly =
    response.status === "completed" &&
    !features.length &&
    !places.length &&
    !searched &&
    !searchFailed &&
    !proposal &&
    !pendingActions.length &&
    !response.camera_candidates?.length &&
    !errors.length;
  if (decision)
    return (
      <div className="assistant-answer">
        <DecisionStatus response={decision} />
        <DecisionResult response={decision} />
        <details className="muse-history">
          <summary>What Muse proposed</summary>
          <p>{readableReceipt(response.message)}</p>
          {proposal && (
            <LayoutProposalCard
              proposal={proposal}
              decision={decision}
              onDecision={onDecision}
            />
          )}
        </details>
        <ActionTrace actions={response.actions} />
      </div>
    );
  return (
    <div className="assistant-answer">
      <ResponseStatus status={response.status} readOnly={readOnly} />
      <p>{readableReceipt(response.message)}</p>
      {!!features.length && (
        <div className="muse-section">
          <p className="palette-label">Where to find it</p>
          {features.map((action, index) => (
            <FeatureCard key={`${action.label}-${index}`} action={action} />
          ))}
        </div>
      )}
      {!!places.length && (
        <div className="muse-section">
          {places.map((action, index) => (
            <NavigationButton
              key={`${action.label}-${index}`}
              action={action}
            />
          ))}
        </div>
      )}
      {searched && <SearchMoments moments={moments} query={userMessage} />}
      {proposal && (
        <LayoutProposalCard
          proposal={proposal}
          decision={decision}
          onDecision={onDecision}
        />
      )}
      {pendingActions.map((action) =>
        action.status === "confirmation_required" ? (
          <GenericConfirmation
            key={action.tool_call_id}
            action={action}
            decided={Boolean(decision)}
            onDecision={onDecision}
          />
        ) : null,
      )}
      {!!response.camera_candidates?.length && (
        <div className="muse-section">
          <p className="palette-label">Which camera did you mean?</p>
          <div className="muse-candidates">
            {response.camera_candidates.map((camera) => (
              <button
                key={camera.id}
                disabled={busy}
                onClick={() =>
                  onSend(
                    `Use the camera named "${camera.name}" (${camera.id}).`,
                  )
                }
              >
                <Camera size={15} />
                <span>
                  <strong>{camera.name}</strong>
                  <small>
                    {[camera.location, camera.group_name]
                      .filter(Boolean)
                      .join(" · ") || "No location"}
                  </small>
                </span>
                <CameraStatus status={camera.status} />
              </button>
            ))}
          </div>
        </div>
      )}
      {!!errors.length && <ErrorList errors={errors} />}
      {searchFailed && <SearchRecovery query={userMessage} />}
      {readOnly && (
        <div className="receipt receipt-neutral">
          <Ban size={18} />
          <div>
            <strong>Nothing was changed</strong>
            <p>
              Muse read your workspace but didn’t prepare an action. If you
              expected one, name the cameras or the page, for example a saved
              view named “Everyday” with two of your cameras.
            </p>
          </div>
        </div>
      )}
      <ActionTrace actions={response.actions} />
    </div>
  );
}

/** Server error details, or the failed receipts when a response predates the errors field. */
function errorsOf(response: AgentResponse): Schema["ErrorDetail"][] {
  if (response.errors?.length) return response.errors;
  return response.actions.flatMap((action) =>
    action.status === "failed" ? [action.error] : [],
  );
}

function ResponseStatus({
  status,
  readOnly,
}: {
  status: AgentResponse["status"];
  readOnly: boolean;
}) {
  if (status === "awaiting_confirmation")
    return (
      <Badge tone="amber">
        <Clock3 size={12} />
        Waiting for your approval
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge tone="amber">
        <CircleAlert size={12} />
        Not fully completed
      </Badge>
    );
  return (
    <Badge tone="teal">
      <Check size={12} />
      {readOnly ? "Read your workspace" : "Answered from your workspace"}
    </Badge>
  );
}

/** Past-tense wording for a proposal once the person has decided. */
function decisionLabel(response: AgentResponse) {
  if (response.verified_results?.length) return "You approved this · saved";
  if (response.executed_operations?.length)
    return "You approved this · not verified";
  if (response.status === "failed" && !isDeclined(response))
    return "You approved this · it failed";
  return "You declined · nothing changed";
}
function isDeclined(response: AgentResponse) {
  const errors = errorsOf(response);
  return errors.length > 0 && errors.every((e) => e.code === "USER_DECLINED");
}

/** After approval or decline, the turn's badge reflects the outcome, not the earlier wait. */
function DecisionStatus({ response }: { response: AgentResponse }) {
  if (response.verified_results?.length)
    return (
      <Badge tone="teal">
        <Check size={12} />
        Approved · saved and verified
      </Badge>
    );
  if (response.executed_operations?.length)
    return (
      <Badge tone="amber">
        <CircleAlert size={12} />
        Saved · not verified
      </Badge>
    );
  if (response.status === "failed" && !isDeclined(response))
    return (
      <Badge tone="amber">
        <CircleAlert size={12} />
        Failed · nothing confirmed
      </Badge>
    );
  if (response.status === "completed" || isDeclined(response))
    return (
      <Badge>
        <Ban size={12} />
        Declined · nothing changed
      </Badge>
    );
  return <ResponseStatus status={response.status} readOnly={false} />;
}

/** Typed targets become real same-origin links; unknown kinds render nothing. */
function TargetLink({
  action,
  className,
  children,
}: {
  action: NavigationAction;
  className?: string;
  children: React.ReactNode;
}) {
  const { href, closeMuse } = useWorkspace();
  const destination = targetHref(action.target);
  if (!destination) return null;
  return (
    <Link href={href(destination)} className={className} onClick={closeMuse}>
      {children}
    </Link>
  );
}

function FeatureCard({ action }: { action: NavigationAction }) {
  if (action.target.kind !== "feature" || !targetHref(action.target))
    return null;
  const featureId = action.target.feature_id;
  const meta = destinations.find((item) => item.id === featureId);
  return (
    <div className="muse-action-card">
      <div className="muse-action-heading">
        <span className="feature-icon">
          <Layers2 size={19} />
        </span>
        <strong>{meta?.title ?? action.label}</strong>
      </div>
      {meta && <p>{meta.description}</p>}
      <Button asChild variant="secondary" size="sm">
        <TargetLink action={action}>
          {action.label}
          <ArrowUpRight size={15} />
        </TargetLink>
      </Button>
    </div>
  );
}

function NavigationButton({ action }: { action: NavigationAction }) {
  const Icon =
    action.target.kind === "layout"
      ? Grid2X2
      : action.target.kind === "recording"
        ? Film
        : Video;
  return (
    <TargetLink action={action} className="muse-nav-row">
      <Icon size={16} />
      <span>{action.label}</span>
      <ArrowUpRight size={14} />
    </TargetLink>
  );
}

function SearchMoments({
  moments,
  query,
}: {
  moments: NavigationAction[];
  query: string;
}) {
  const { href, closeMuse, recordings, cameras } = useWorkspace();
  const shown = moments.slice(0, 6);
  // Muse returns only a recording target; name the camera and the real time from workspace data.
  const describe = (recordingId: string, offsetMs: number) => {
    const recording =
      recordings.state === "ready"
        ? recordings.data.find((item) => item.id === recordingId)
        : undefined;
    const camera =
      recording && cameras.state === "ready"
        ? cameras.data.find((item) => item.id === recording.camera_id)
        : undefined;
    const time = recording
      ? new Date(
          Date.parse(recording.started_at) + offsetMs,
        ).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;
    return { camera: camera?.name, time };
  };
  return (
    <div className="muse-section">
      <p className="palette-label">
        {moments.length
          ? `${moments.length} recorded moment${moments.length === 1 ? "" : "s"}`
          : "No indexed moments matched"}
        <span>From stored video indexes</span>
      </p>
      {shown.map((action, index) =>
        action.target.kind === "recording" ? (
          <TargetLink
            key={`${action.target.recording_id}-${action.target.offset_ms}-${index}`}
            className="muse-nav-row"
            action={action}
          >
            <Film size={16} />
            {(() => {
              const { camera, time } = describe(
                action.target.recording_id,
                action.target.offset_ms,
              );
              return (
                <span>
                  {camera
                    ? `${camera}${time ? ` · ${time}` : ""}`
                    : action.label}
                  <small>
                    {camera ? `${action.label} · ` : ""}at{" "}
                    {formatOffset(action.target.offset_ms)} in recording
                  </small>
                </span>
              );
            })()}
            <ArrowUpRight size={14} />
          </TargetLink>
        ) : null,
      )}
      {!moments.length && (
        <p className="muted">
          Only analyzed video can match. An empty result doesn’t mean nothing
          happened.
        </p>
      )}
      <Link
        className="muse-more-link"
        href={href(`/explore?q=${encodeURIComponent(query.slice(0, 2000))}`)}
        onClick={closeMuse}
      >
        <Search size={14} />
        Open video search for captions and coverage
      </Link>
    </div>
  );
}

/** Muse's search step failed; the same stored-index search is still available directly. */
function SearchRecovery({ query }: { query: string }) {
  const { href, closeMuse } = useWorkspace();
  return (
    <div className="muse-section">
      <p className="palette-label">
        Try it another way<span>Same stored video index</span>
      </p>
      <Link
        className="muse-nav-row"
        href={href(`/explore?q=${encodeURIComponent(query.slice(0, 2000))}`)}
        onClick={closeMuse}
      >
        <Search size={16} />
        <span>
          Search your video for these words
          <small>Opens Search with filters, captions and coverage</small>
        </span>
        <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}

function useExpiry(expiresAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
}

function useDecision(
  confirmationId: string,
  onDecision: (response: AgentResponse) => void,
) {
  const { reload } = useWorkspace();
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [base] = useState(() => crypto.randomUUID());
  async function decide(approved: boolean) {
    setPending(approved);
    setError(null);
    try {
      const response = await request<AgentResponse>(
        `/agent/confirmations/${confirmationId}`,
        {
          ...mutationOptions({ approved }, `${base}-${approved}`),
          timeoutMs: 30000,
        },
      );
      onDecision(response);
      if (approved) reload();
    } catch (value) {
      setError(value);
    } finally {
      setPending(null);
    }
  }
  return { decide, pending, error };
}

function LayoutProposalCard({
  proposal,
  decision,
  onDecision,
}: {
  proposal: Schema["LayoutProposal"];
  decision?: AgentResponse;
  onDecision: (response: AgentResponse) => void;
}) {
  const remaining = useExpiry(proposal.confirmation.expires_at);
  const { decide, pending, error } = useDecision(
    proposal.confirmation.id,
    onDecision,
  );
  const { layout } = proposal;
  const rows =
    Math.floor(
      Math.max(...layout.cells.map((cell) => cell.position)) / layout.columns,
    ) + 1;
  const titleId = `proposal-${proposal.confirmation.id}`;
  const expired = remaining <= 0;
  const unavailable = proposal.cameras.filter(
    (camera) => camera.status !== "online",
  );
  const { layouts } = useWorkspace();
  const sameName =
    !decision &&
    layouts.state === "ready" &&
    layouts.data.some(
      (item) =>
        item.name.trim().toLowerCase() === layout.name.trim().toLowerCase(),
    );
  return (
    <section
      className="confirmation-card proposal-card"
      aria-labelledby={titleId}
    >
      {decision ? (
        <Badge>
          <Check size={13} />
          {decisionLabel(decision)}
        </Badge>
      ) : expired ? (
        <Badge>
          <Ban size={13} />
          Expired · nothing changed
        </Badge>
      ) : (
        <Badge tone="amber">
          <ShieldCheck size={13} />
          Awaiting your approval · nothing saved yet
        </Badge>
      )}
      <h4 id={titleId}>
        {decision
          ? `The view “${layout.name}”`
          : `Save the view “${layout.name}”?`}
      </h4>
      <p>{proposal.confirmation.summary}</p>
      <div
        className="proposal-grid"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        }}
        aria-label={`${layout.columns} columns, ${rows} rows`}
        role="img"
      >
        {Array.from({ length: rows * layout.columns }, (_, position) => {
          const cell = layout.cells.find((item) => item.position === position);
          const camera = proposal.cameras.find(
            (item) => item.id === cell?.camera_id,
          );
          return (
            <span key={position} className={cell ? "" : "proposal-empty"}>
              {cell ? (
                <>
                  <strong>{camera?.name ?? "Camera"}</strong>
                  {camera && <CameraStatus status={camera.status} />}
                </>
              ) : (
                "Empty"
              )}
            </span>
          );
        })}
      </div>
      {!!unavailable.length && (
        <p className="muted">
          {unavailable.length === 1
            ? "One camera isn’t"
            : `${unavailable.length} cameras aren’t`}{" "}
          currently connected. Saving the view doesn’t start their video.
        </p>
      )}
      {sameName && (
        <p className="proposal-warning" role="note">
          <CircleAlert size={14} />
          You already have a saved view named “{layout.name}”. Approving adds
          another one; decline if this isn’t what you asked for.
        </p>
      )}
      {decision ? null : (
        <>
          <p className="muted" aria-live="off">
            {expired
              ? "This approval expired. Ask Muse to prepare it again."
              : `Approval applies only to this exact view · expires in ${formatOffset(remaining * 1000)}`}
          </p>
          <div className="button-row">
            <Button
              size="sm"
              disabled={pending !== null || expired}
              onClick={() => void decide(true)}
            >
              {pending === true ? "Saving…" : "Approve and save"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending !== null}
              onClick={() => void decide(false)}
            >
              {pending === false ? "Declining…" : "Decline"}
            </Button>
          </div>
        </>
      )}
      {!!error && (
        <ErrorMessage
          message={errorMessage(error, "The decision couldn’t be saved.")}
          code={error instanceof ApiError ? error.code : undefined}
          requestId={error instanceof ApiError ? error.requestId : undefined}
        />
      )}
    </section>
  );
}

function GenericConfirmation({
  action,
  decided,
  onDecision,
}: {
  action: Extract<ActionResult, { status: "confirmation_required" }>;
  decided: boolean;
  onDecision: (response: AgentResponse) => void;
}) {
  const remaining = useExpiry(action.confirmation.expires_at);
  const { decide, pending, error } = useDecision(
    action.confirmation.id,
    onDecision,
  );
  return (
    <section className="confirmation-card" aria-label="Approval needed">
      <Badge tone="amber">
        <Clock3 size={13} />
        Your approval is needed
      </Badge>
      <h4>Review before continuing</h4>
      <p>{action.confirmation.summary}</p>
      {!decided && (
        <div className="button-row">
          <Button
            size="sm"
            disabled={pending !== null || remaining <= 0}
            onClick={() => void decide(true)}
          >
            Approve action
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending !== null}
            onClick={() => void decide(false)}
          >
            Decline
          </Button>
        </div>
      )}
      {!!error && (
        <ErrorMessage
          message={errorMessage(error, "The decision couldn’t be saved.")}
        />
      )}
    </section>
  );
}

function DecisionResult({ response }: { response: AgentResponse }) {
  const verified = response.verified_results ?? [];
  const executed = response.executed_operations ?? [];
  const failures = errorsOf(response);
  // Declining is the person's choice, not a failure; the server reports it as USER_DECLINED.
  const userDeclined =
    failures.length > 0 &&
    failures.every((error) => error.code === "USER_DECLINED");
  const declined =
    (response.status === "completed" || userDeclined) &&
    !executed.length &&
    !verified.length;
  return (
    <div className="muse-section">
      {verified.map((result) => {
        const action = executed.find(
          (item) => item.tool_call_id === result.tool_call_id,
        )?.navigation;
        return (
          <div className="receipt" key={result.resource_id}>
            <Check size={18} />
            <div>
              <strong>Saved and verified</strong>
              <p>
                “{result.layout.name}” was re-read from the database after
                saving: {result.layout.cells.length} camera
                {result.layout.cells.length === 1 ? "" : "s"},{" "}
                {result.layout.columns} column
                {result.layout.columns === 1 ? "" : "s"}.
              </p>
              {action && (
                <Button asChild size="sm" variant="secondary">
                  <TargetLink action={action}>
                    {action.label}
                    <ArrowUpRight size={14} />
                  </TargetLink>
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {!!executed.length && !verified.length && (
        <div className="receipt receipt-failed">
          <CircleAlert size={18} />
          <div>
            <strong>Saved, but not verified</strong>
            <p>
              The change was committed, but its read-back check didn’t pass.
              Review Saved views before relying on it.
            </p>
          </div>
        </div>
      )}
      {declined && (
        <div className="receipt receipt-neutral">
          <Ban size={18} />
          <div>
            <strong>Nothing was changed</strong>
            <p>
              {userDeclined
                ? failures.map((error) => error.message).join(" ")
                : readableReceipt(response.message)}
            </p>
          </div>
        </div>
      )}
      {response.status === "failed" && !userDeclined && (
        <ErrorList
          errors={
            failures.length
              ? failures
              : [
                  {
                    code: "FAILED",
                    message: response.message,
                    retryable: false,
                  },
                ]
          }
        />
      )}
    </div>
  );
}

function ErrorList({ errors }: { errors: Schema["ErrorDetail"][] }) {
  // Repeated attempts often fail the same way; show each distinct problem once with a count.
  const grouped = errors.reduce<
    { error: Schema["ErrorDetail"]; count: number }[]
  >((all, error) => {
    const same = all.find(
      (item) =>
        item.error.code === error.code && item.error.message === error.message,
    );
    if (same) same.count += 1;
    else all.push({ error, count: 1 });
    return all;
  }, []);
  return (
    <div className="muse-section">
      {grouped.map(({ error, count }, index) => (
        <div
          key={`${error.code}-${index}`}
          className={`receipt ${error.code === "UNSUPPORTED_CAPABILITY" ? "receipt-neutral" : "receipt-failed"}`}
        >
          {error.code === "UNSUPPORTED_CAPABILITY" ? (
            <Ban size={18} />
          ) : (
            <CircleAlert size={18} />
          )}
          <div>
            <strong>
              {error.code === "UNSUPPORTED_CAPABILITY"
                ? "Not something Veyra does"
                : "Part of this didn’t work"}
            </strong>
            <p>{error.message}</p>
            <small className="error-reference">
              {error.code}
              {count > 1 ? ` · happened ${count} times` : ""}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

const toolLabels: Record<string, string> = {
  "capabilities.list": "Checked available capabilities",
  "features.discover": "Looked up features",
  "features.navigate": "Prepared a feature link",
  "cameras.list": "Read your cameras",
  "cameras.status": "Checked a camera’s status",
  "cameras.navigate": "Prepared a camera link",
  "layouts.list": "Read saved views",
  "layouts.get": "Read a saved view",
  "layouts.create": "Proposed a saved view",
  "recordings.list": "Read recordings",
  "recordings.open": "Checked a recording moment",
  "system.status": "Read workspace status",
  "video.search": "Searched indexed video",
};

function ActionTrace({ actions }: { actions: ActionResult[] }) {
  if (!actions.length) return null;
  return (
    <details className="muse-trace">
      <summary>
        What Muse did · {actions.length} step{actions.length === 1 ? "" : "s"}
      </summary>
      <ol>
        {actions.map((action) => (
          <li key={action.tool_call_id}>
            <span>{toolLabels[action.tool_name] ?? action.tool_name}</span>
            <small>
              {action.status === "succeeded"
                ? "Done"
                : action.status === "confirmation_required"
                  ? "Waiting for approval"
                  : `Failed · ${action.error.code}`}
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Preview mode never calls Muse: it only matches words against local destinations. */
function PreviewGuide({ initialQuery }: { initialQuery: string }) {
  const { href, closeMuse } = useWorkspace();
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const suggestions = findDestinations(submitted);
  return (
    <div className="muse-content">
      <div className="muse-context">
        <span>
          <Sparkles size={15} />
          Interaction preview
        </span>
        <Badge tone="blue">Not Muse</Badge>
      </div>
      <div className="muse-scroll">
        {submitted ? (
          <>
            <div className="user-message">{submitted}</div>
            <p className="muse-disclosure">
              <Sparkles size={14} />
              Feature guide preview. This is not a Muse response.
            </p>
            <p className="palette-label">
              Suggested destinations<span>Local feature guide</span>
            </p>
            {suggestions.map((item) => (
              <div className="muse-action-card" key={item.id}>
                <div className="muse-action-heading">
                  <span className="feature-icon">
                    <Layers2 size={19} />
                  </span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.description}</p>
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={href(
                      appRoutes[item.id] +
                        (item.id === "settings" ? "#recording" : ""),
                    )}
                    onClick={closeMuse}
                  >
                    Open{" "}
                    {item.id === "settings"
                      ? "settings"
                      : item.title.toLowerCase()}
                    <ArrowUpRight size={15} />
                  </Link>
                </Button>
              </div>
            ))}
            {!suggestions.length && (
              <p className="muted">
                No feature matched those words. Try “recordings,” “cameras,” or
                “settings.”
              </p>
            )}
          </>
        ) : (
          <div className="muse-welcome">
            <span className="muse-welcome-icon">
              <Sparkles size={25} />
            </span>
            <h3>Preview the assistant</h3>
            <p>
              In preview, a local guide suggests pages. Exit preview to ask the
              real Muse.
            </p>
          </div>
        )}
      </div>
      <form
        className="muse-composer"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query);
        }}
      >
        <label className="sr-only" htmlFor="muse-query">
          Ask Muse
        </label>
        <textarea
          id="muse-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask in your own words…"
          rows={2}
          maxLength={4000}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!query.trim()}
          aria-label="Send message"
        >
          <ArrowUp size={18} />
        </Button>
      </form>
      <p className="composer-note">Preview workspace · no Muse execution.</p>
    </div>
  );
}
