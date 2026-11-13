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
  earlierStagesValidated,
  type AnswerOption,
  type OpenQuestion,
  type ReviewAction,
  type SessionDetail,
  type StageId,
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

type Loaded = { sessionId: string; session: SessionDetail } | { sessionId: string; error: unknown };

/** Loads a session, then renders the workspace. */
export function Workspace({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getSession(sessionId)
      .then((session) => active && setLoaded({ sessionId, session }))
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
  return <WorkspaceView initialSession={loaded.session} />;
}

function WorkspaceView({ initialSession }: { initialSession: SessionDetail }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialSession, initialWorkspaceState);
  const [selectedStage, setSelectedStage] = useState<StageId | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [acting, setActing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { session } = state;
  const stage = selectedStage ?? session.currentStage;
  const stageState = session.stages.find((candidate) => candidate.stage === stage)!;

  useEffect(() => () => abortRef.current?.abort(), []);

  async function refresh() {
    try {
      dispatch({ type: "session.replaced", session: await api.getSession(session.id) });
    } catch (error) {
      setActionError(error);
    }
  }

  async function sendMessage(message: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setSelectedStage(null);
    dispatch({
      type: "turn.submitted",
      message: {
        id: `local-${crypto.randomUUID()}`,
        role: "user",
        content: message,
        stage: session.currentStage,
        createdAt: new Date().toISOString(),
      },
    });
    let completed = false;
    try {
      for await (const event of api.sendMessage(session.id, message, controller.signal)) {
        dispatch({ type: "turn.event", event });
        if (event.type === "turn.completed" || event.type === "error") {
          completed = true;
        }
      }
      if (!completed) {
        dispatch({ type: "turn.closed" });
        await refresh();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch({ type: "turn.failed", error: errorToFailure(error) });
      }
    }
  }

  async function act(run: () => Promise<SessionDetail>, resetSelection = false): Promise<boolean> {
    setActing(true);
    try {
      dispatch({ type: "session.replaced", session: await run() });
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
  const blockedReason = session.archived
    ? "This session is archived and read-only."
    : session.pendingReview
      ? `${STAGE_LABELS[session.pendingReview.stage]} is waiting for your review. Approve it or request changes first.`
      : null;
  const questions = session.openQuestions.filter(
    (question) => question.stage === session.currentStage,
  );

  function answer(question: OpenQuestion, option: AnswerOption) {
    void sendMessage(`${question.question} ${option.label}.`);
  }

  async function review(target: StageId, action: ReviewAction, note?: string) {
    await act(() => api.submitReview(session.id, { stage: target, action, note }), true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/sessions" className="text-sm text-muted-foreground hover:underline">
          Sessions
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="flex-1 truncate font-semibold">{session.title}</h1>
        {session.archived ? <Badge variant="outline">Archived</Badge> : null}
        <Badge variant="secondary">Current: {STAGE_LABELS[session.currentStage]}</Badge>
        <ExportMenu sessionId={session.id} />
      </div>
      <ReviewBar
        pendingReview={session.pendingReview}
        selected={stageState}
        earlierValidated={earlierStagesValidated(session.stages, stage)}
        disabled={busy || session.archived}
        onReview={review}
        onReopen={async (target) => {
          await act(() => api.reopenStage(session.id, target), true);
        }}
      />
      {actionError ? (
        <div className="px-4 pt-2">
          <ErrorState error={actionError} />
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_440px]">
        <aside className="flex flex-col gap-4 overflow-y-auto border-r p-3">
          <StageStepper
            stages={session.stages}
            currentStage={session.currentStage}
            selected={stage}
            onSelect={(next) => setSelectedStage(next === session.currentStage ? null : next)}
          />
          <StageDetails
            stage={stageState}
            readOnly={busy || session.archived}
            onEditField={(field, value) =>
              act(() => api.updateField(session.id, stage, field, value))
            }
          />
        </aside>
        <section className="flex min-h-[60vh] flex-col" aria-label="Conversation">
          <ChatPanel
            messages={session.messages}
            streaming={state.streaming}
            error={state.turnError}
            blockedReason={blockedReason}
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
                sessionId={session.id}
                stage={stage}
                revision={state.documentRevision}
                comments={session.comments}
                readOnly={busy || session.archived}
                onComment={(section, body) =>
                  act(() => api.addComment(session.id, { stage, section, body }))
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
              <DeliveryView sessionId={session.id} revision={state.documentRevision} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
