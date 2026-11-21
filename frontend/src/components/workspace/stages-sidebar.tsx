"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "workspace.stages-sidebar.collapsed";
// Open column width (`lg:w-[260px]` below) minus its 1px right border: the content keeps this
// width while the column animates, so its text never re-wraps.
const CONTENT_WIDTH = "lg:w-[259px]";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Storage may be unavailable (private mode); the panel still toggles for this page.
  }
}

/**
 * Left workspace column that collapses to a narrow rail on large screens.
 *
 * The column width animates while the content keeps its full width and fades out, so text
 * never re-wraps during the motion. The choice is remembered in `localStorage`.
 */
export function StagesSidebar({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  }

  const label = collapsed ? "Expand stages panel" : "Collapse stages panel";
  // Content fades out fast on collapse, and back in once the column is mostly open.
  const fade = cn(
    "motion-safe:transition-[opacity,visibility]",
    collapsed
      ? "lg:invisible lg:opacity-0 motion-safe:duration-150"
      : "motion-safe:delay-100 motion-safe:duration-200",
  );

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-r",
        "lg:motion-safe:transition-[width] lg:motion-safe:duration-300 lg:motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
        collapsed ? "lg:w-12" : "lg:w-[260px]",
      )}
    >
      <div className="relative hidden h-11 shrink-0 lg:block">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-3 right-2 z-10 text-muted-foreground"
          aria-controls="stages-panel"
          aria-expanded={!collapsed}
          aria-label={label}
          title={label}
          onClick={toggle}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>
        <p
          aria-hidden
          className={cn(
            "mt-3 flex h-8 items-center px-5 text-xs font-medium tracking-wide text-muted-foreground uppercase",
            CONTENT_WIDTH,
            fade,
          )}
        >
          Stages
        </p>
      </div>
      <div
        id="stages-panel"
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 lg:pt-4",
          CONTENT_WIDTH,
          fade,
        )}
      >
        {children}
      </div>
    </aside>
  );
}
