"use client";

import { ListPlusIcon, LoaderCircleIcon, PlayIcon, SendIcon, XIcon } from "lucide-react";
import { Fragment, memo, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";

import { ErrorState } from "@/components/error-state";
import { Markdown } from "@/components/markdown";
import { useMessages } from "@/components/preferences/provider";
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

/** Scrolls the conversation alone: on phones the page around it scrolls too. */
function scrollToEnd(log: HTMLElement | null) {
  log?.scrollTo?.({ top: log.scrollHeight });
}

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
  const t = useMessages().chat;
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Follow new text only while the reader is at the bottom, so they can scroll up mid-reply.
  const followRef = useRef(true);
  const scrollTopRef = useRef(0);
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
      scrollToEnd(logRef.current);
    }
  }, [messages.length, stage, streaming?.text]);

  // The panels around the conversation open, close and load: its end stays in view.
  useEffect(() => {
    const log = logRef.current;
    if (!log || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => followRef.current && scrollToEnd(log));
    observer.observe(log);
    return () => observer.disconnect();
  }, []);

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
      {/* On phones the log leaves room for the header, the panel links and the composer. */}
      <div
        ref={logRef}
        className="flex h-[calc(100dvh-17rem)] min-h-60 flex-col gap-3 overflow-y-auto px-5 py-4 lg:h-auto lg:min-h-0 lg:flex-1"
        aria-live="polite"
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          if (scrollHeight - scrollTop - clientHeight < 40) {
            followRef.current = true;
          } else if (scrollTop < scrollTopRef.current) {
            // Only the reader scrolls up; a panel opening above just shrinks the log.
            followRef.current = false;
          }
          scrollTopRef.current = scrollTop;
        }}
      >
        {messages.length === 0 && !streaming ? (
          <p className="m-auto text-muted-foreground">{t.empty}</p>
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
                {t.status[streaming.status]}
              </p>
            ) : null}
            {streaming.text ? <MessageBubble role="assistant" content={streaming.text} /> : null}
          </div>
        ) : null}
        {streaming?.opening ? null : stageChange}
        {onStart && !running && !pending ? (
          <Button type="button" variant="outline" className="self-center" onClick={onStart}>
            <PlayIcon />
            {t.start}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 border-t p-3">
        {error ? <ErrorState error={failureToError(error)} /> : null}
        {queue.length > 0 ? (
          <section
            aria-label={t.waiting}
            className="flex flex-col gap-1 rounded-md border border-dashed p-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <p>{running && queue.some((item) => !item.held) ? t.queued : t.unsent}</p>
              {running ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || blockedReason !== null}
                  onClick={onSendQueue}
                >
                  {t.sendNow}
                </Button>
              )}
            </div>
            <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
              {queue.map((item) => (
                <li key={item.id} className="flex items-start gap-1">
                  <p className="flex-1 whitespace-pre-wrap">{item.content}</p>
                  {running && item.held ? (
                    <span className="text-muted-foreground">{t.kept}</span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.remove}
                    title={t.remove}
                    onClick={() => onRemoveQueued(item.id)}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {blockedReason === null ? null : (
          // The placeholder says it too, unless a draft hides it.
          <p id="blocked-reason" className={draft ? "text-xs text-muted-foreground" : "sr-only"}>
            {blockedReason}
          </p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Textarea
            ref={inputRef}
            aria-label={t.message}
            aria-describedby={blockedReason === null ? undefined : "blocked-reason"}
            placeholder={blockedReason ?? t.placeholder}
            value={draft}
            rows={2}
            disabled={blockedReason !== null}
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            aria-label={running ? t.queue : t.send}
            title={running ? t.queueHint : undefined}
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
        role === "user"
          ? "max-w-[85%] self-end rounded-lg bg-accent px-3 py-2 [overflow-wrap:anywhere] whitespace-pre-wrap"
          : "max-w-[75ch] py-1",
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
