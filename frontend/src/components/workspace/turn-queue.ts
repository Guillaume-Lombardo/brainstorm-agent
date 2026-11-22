import { useCallback, useRef, useState } from "react";

import type { SessionOverview, Stage } from "@/lib/backend/types";

/** A message written while a turn runs, sent with the others once that turn ends. */
export interface QueuedMessage {
  id: string;
  content: string;
  /** Stage the message was written for: it never moves to another stage on its own. */
  stage: Stage;
  /** Open question answered by this message, when it comes from the questions panel. */
  questionId?: string;
}

/** One message for the whole queue: a single turn answers every queued question. */
export function mergeQueue(queue: QueuedMessage[]): string {
  return queue.map((item) => item.content).join("\n\n");
}

/** Questions the queued messages answer. */
export function queuedQuestionIds(queue: QueuedMessage[]): string[] {
  return queue.flatMap((item) => item.questionId ?? []);
}

/** Whether the queue may be sent without asking: same stage, and the backend accepts input. */
export function canFlush(queue: QueuedMessage[], session: SessionOverview): boolean {
  return (
    queue.length > 0 &&
    !session.archived &&
    !session.pending_human_review &&
    queue.every((item) => item.stage === session.current_stage)
  );
}

export interface TurnQueue {
  queue: QueuedMessage[];
  /** Current queue, readable from a running turn whose render is outdated. */
  peek: () => QueuedMessage[];
  add: (message: Omit<QueuedMessage, "id">) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export function useTurnQueue(): TurnQueue {
  const ref = useRef<QueuedMessage[]>([]);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const update = useCallback((next: QueuedMessage[]) => {
    ref.current = next;
    setQueue(next);
  }, []);
  return {
    queue,
    peek: useCallback(() => ref.current, []),
    add: useCallback(
      (message) => update([...ref.current, { ...message, id: crypto.randomUUID() }]),
      [update],
    ),
    remove: useCallback((id) => update(ref.current.filter((item) => item.id !== id)), [update]),
    clear: useCallback(() => update([]), [update]),
  };
}
