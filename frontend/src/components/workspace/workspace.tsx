"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import {
  STAGE_LABELS,
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
import { answerMessage, currentQuestions } from "./view-model";

type Loaded =
  { sessionId: string; snapshot: SessionSnapshot } | { sessionId: string; error: unknown };

/** Loads a session, then renders the workspace. */
export function Workspace({ sessionId }: { sessionId: string }) {
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
      <div
        className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)_440px]"
        aria-label="Loading workspace"
      >
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
      </div>
    );
  }
  if ("error" in loaded) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
        <ErrorState error={loaded.error} />
        <Link href="/sessions" className="text-sm underline">
          Back to sessions
        </Link>
      </div>
    );
  }
  return <WorkspaceView initialSnapshot={loaded.snapshot} />;
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
  const [state, dispatch] = useReducer(workspaceReducer, initialSnapshot, initialWorkspaceState);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [acting, setActing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [stagesColumn, documentColumn] = useSideColumns(gridRef, STAGES_COLUMN, DOCUMENT_COLUMN);
  const { session } = state;
  const sessionId = session.session_id;
  const stage = selectedStage ?? session.current_stage;

  useEffect(() => () => abortRef.current?.abort(), []);

  async function refresh() {
    try {
      dispatch({ type: "snapshot.loaded", snapshot: await api.getSession(sessionId) });
    } catch (error) {
      setActionError(error);
    }
  }

  async function sendMessage(message: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setSelectedStage(null);
    setActionError(null);
    dispatch({
      type: "turn.submitted",
      message: { id: `local-${crypto.randomUUID()}`, role: "user", content: message },
    });
    let terminal: "completed" | "failed" | null = null;
    try {
      for await (const event of api.sendMessage(sessionId, message, controller.signal)) {
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
        await refresh();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch({ type: "turn.failed", error: errorToFailure(error) });
      }
    }
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

  const busy = state.streaming !== null || acting;
  const pendingReview = session.pending_human_review ?? null;
  const archived = session.archived === true;
  const blockedReason = archived
    ? "This session is archived and read-only."
    : pendingReview
      ? `${STAGE_LABELS[pendingReview.from_stage]} is waiting for your review. Approve it or request changes first.`
      : null;
  const questions = currentQuestions(session);

  function answer(question: OpenQuestionItem, option: string) {
    void sendMessage(answerMessage(question, option));
  }

  async function review(target: Stage, action: ReviewAction, note?: string) {
    await act(() => api.submitReview(sessionId, { stage: target, action, note }), true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/sessions" className="text-sm text-muted-foreground hover:underline">
          Sessions
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="flex-1 truncate font-semibold">{session.title}</h1>
        {archived ? <Badge variant="outline">Archived</Badge> : null}
        <Badge variant="secondary">Current: {STAGE_LABELS[session.current_stage]}</Badge>
        <ExportMenu sessionId={sessionId} />
      </div>
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
        <div className="px-4 pt-2">
          <ErrorState error={actionError} />
        </div>
      ) : null}
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)]"
      >
        <CollapsibleColumn side="left" name="stages" panelId="stages-panel" layout={stagesColumn}>
          <p
            aria-hidden
            className="mt-3 hidden h-8 shrink-0 items-center px-5 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:flex"
          >
            Stages
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 lg:pt-4">
            <StageStepper
              session={session}
              selected={stage}
              onSelect={(next) => setSelectedStage(next === session.current_stage ? null : next)}
            />
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
        <section className="flex min-h-[60vh] flex-col lg:min-h-0" aria-label="Conversation">
          <ResearchPanel
            sessionId={sessionId}
            available={session.current_stage !== "stage_0_pitch"}
            disabled={busy || archived}
            onChanged={refresh}
          />
          <ChatPanel
            messages={state.messages}
            streaming={state.streaming}
            error={state.turnError}
            blockedReason={blockedReason}
            pending={acting}
            draft={state.draft}
            onDraftChange={(draft) => dispatch({ type: "draft.changed", draft })}
            onSend={(message) => void sendMessage(message)}
          />
        </section>
        <CollapsibleColumn
          side="right"
          name="document"
          panelId="document-panel"
          layout={documentColumn}
        >
          {/* Only the tab content scrolls: the tab row stays clear of the collapse toggle. */}
          <Tabs defaultValue="document" className="min-h-0 flex-1">
            <TabsList className="m-3 shrink-0 lg:ml-12">
              <TabsTrigger value="document">Document</TabsTrigger>
              <TabsTrigger value="questions">
                Questions
                {questions.length > 0 ? <Badge className="ml-1">{questions.length}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
            </TabsList>
            <TabsContent value="document" className="min-h-0 overflow-y-auto">
              <DocumentPanel
                sessionId={sessionId}
                stage={stage}
                revision={state.documentRevision}
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
                disabled={busy || blockedReason !== null}
                onAnswer={answer}
              />
            </TabsContent>
            <TabsContent value="delivery" className="min-h-0 overflow-y-auto">
              <DeliveryView session={session} revision={state.documentRevision} />
            </TabsContent>
          </Tabs>
        </CollapsibleColumn>
      </div>
    </div>
  );
}
