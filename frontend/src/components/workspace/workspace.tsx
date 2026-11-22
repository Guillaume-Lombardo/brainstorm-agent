"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { useMessages } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import {
  type OpenQuestionItem,
  type ReviewAction,
  type SessionOverview,
  type SessionSnapshot,
  type Stage,
} from "@/lib/backend/types";

import { ChatPanel } from "./chat-panel";
import { CollapsibleColumn } from "./collapsible-column";
import { useSideColumns, type ColumnSpec } from "./column-layout";
import { DeliveryView } from "./delivery-view";
import { DocumentPanel } from "./document-panel";
import { ExportMenu } from "./export-menu";
import { OpenQuestions } from "./open-questions";
import { ResearchPanel } from "./research-panel";
import { ReviewBar } from "./review-bar";
import { StageDetails } from "./stage-details";
import { StageStepper } from "./stage-stepper";
import { initialWorkspaceState, workspaceReducer } from "./state";
import { errorToFailure } from "./turn";
import { acceptsNext, mergeQueue, queuedQuestionIds, useTurnQueue } from "./turn-queue";
import { answerMessage, canOpen, currentQuestions, lastUserTurnId } from "./view-model";

/** What a turn starts from: a message, or the assistant opening a new stage. */
type TurnInput = { message: string; stage: Stage } | { opening: Stage };

/** Tabs of the document column. */
const TABS = ["document", "questions", "delivery"] as const;
const PANEL_LINK =
  "flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground";

type Loaded =
  { sessionId: string; snapshot: SessionSnapshot } | { sessionId: string; error: unknown };

/** Loads a session, then renders the workspace. */
export function Workspace({ sessionId }: { sessionId: string }) {
  const t = useMessages().workspace;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getSession(sessionId)
      .then((snapshot) => active && setLoaded({ sessionId, snapshot }))
      .catch((error: unknown) => active && setLoaded({ sessionId, error }));
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (!loaded || loaded.sessionId !== sessionId) {
    return (
      <>
        <WorkspaceHeader />
        <div
          className="grid flex-1 grid-cols-1 gap-3 px-3 pb-3 lg:grid-cols-[242px_minmax(0,1fr)_422px]"
          aria-label={t.loading}
        >
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
        </div>
      </>
    );
  }
  if ("error" in loaded) {
    return (
      <>
        <WorkspaceHeader />
        <ErrorState error={loaded.error} className="mx-auto w-full max-w-xl" />
      </>
    );
  }
  return <WorkspaceView initialSnapshot={loaded.snapshot} />;
}

/** Way back to the sessions, title and actions of the session. */
function WorkspaceHeader({ title, children }: { title?: string; children?: ReactNode }) {
  const t = useMessages().sessions;
  return (
    <AppHeader>
      <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-0">
        <Link href="/sessions" className="shrink-0 text-muted-foreground hover:text-foreground">
          {t.title}
        </Link>
        {title ? (
          <>
            <span aria-hidden className="text-muted-foreground">
              /
            </span>
            <h1 className="truncate text-[15px] font-semibold">{title}</h1>
          </>
        ) : null}
      </div>
      {children}
    </AppHeader>
  );
}

const STAGES_COLUMN: ColumnSpec = {
  storageKey: "workspace.stages-sidebar",
  defaultWidth: 260,
  minWidth: 200,
  maxWidth: 480,
};
const DOCUMENT_COLUMN: ColumnSpec = {
  storageKey: "workspace.document-panel",
  defaultWidth: 440,
  minWidth: 320,
  maxWidth: 800,
};

function WorkspaceView({ initialSnapshot }: { initialSnapshot: SessionSnapshot }) {
  const t = useMessages();
  const [state, dispatch] = useReducer(workspaceReducer, initialSnapshot, initialWorkspaceState);
  const [tab, setTab] = useState<(typeof TABS)[number]>("document");
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [acting, setActing] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  /** Questions answered by the running turn; the stored state drops them when it ends. */
  const [answeringIds, setAnsweringIds] = useState<string[]>([]);
  const { queue, add, remove, take, hold } = useTurnQueue();
  const storedTurnRef = useRef(lastUserTurnId(initialSnapshot.messages));
  const abortRef = useRef<AbortController | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [stagesColumn, documentColumn] = useSideColumns(gridRef, STAGES_COLUMN, DOCUMENT_COLUMN);
  const { session } = state;
  const sessionId = session.session_id;
  const stage = selectedStage ?? session.current_stage;

  useEffect(() => () => abortRef.current?.abort(), []);

  async function refresh(): Promise<SessionOverview | null> {
    try {
      const snapshot = await api.getSession(sessionId);
      storedTurnRef.current = lastUserTurnId(snapshot.messages);
      dispatch({ type: "snapshot.loaded", snapshot });
      return snapshot.session;
    } catch (error) {
      setActionError(error);
      return null;
    }
  }

  /** Runs one turn; returns the stored session only after a completed turn. */
  async function runTurn(input: TurnInput): Promise<SessionOverview | null> {
    const controller = new AbortController();
    abortRef.current = controller;
    const previousTurn = storedTurnRef.current;
    setActionError(null);
    if ("opening" in input) {
      dispatch({ type: "opening.started" });
    } else {
      dispatch({
        type: "turn.submitted",
        message: {
          id: `local-${crypto.randomUUID()}`,
          role: "user",
          content: input.message,
          stage: input.stage,
        },
      });
    }
    let terminal: "completed" | "failed" | null = null;
    try {
      const events =
        "opening" in input
          ? api.openStage(sessionId, input.opening, controller.signal)
          : api.sendMessage(sessionId, input.message, controller.signal);
      for await (const event of events) {
        dispatch({ type: "turn.event", event });
        if (event.type === "turn.completed") {
          terminal = "completed";
        } else if (event.type === "error") {
          terminal = "failed";
        }
      }
      if (terminal === null) {
        dispatch({ type: "turn.closed" });
      }
      if (terminal !== "failed") {
        // Questions, completed stages and message ids are only final in the stored state.
        const stored = await refresh();
        if (terminal === "completed") {
          return controller.signal.aborted ? null : stored;
        }
        if ("message" in input && storedTurnRef.current === previousTurn) {
          // The backend kept nothing, or could not say so: do not lose the text.
          dispatch({ type: "draft.restored", content: input.message });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch({ type: "turn.failed", error: errorToFailure(error) });
        if ("opening" in input) {
          // Refused when it already started, from another tab for instance: show that state.
          await refresh();
        }
      }
    }
    return null;
  }

  /**
   * Runs a turn, then one more while it is safe to: the opening of the stage the session
   * moved to, or whatever was queued meanwhile.
   */
  async function runTurns(input: TurnInput, questionIds: string[] = []) {
    runningRef.current = true;
    setRunning(true);
    let next: TurnInput | null = input;
    let answering = questionIds;
    while (next !== null) {
      setAnsweringIds(answering);
      const turn: TurnInput = next;
      const turnStage: Stage = "opening" in turn ? turn.opening : turn.stage;
      const stored = await runTurn(turn);
      next = null;
      if (stored && "message" in turn && canOpen(stored)) {
        // Queued answers were about the previous stage: they wait for the user.
        hold();
        next = { opening: stored.current_stage };
        answering = [];
      } else if (stored && acceptsNext(stored, turnStage)) {
        const taken = take({ held: false });
        if (taken.length > 0) {
          next = { message: mergeQueue(taken), stage: turnStage };
          answering = queuedQuestionIds(taken);
        }
      }
    }
    // A failed turn, a review or a stage change leaves the queue to the user.
    hold();
    setAnsweringIds([]);
    runningRef.current = false;
    setRunning(false);
  }

  function sendMessage(message: string, questionId?: string) {
    if (runningRef.current) {
      add({ content: message, questionId });
      return;
    }
    setSelectedStage(null);
    void runTurns({ message, stage: session.current_stage }, questionId ? [questionId] : []);
  }

  function sendQueue() {
    if (runningRef.current || queue.length === 0) {
      return;
    }
    const taken = take();
    setSelectedStage(null);
    void runTurns(
      { message: mergeQueue(taken), stage: session.current_stage },
      queuedQuestionIds(taken),
    );
  }

  async function act(run: () => Promise<SessionOverview>, resetSelection = false) {
    setActing(true);
    try {
      dispatch({ type: "session.updated", session: await run() });
      setActionError(null);
      if (resetSelection) {
        setSelectedStage(null);
      }
      return true;
    } catch (error) {
      setActionError(error);
      return false;
    } finally {
      setActing(false);
    }
  }

  const busy = running || acting;
  const pendingReview = session.pending_human_review ?? null;
  const archived = session.archived === true;
  const blockedReason = archived
    ? t.workspace.blocked.archived
    : pendingReview
      ? t.workspace.blocked.review
      : null;
  const questions = currentQuestions(session, [...answeringIds, ...queuedQuestionIds(queue)]);

  function answer(question: OpenQuestionItem, option: string) {
    sendMessage(answerMessage(question, option), question.id);
  }

  async function review(target: Stage, action: ReviewAction, note?: string) {
    let reviewed: SessionOverview | null = null;
    await act(async () => {
      reviewed = await api.submitReview(sessionId, { stage: target, action, note });
      return reviewed;
    }, true);
    openStage(reviewed);
  }

  /** Lets the assistant start the current stage when nobody worked on it yet. */
  function openStage(current: SessionOverview | null) {
    if (current && canOpen(current) && !runningRef.current) {
      setSelectedStage(null);
      void runTurns({ opening: current.current_stage });
    }
  }

  return (
    <>
      <WorkspaceHeader title={session.title}>
        {archived ? <Badge>{t.workspace.archived}</Badge> : null}
        <ExportMenu sessionId={sessionId} />
      </WorkspaceHeader>
      <ReviewBar
        session={session}
        selected={stage}
        disabled={busy || archived}
        onReview={review}
        onReopen={async (target) => {
          await act(() => api.reopenStage(sessionId, target), true);
        }}
      />
      {actionError ? (
        <div className="px-3 pb-3">
          <ErrorState error={actionError} />
        </div>
      ) : null}
      {/* The panels stack below the conversation on small screens. */}
      <nav aria-label={t.workspace.panels} className="flex gap-1 px-2 pb-2 lg:hidden">
        <a href="#stages-panel" className={PANEL_LINK}>
          {t.workspace.stagesPanel}
        </a>
        {TABS.map((id) => (
          <a key={id} href="#document-panel" className={PANEL_LINK} onClick={() => setTab(id)}>
            {t.workspace.tabs[id]}
            {id === "questions" && questions.length > 0 ? (
              <Badge variant="accent">{questions.length}</Badge>
            ) : null}
          </a>
        ))}
      </nav>
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)]"
      >
        <CollapsibleColumn side="left" name="stages" panelId="stages-panel" layout={stagesColumn}>
          <p
            aria-hidden
            className="flex h-10 shrink-0 items-center px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {t.workspace.stagesPanel}
          </p>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="px-1.5 pb-2">
              <StageStepper
                session={session}
                selected={stage}
                onSelect={(next) => setSelectedStage(next === session.current_stage ? null : next)}
              />
            </div>
            <StageDetails
              session={session}
              stage={stage}
              readOnly={busy || archived}
              onEditField={(field, value) =>
                act(() => api.editField(sessionId, stage, field, value))
              }
            />
          </div>
        </CollapsibleColumn>
        <section
          className="order-first flex min-h-0 flex-col px-3 pb-3 lg:order-none lg:px-1.5"
          aria-label={t.workspace.conversation}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            <ResearchPanel
              sessionId={sessionId}
              available={session.current_stage !== "stage_0_pitch"}
              disabled={busy || archived}
              onChanged={async () => {
                await refresh();
              }}
            />
            <ChatPanel
              messages={state.messages}
              stage={session.current_stage}
              streaming={state.streaming}
              error={state.turnError}
              blockedReason={blockedReason}
              pending={acting}
              running={running}
              queue={queue}
              draft={state.draft}
              onDraftChange={(draft) => dispatch({ type: "draft.changed", draft })}
              onSend={(message) => {
                dispatch({ type: "draft.changed", draft: "" });
                sendMessage(message);
              }}
              onSendQueue={sendQueue}
              onStart={canOpen(session) ? () => openStage(session) : null}
              onRemoveQueued={remove}
            />
          </div>
        </section>
        <CollapsibleColumn
          side="right"
          name="document"
          panelId="document-panel"
          layout={documentColumn}
        >
          {/* Only the tab content scrolls: the tab row stays clear of the collapse toggle. */}
          <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
            <TabsList className="lg:pl-9">
              {TABS.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {t.workspace.tabs[id]}
                  {id === "questions" && questions.length > 0 ? (
                    <Badge variant="accent">{questions.length}</Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="document" className="min-h-0 overflow-y-auto">
              <DocumentPanel
                sessionId={sessionId}
                stage={stage}
                revision={state.documentRevision}
                asked={stage === session.current_stage}
                comments={session.comments ?? []}
                readOnly={busy || archived}
                onComment={(section, body) =>
                  act(() => api.addComment(sessionId, { stage, section, body }))
                }
              />
            </TabsContent>
            <TabsContent value="questions" className="min-h-0 overflow-y-auto">
              <OpenQuestions
                questions={questions}
                disabled={acting || blockedReason !== null}
                queueing={running}
                onAnswer={answer}
              />
            </TabsContent>
            <TabsContent value="delivery" className="min-h-0 overflow-y-auto">
              <DeliveryView session={session} revision={state.documentRevision} />
            </TabsContent>
          </Tabs>
        </CollapsibleColumn>
      </div>
    </>
  );
}
