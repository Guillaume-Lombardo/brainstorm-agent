import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border bg-card px-2.5 py-1 text-base placeholder:text-muted-foreground focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:bg-muted md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
