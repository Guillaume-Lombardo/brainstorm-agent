import { useCallback, useRef, useState } from "react";

import type { SessionOverview, Stage } from "@/lib/backend/types";

/** A message written while a turn runs, sent with the others once that turn ends. */
export interface QueuedMessage {
  id: string;
  content: string;
  /** Open question answered by this message, when it comes from the questions panel. */
  questionId?: string;
  /** Its turn did not end normally: it only leaves when the user sends or removes it. */
  held?: boolean;
}

/** One message for the whole queue: a single turn answers every queued question. */
export function mergeQueue(queue: QueuedMessage[]): string {
  return queue.map((item) => item.content).join("\n\n");
}

/** Questions the queued messages answer. */
export function queuedQuestionIds(queue: QueuedMessage[]): string[] {
  return queue.flatMap((item) => item.questionId ?? []);
}

/** Whether a turn left the session on its own stage, ready for another message. */
export function acceptsNext(session: SessionOverview, stage: Stage): boolean {
  return !session.archived && !session.pending_human_review && session.current_stage === stage;
}

export interface TurnQueue {
  queue: QueuedMessage[];
  add: (message: Pick<QueuedMessage, "content" | "questionId">) => void;
  remove: (id: string) => void;
  /** Takes messages out, all of them or only those not held, even from an outdated render. */
  take: (options?: { held: boolean }) => QueuedMessage[];
  /** Keeps what is left for the user to send or remove. */
  hold: () => void;
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
    add: useCallback(
      (message) => update([...ref.current, { ...message, id: crypto.randomUUID() }]),
      [update],
    ),
    remove: useCallback((id) => update(ref.current.filter((item) => item.id !== id)), [update]),
    take: useCallback(
      ({ held } = { held: true }) => {
        const taken = ref.current.filter((item) => held || !item.held);
        update(ref.current.filter((item) => !taken.includes(item)));
        return taken;
      },
      [update],
    ),
    hold: useCallback(() => update(ref.current.map((item) => ({ ...item, held: true }))), [update]),
  };
}
