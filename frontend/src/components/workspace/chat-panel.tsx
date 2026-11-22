"use client";

import { ListPlusIcon, LoaderCircleIcon, PlayIcon, SendIcon, XIcon } from "lucide-react";
import { Fragment, memo, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";

import { ErrorState } from "@/components/error-state";
import { Markdown } from "@/components/markdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Stage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

import type { StreamingTurn, TurnFailure } from "./state";
import { continueList, detectList, indentItem, type TextEdit } from "./list-input";
import { StageDivider } from "./stage-divider";
import { failureToError } from "./turn";
import type { QueuedMessage } from "./turn-queue";
import type { ChatMessage } from "./view-model";

export function ChatPanel({
  messages,
  stage,
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
  onStart = null,
}: {
  messages: ChatMessage[];
  /** Current stage of the session. */
  stage: Stage;
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
  /** Lets the assistant start the current stage, when it did not yet. */
  onStart?: (() => void) | null;
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
  }, [messages.length, stage, streaming?.text]);

  const lastStage = messages.at(-1)?.stage;
  const stageChange =
    lastStage && lastStage !== stage ? <StageDivider from={lastStage} to={stage} /> : null;
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
    input.setRangeText(edit.text, edit.start, edit.end, "end");
    if (edit.caretFromEnd) {
      const caret = edit.start + edit.text.length - edit.caretFromEnd;
      input.setSelectionRange(caret, caret);
    }
    onDraftChange(input.value);
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { value, selectionStart } = event.target;
    onDraftChange(value);
    // Typing only: a pasted or deleted text is left as it is.
    const typed = (event.nativeEvent as InputEvent).inputType === "insertText";
    const edit = typed ? detectList(value, selectionStart) : null;
    if (edit) {
      apply(edit);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    if (event.key === "Tab" && selectionStart === selectionEnd) {
      // Outside a list, Tab keeps moving the focus.
      const edit = indentItem(value, selectionStart, event.shiftKey ? -1 : 1);
      if (edit) {
        event.preventDefault();
        apply(edit);
      }
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    const edit = continueList(value, selectionStart, selectionEnd);
    if (edit) {
      apply(edit);
    } else {
      submit();
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
        {messages.map((message, index) => {
          const previous = messages[index - 1]?.stage ?? message.stage;
          return (
            <Fragment key={message.id}>
              {previous === message.stage ? null : (
                <StageDivider from={previous} to={message.stage} />
              )}
              <MessageBubble role={message.role} content={message.content} />
            </Fragment>
          );
        })}
        {/* A reply still streaming belongs to the stage it answers, unless it opens the new one. */}
        {streaming?.opening ? stageChange : null}
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
        {streaming?.opening ? null : stageChange}
        {onStart && !running && !pending ? (
          <Button type="button" variant="outline" className="self-center" onClick={onStart}>
            <PlayIcon />
            Start this stage
          </Button>
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
                {running && queue.some((item) => !item.held)
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
          <Textarea
            ref={inputRef}
            aria-label="Message"
            placeholder="Answer the agent or add context…"
            value={draft}
            rows={2}
            disabled={blockedReason !== null}
            onChange={onChange}
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
