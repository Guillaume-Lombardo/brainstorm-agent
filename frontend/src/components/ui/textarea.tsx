import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content max-h-[40vh] min-h-16 w-full resize-none rounded-md border bg-card px-2.5 py-2 text-base placeholder:text-muted-foreground focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:bg-muted md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
