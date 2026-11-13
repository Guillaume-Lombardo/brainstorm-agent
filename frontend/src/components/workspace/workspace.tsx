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
import { DeliveryView } from "./delivery-view";
import { DocumentPanel } from "./document-panel";
import { ExportMenu } from "./export-menu";
import { OpenQuestions } from "./open-questions";
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
        className="grid flex-1 grid-cols-[260px_1fr_420px] gap-4 p-4"
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

function WorkspaceView({ initialSnapshot }: { initialSnapshot: SessionSnapshot }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialSnapshot, initialWorkspaceState);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [acting, setActing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
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
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_440px] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 overflow-y-auto border-r p-3">
          <StageStepper
            session={session}
            selected={stage}
            onSelect={(next) => setSelectedStage(next === session.current_stage ? null : next)}
          />
          <StageDetails
            session={session}
            stage={stage}
            readOnly={busy || archived}
            onEditField={(field, value) => act(() => api.editField(sessionId, stage, field, value))}
          />
        </aside>
        <section className="flex min-h-[60vh] flex-col lg:min-h-0" aria-label="Conversation">
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
        <aside className="min-h-0 overflow-y-auto border-l">
          <Tabs defaultValue="document">
            <TabsList className="m-3">
              <TabsTrigger value="document">Document</TabsTrigger>
              <TabsTrigger value="questions">
                Questions
                {questions.length > 0 ? <Badge className="ml-1">{questions.length}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
            </TabsList>
            <TabsContent value="document">
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
            <TabsContent value="questions">
              <OpenQuestions
                questions={questions}
                disabled={busy || blockedReason !== null}
                onAnswer={answer}
              />
            </TabsContent>
            <TabsContent value="delivery">
              <DeliveryView session={session} revision={state.documentRevision} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
