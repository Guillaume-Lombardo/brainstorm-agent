"use client";

import { LoaderCircleIcon, SendIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { ErrorState } from "@/components/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

import type { StreamingTurn, TurnFailure } from "./state";
import { failureToError } from "./turn";

export function ChatPanel({
  messages,
  streaming,
  error,
  blockedReason,
  draft,
  onDraftChange,
  onSend,
}: {
  messages: ChatMessage[];
  streaming: StreamingTurn | null;
  error: TurnFailure | null;
  /** Why sending is disabled (pending review, archived session). */
  blockedReason: string | null;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (message: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, streaming?.text]);

  const busy = streaming !== null;
  const canSend = !busy && blockedReason === null && draft.trim().length > 0;

  function submit() {
    if (!canSend) {
      return;
    }
    onSend(draft.trim());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && !streaming ? (
          <p className="m-auto text-sm text-muted-foreground">
            No message yet. Pitch your project.
          </p>
        ) : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} content={message.content} />
        ))}
        {streaming ? (
          <div className="flex flex-col gap-1" data-testid="streaming-turn">
            {streaming.status ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <LoaderCircleIcon className="size-3 animate-spin" aria-hidden />
                {streaming.status}
              </p>
            ) : null}
            {streaming.text ? <MessageBubble role="assistant" content={streaming.text} /> : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="flex flex-col gap-2 border-t p-3">
        {error ? <ErrorState error={failureToError(error)} /> : null}
        {blockedReason ? (
          <Alert>
            <AlertTitle>Input paused</AlertTitle>
            <AlertDescription>{blockedReason}</AlertDescription>
          </Alert>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Textarea
            aria-label="Message"
            placeholder="Answer the agent or add context…"
            value={draft}
            rows={2}
            disabled={blockedReason !== null}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <Button type="submit" disabled={!canSend} aria-label="Send">
            {busy ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: ChatMessage["role"]; content: string }) {
  return (
    <div
      data-role={role}
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
        role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
      )}
    >
      {content.replace(/\*\*(.+?)\*\*/g, "$1")}
    </div>
  );
}
