import { useMessages } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import { STAGES, type Stage } from "@/lib/backend/types";

/** Marks in the conversation where the session moved to another stage. */
export function StageDivider({ from, to }: { from: Stage; to: Stage }) {
  const t = useMessages();
  const back = STAGES.indexOf(to) < STAGES.indexOf(from);
  const stage = `${STAGES.indexOf(to)}. ${t.stages[to]}`;
  return (
    <div
      role="separator"
      aria-label={back ? t.divider.back(stage) : t.divider.next(stage)}
      className="my-3 flex items-center gap-3"
    >
      <span className="h-px flex-1 bg-border" />
      <Badge variant={back ? "warn" : "accent"} className="px-3 py-1 text-xs">
        {back ? t.divider.back(stage) : stage}
      </Badge>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
