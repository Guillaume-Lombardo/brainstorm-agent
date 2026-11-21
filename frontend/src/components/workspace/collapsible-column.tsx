"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(key: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(key, String(collapsed));
  } catch {
    // Storage may be unavailable (private mode); the panel still toggles for this page.
  }
}

interface CollapsibleColumnProps {
  /** Workspace edge the column sits on; the toggle sits on its inner side. */
  side: "left" | "right";
  /** Panel name used in the toggle label, e.g. `stages` gives "Collapse stages panel". */
  name: string;
  /** Id of the content element, referenced by the toggle's `aria-controls`. */
  panelId: string;
  /** `localStorage` key remembering the collapsed state. */
  storageKey: string;
  /** Open width in pixels, border included. */
  width: number;
  /** Classes for the content element, which is a flex column filling the column height. */
  className?: string;
  children: ReactNode;
}

/**
 * Workspace side column that collapses to a narrow rail on large screens.
 *
 * The column width animates while the content keeps its open width and fades out, so text
 * never re-wraps during the motion. The toggle is absolutely placed in the top 44px of the
 * column: content must keep that band free of anything that scrolls. The choice is remembered
 * in `localStorage`.
 *
 * Args:
 *   props (CollapsibleColumnProps): Column side, label, ids, storage key, width and content.
 *
 * Returns:
 *   JSX.Element: The column.
 */
export function CollapsibleColumn({
  side,
  name,
  panelId,
  storageKey,
  width,
  className,
  children,
}: CollapsibleColumnProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(storageKey, next);
  }

  const label = collapsed ? `Expand ${name} panel` : `Collapse ${name} panel`;
  const [OpenIcon, CloseIcon] =
    side === "left"
      ? [PanelLeftOpenIcon, PanelLeftCloseIcon]
      : [PanelRightOpenIcon, PanelRightCloseIcon];

  return (
    <aside
      data-collapsed={collapsed}
      data-side={side}
      style={{ "--open-width": `${width}px` } as CSSProperties}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden",
        side === "left" ? "border-r" : "border-l",
        "lg:motion-safe:transition-[width] lg:motion-safe:duration-300 lg:motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
        collapsed ? "lg:w-12" : "lg:w-(--open-width)",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-3 z-10 hidden text-muted-foreground lg:inline-flex",
          side === "left" ? "right-2" : "left-2",
        )}
        aria-controls={panelId}
        aria-expanded={!collapsed}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        {collapsed ? <OpenIcon /> : <CloseIcon />}
      </Button>
      <div
        id={panelId}
        className={cn(
          // The content keeps the open width minus the 1px border while the column animates.
          "flex min-h-0 flex-1 flex-col lg:w-[calc(var(--open-width)-1px)]",
          // It fades out fast on collapse, and back in once the column is mostly open.
          "motion-safe:transition-[opacity,visibility]",
          collapsed
            ? "motion-safe:duration-150 lg:invisible lg:opacity-0"
            : "motion-safe:delay-100 motion-safe:duration-200",
          className,
        )}
      >
        {children}
      </div>
    </aside>
  );
}
