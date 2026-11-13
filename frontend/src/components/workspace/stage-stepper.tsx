import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  ClockIcon,
  LockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, STAGES, type SessionOverview, type Stage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

import { stageState, stageStatus, type StageStatus } from "./view-model";

const STATUS_ICON: Record<StageStatus, typeof CircleIcon> = {
  locked: LockIcon,
  active: CircleDotIcon,
  awaiting_review: ClockIcon,
  validated: CheckCircle2Icon,
  stale: TriangleAlertIcon,
};

const STATUS_LABEL: Record<StageStatus, string> = {
  locked: "Locked",
  active: "In progress",
  awaiting_review: "Awaiting review",
  validated: "Validated",
  stale: "Stale",
};

export function stageStatusLabel(status: StageStatus): string {
  return STATUS_LABEL[status];
}

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
  return (
    <nav aria-label="Stages">
      <ol className="flex flex-col gap-1">
        {STAGES.map((id, index) => {
          const status = stageStatus(session, id);
          const Icon = STATUS_ICON[status];
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
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                  id === selected && "bg-muted font-medium",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    status === "validated" && "text-emerald-600",
                    status === "stale" && "text-amber-600",
                    status === "awaiting_review" && "text-sky-600",
                  )}
                />
                <span className="flex-1 truncate">
                  {index}. {STAGE_LABELS[id]}
                </span>
                {status === "stale" ? (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">
                    stale
                  </Badge>
                ) : readiness.length > 0 ? (
                  <span className="text-xs text-muted-foreground" aria-label="Readiness">
                    {passed}/{readiness.length}
                  </span>
                ) : null}
                <span className="sr-only">{STATUS_LABEL[status]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
