"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";

import { useMessages } from "@/components/preferences/provider";
import { Button } from "@/components/ui/button";

const Dialog = DialogPrimitive.Root;

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  const t = useMessages().common;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/40" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-popover p-4 text-popover-foreground outline-none sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
        >
          <XIcon />
          <span className="sr-only">{t.close}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("pr-8 text-sm font-semibold", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}

export { Dialog, DialogContent, DialogFooter, DialogTitle };
