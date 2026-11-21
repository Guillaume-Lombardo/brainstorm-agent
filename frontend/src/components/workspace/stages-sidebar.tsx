"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "workspace.stages-sidebar.collapsed";

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

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "relative min-h-0 overflow-hidden border-r",
        "motion-reduce:transition-none lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.32,0.72,0,1)]",
        collapsed ? "lg:w-12" : "lg:w-[260px]",
      )}
    >
      <div
        id="stages-panel"
        className={cn(
          "flex h-full flex-col gap-4 overflow-y-auto p-3 lg:w-[259px]",
          "transition-[opacity,visibility] motion-reduce:transition-none",
          collapsed ? "duration-150 lg:invisible lg:opacity-0" : "delay-100 duration-200",
        )}
      >
        <h2 className="flex h-8 shrink-0 items-center px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Stages
        </h2>
        {children}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-3 right-2 hidden text-muted-foreground lg:inline-flex"
        aria-controls="stages-panel"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand stages panel" : "Collapse stages panel"}
        title={collapsed ? "Expand stages panel" : "Collapse stages panel"}
        onClick={toggle}
      >
        {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      </Button>
    </aside>
  );
}
