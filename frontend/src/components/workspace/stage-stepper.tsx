import { CheckIcon, RotateCcwIcon } from "lucide-react";

import { useMessages } from "@/components/preferences/provider";
import { STAGES, type SessionOverview, type Stage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

import { stageState, stageStatus, type StageStatus } from "./view-model";

const MARKER: Record<StageStatus, string> = {
  locked: "border text-muted-foreground",
  active: "bg-primary text-primary-foreground",
  awaiting_review: "bg-warn-soft text-warn",
  validated: "bg-good-soft text-good",
  stale: "bg-warn-soft text-warn",
};

/** Vertical stepper of the eight stages with status and stale markers. */
export function StageStepper({
  session,
  selected,
  onSelect,
}: {
  session: SessionOverview;
  selected: Stage;
  onSelect: (stage: Stage) => void;
}) {
  const t = useMessages();
  return (
    <nav aria-label={t.workspace.stagesPanel}>
      <ol className="flex flex-col gap-0.5">
        {STAGES.map((id, index) => {
          const status = stageStatus(session, id);
          const readiness = stageState(session, id)?.readiness ?? [];
          const passed = readiness.filter((check) => check.passed).length;
          return (
            <li key={id}>
              <button
                type="button"
                disabled={status === "locked"}
                aria-current={id === session.current_stage ? "step" : undefined}
                aria-pressed={id === selected}
                onClick={() => onSelect(id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-muted disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent",
                  id === selected && "bg-accent font-semibold hover:bg-accent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    MARKER[status],
                  )}
                >
                  {status === "validated" ? (
                    <CheckIcon className="size-3" />
                  ) : status === "stale" ? (
                    <RotateCcwIcon className="size-3" />
                  ) : (
                    index
                  )}
                </span>
                <span className="flex-1 truncate">
                  <span className="sr-only">{index}. </span>
                  {t.stages[id]}
                </span>
                {status !== "validated" && readiness.length > 0 ? (
                  <span
                    className="text-xs font-normal text-muted-foreground tabular-nums"
                    aria-label={`${t.stageDetails.readiness} ${passed}/${readiness.length}`}
                  >
                    {passed}/{readiness.length}
                  </span>
                ) : null}
                <span className="sr-only">{t.stageStatus[status]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
