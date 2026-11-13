import { cn } from "@/lib/utils";

/** Unified diff (as computed by the backend) between two document versions. */
export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n").filter((line, index, all) => line || index < all.length - 1);
  // The `---`/`+++` file headers before the first hunk carry the version numbers only;
  // a removed Markdown rule inside a hunk may also start with `---`, so keep those.
  const firstHunk = lines.findIndex((line) => line.startsWith("@@"));
  const body = firstHunk === -1 ? [] : lines.slice(firstHunk);
  if (body.length === 0) {
    return <p className="text-sm text-muted-foreground">No change between these versions.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-lg border text-xs leading-5" data-testid="diff-view">
      {body.map((line, index) => (
        <span
          key={index}
          className={cn(
            "block px-3 whitespace-pre-wrap",
            line.startsWith("@@") && "bg-muted text-muted-foreground",
            line.startsWith("+") && "bg-emerald-500/15 text-emerald-800",
            line.startsWith("-") && "bg-destructive/10 text-destructive line-through",
          )}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}
