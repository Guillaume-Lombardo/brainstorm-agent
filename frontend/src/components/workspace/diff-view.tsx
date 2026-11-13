import { diffLines } from "diff";

import { cn } from "@/lib/utils";

/** Line diff between two Markdown versions. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);
  const changed = parts.some((part) => part.added || part.removed);
  if (!changed) {
    return <p className="text-sm text-muted-foreground">No change between these versions.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-lg border text-xs leading-5" data-testid="diff-view">
      {parts.map((part, index) => (
        <span
          key={index}
          className={cn(
            "block px-3 whitespace-pre-wrap",
            part.added && "bg-emerald-500/15 text-emerald-800",
            part.removed && "bg-destructive/10 text-destructive line-through",
          )}
        >
          {part.value
            .replace(/\n$/, "")
            .split("\n")
            .map((line) => `${part.added ? "+ " : part.removed ? "- " : "  "}${line}`)
            .join("\n")}
        </span>
      ))}
    </pre>
  );
}
