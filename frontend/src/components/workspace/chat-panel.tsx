"use client";

import {
  ListIcon,
  ListOrderedIcon,
  ListPlusIcon,
  LoaderCircleIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { memo, useEffect, useRef, type KeyboardEvent } from "react";

import { ErrorState } from "@/components/error-state";
import { Markdown } from "@/components/markdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { StreamingTurn, TurnFailure } from "./state";
import { continueList, toggleList, type ListKind, type TextEdit } from "./list-input";
import { failureToError } from "./turn";
import type { QueuedMessage } from "./turn-queue";
import type { ChatMessage } from "./view-model";

export function ChatPanel({
  messages,
  streaming,
  error,
  blockedReason,
  pending,
  running,
  queue,
  draft,
  onDraftChange,
  onSend,
  onSendQueue,
  onRemoveQueued,
}: {
  messages: ChatMessage[];
  streaming: StreamingTurn | null;
  error: TurnFailure | null;
  /** Why sending is disabled (pending review, archived session). */
  blockedReason: string | null;
  /** Another workspace action is being saved: its snapshot must land first. */
  pending: boolean;
  /** A turn is running: a sent message joins the queue. */
  running: boolean;
  queue: QueuedMessage[];
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (message: string) => void;
  onSendQueue: () => void;
  onRemoveQueued: (id: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Follow new text only while the reader is at the bottom, so they can scroll up mid-reply.
  const followRef = useRef(true);
  const userMessages = messages.filter((message) => message.role === "user").length;
  const userMessagesRef = useRef(userMessages);

  // A new question from the user (composer or open questions panel) follows its reply again.
  useEffect(() => {
    if (userMessages > userMessagesRef.current) {
      followRef.current = true;
    }
    userMessagesRef.current = userMessages;
  }, [userMessages]);

  useEffect(() => {
    if (followRef.current) {
      endRef.current?.scrollIntoView?.({ block: "end" });
    }
  }, [messages.length, streaming?.text]);

  const canSend = !pending && blockedReason === null && draft.trim().length > 0;

  function submit() {
    if (!canSend) {
      return;
    }
    onSend(draft.trim());
  }

  function apply(edit: TextEdit) {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.setRangeText(edit.text, edit.start, edit.end, edit.select ? "select" : "end");
    onDraftChange(input.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    const edit = continueList(value, selectionStart, selectionEnd);
    if (edit) {
      apply(edit);
    } else {
      submit();
    }
  }

  function list(kind: ListKind) {
    const input = inputRef.current;
    if (input) {
      apply(toggleList(input.value, input.selectionStart, input.selectionEnd, kind));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
        aria-live="polite"
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          followRef.current = scrollHeight - scrollTop - clientHeight < 40;
        }}
      >
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
        {queue.length > 0 ? (
          <section
            aria-label="Waiting answers"
            className="flex flex-col gap-1 rounded-xl border border-dashed p-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <p>
                {running
                  ? "Queued: sent together when the current turn ends."
                  : "Not sent yet: check these messages, then send or remove them."}
              </p>
              {running ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || blockedReason !== null}
                  onClick={onSendQueue}
                >
                  Send now
                </Button>
              )}
            </div>
            <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
              {queue.map((item) => (
                <li key={item.id} className="flex items-start gap-1">
                  <p className="flex-1 whitespace-pre-wrap">{item.content}</p>
                  {running && item.held ? (
                    <span className="text-muted-foreground">Kept</span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove from queue"
                    title="Remove from queue"
                    onClick={() => onRemoveQueued(item.id)}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Bulleted list"
              title="Bulleted list"
              disabled={blockedReason !== null}
              onClick={() => list("bullet")}
            >
              <ListIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Numbered list"
              title="Numbered list"
              disabled={blockedReason !== null}
              onClick={() => list("numbered")}
            >
              <ListOrderedIcon />
            </Button>
          </div>
          <Textarea
            ref={inputRef}
            aria-label="Message"
            placeholder="Answer the agent or add context…"
            value={draft}
            rows={2}
            disabled={blockedReason !== null}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button
            type="submit"
            disabled={!canSend}
            aria-label={running ? "Queue" : "Send"}
            title={running ? "Queue until the current turn ends" : undefined}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : running ? (
              <ListPlusIcon />
            ) : (
              <SendIcon />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  role,
  content,
}: {
  role: ChatMessage["role"];
  content: string;
}) {
  return (
    <div
      data-role={role}
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm",
        role === "user"
          ? "self-end bg-primary whitespace-pre-wrap text-primary-foreground"
          : "self-start bg-muted",
      )}
    >
      {/* Assistant replies are Markdown; user input stays the literal text that was typed. */}
      {role === "assistant" ? (
        <Markdown className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">{content}</Markdown>
      ) : (
        content
      )}
    </div>
  );
});
