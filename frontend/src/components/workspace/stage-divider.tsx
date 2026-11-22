import { ArrowRightIcon, CheckIcon, RotateCcwIcon } from "lucide-react";

import { STAGE_LABELS, STAGES, type Stage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

function numbered(stage: Stage): string {
  return `${STAGES.indexOf(stage)}. ${STAGE_LABELS[stage]}`;
}

/** Marks in the conversation where the session moved to another stage. */
export function StageDivider({ from, to }: { from: Stage; to: Stage }) {
  const back = STAGES.indexOf(to) < STAGES.indexOf(from);
  const line = cn("h-0.5 flex-1 rounded-full", back ? "bg-amber-500/50" : "bg-emerald-600/50");
  return (
    <div
      role="separator"
      aria-label={`${back ? "Back to stage" : "New stage"} ${numbered(to)}`}
      className="my-4 flex items-center gap-3"
    >
      <span className={line} />
      <span
        className={cn(
          "flex max-w-[80%] flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl border px-4 py-1.5 text-center text-sm",
          back
            ? "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            : "border-emerald-600/60 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
        )}
      >
        {back ? (
          <RotateCcwIcon aria-hidden className="size-4 shrink-0" />
        ) : (
          <>
            <span className="flex items-center gap-1 text-xs opacity-80">
              <CheckIcon aria-hidden className="size-3.5 shrink-0" />
              {STAGE_LABELS[from]}
            </span>
            <ArrowRightIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />
          </>
        )}
        <strong className="font-semibold">
          {back ? "Back to " : ""}
          {numbered(to)}
        </strong>
      </span>
      <span className={line} />
    </div>
  );
}
