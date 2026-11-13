import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  ClockIcon,
  LockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, type StageId, type StageState, type StageStatus } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

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
  stages,
  currentStage,
  selected,
  onSelect,
}: {
  stages: StageState[];
  currentStage: StageId;
  selected: StageId;
  onSelect: (stage: StageId) => void;
}) {
  return (
    <nav aria-label="Stages">
      <ol className="flex flex-col gap-1">
        {stages.map((stage, index) => {
          const Icon = STATUS_ICON[stage.status];
          const passed = stage.readiness.filter((check) => check.passed).length;
          return (
            <li key={stage.stage}>
              <button
                type="button"
                disabled={stage.status === "locked"}
                aria-current={stage.stage === currentStage ? "step" : undefined}
                aria-pressed={stage.stage === selected}
                onClick={() => onSelect(stage.stage)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                  stage.stage === selected && "bg-muted font-medium",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    stage.status === "validated" && "text-emerald-600",
                    stage.status === "stale" && "text-amber-600",
                    stage.status === "awaiting_review" && "text-sky-600",
                  )}
                />
                <span className="flex-1 truncate">
                  {index}. {STAGE_LABELS[stage.stage]}
                </span>
                {stage.status === "stale" ? (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">
                    stale
                  </Badge>
                ) : stage.status !== "locked" ? (
                  <span className="text-xs text-muted-foreground" aria-label="Readiness">
                    {passed}/{stage.readiness.length}
                  </span>
                ) : null}
                <span className="sr-only">{STATUS_LABEL[stage.status]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
