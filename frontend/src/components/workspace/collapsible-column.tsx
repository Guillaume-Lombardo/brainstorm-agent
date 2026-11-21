"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ColumnLayout } from "./column-layout";

/** Width change per arrow key press on the resize handle. */
const KEY_STEP = 16;
/** Tailwind `lg` breakpoint: below it the columns stack and never collapse. */
const LARGE_SCREEN = "(min-width: 64rem)";

function subscribeLargeScreen(onChange: () => void): () => void {
  const query = window.matchMedia?.(LARGE_SCREEN);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/** Whether the columns sit side by side; `false` where media queries are unsupported. */
function useLargeScreen(): boolean {
  return useSyncExternalStore(
    subscribeLargeScreen,
    () => window.matchMedia?.(LARGE_SCREEN).matches ?? false,
    () => false,
  );
}

interface CollapsibleColumnProps {
  /** Workspace edge the column sits on; the toggle and resize handle sit on its inner side. */
  side: "left" | "right";
  /** Panel name used in control labels, e.g. `stages` gives "Collapse stages panel". */
  name: string;
  /** Id of the content element, referenced by the controls' `aria-controls`. */
  panelId: string;
  /** State, widths and actions from `useSideColumns`. */
  layout: ColumnLayout;
  children: ReactNode;
}

/**
 * Workspace side column that collapses to a narrow rail and resizes on large screens.
 *
 * The column width animates while the content keeps its open width and fades out, so text
 * never re-wraps during the motion. A window-splitter handle on the inner edge resizes the
 * open column with the pointer or the arrow keys; Home and End go to the bounds, Enter
 * collapses, a double click restores the default width. The toggle is absolutely placed in
 * the top 44px of the column: content must keep that band free of anything that scrolls.
 *
 * Args:
 *   props (CollapsibleColumnProps): Column side, label, content id, layout and content.
 *
 * Returns:
 *   JSX.Element: The column.
 */
export function CollapsibleColumn({
  side,
  name,
  panelId,
  layout,
  children,
}: CollapsibleColumnProps) {
  const { collapsed, width, minWidth, maxWidth } = layout;
  const [resizing, setResizing] = useState(false);
  const largeScreen = useLargeScreen();
  const columnRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; x: number; start: number } | null>(null);

  /** Forgets the pointer locally; the layout's drag may already be over. */
  function clearDrag() {
    if (drag.current) {
      drag.current = null;
      setResizing(false);
    }
  }

  function endDrag() {
    clearDrag();
    layout.endDrag();
  }

  function toggle() {
    // The layout ends a running drag itself (without animating the toggle); the handle goes
    // away with the open column.
    layout.toggle();
    clearDrag();
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // While the column still animates open, its shown width is not `width` yet: grabbing it
    // then would make it jump. The keyboard works at once.
    const shown = columnRef.current?.getBoundingClientRect().width ?? width;
    // One pointer at a time: a second one cannot take over a drag.
    if (drag.current || event.button !== 0 || Math.abs(shown - width) > 1) {
      return;
    }
    // Nor can a pointer on the other column's handle.
    if (!layout.startDrag()) {
      return;
    }
    // No text selection while dragging.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, start: width };
    setResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) {
      return;
    }
    // Below the breakpoint the handle is gone, and a new grid width ends the drag: let go of
    // the pointer.
    if (!largeScreen || !layout.isDragging()) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      endDrag();
      return;
    }
    const delta = side === "left" ? event.clientX - current.x : current.x - event.clientX;
    layout.dragTo(current.start + delta);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) {
      endDrag();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      toggle();
      // The handle goes away with the open column: keep focus on the control that reopens it.
      toggleRef.current?.focus();
      return;
    }
    // Arrows move the handle: toward the middle widens the column.
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    const next = {
      [grow]: width + KEY_STEP,
      [shrink]: width - KEY_STEP,
      Home: minWidth,
      End: maxWidth,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      layout.resize(next);
    }
  }

  const label = collapsed ? `Expand ${name} panel` : `Collapse ${name} panel`;
  const [OpenIcon, CloseIcon] =
    side === "left"
      ? [PanelLeftOpenIcon, PanelLeftCloseIcon]
      : [PanelRightOpenIcon, PanelRightCloseIcon];

  return (
    <aside
      ref={columnRef}
      data-collapsed={collapsed}
      data-side={side}
      style={{ "--open-width": `${width}px` } as CSSProperties}
      className={cn(
        "relative flex min-h-0 flex-col",
        side === "left" ? "border-r" : "border-l",
        // Collapse, expand, key steps and resets animate; drags and refits to the window do not.
        layout.animate &&
          !resizing &&
          "lg:motion-safe:transition-[width] lg:motion-safe:duration-300 lg:motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
        collapsed ? "lg:w-12" : "lg:w-(--open-width)",
      )}
    >
      <Button
        ref={toggleRef}
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
      {collapsed ? null : (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-controls={panelId}
          aria-label={`Resize ${name} panel`}
          aria-valuenow={width}
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          title="Drag to resize, double click to reset"
          data-resizing={resizing}
          className={cn(
            // An 8px grab area centered on the border, above the neighbouring column.
            "group absolute inset-y-0 z-20 hidden w-2 cursor-col-resize touch-none outline-none lg:block",
            side === "left" ? "-right-1" : "-left-1",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onDoubleClick={() => layout.resize(layout.defaultWidth)}
          onKeyDown={onKeyDown}
        >
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent",
              "group-hover:bg-ring motion-safe:transition-colors motion-safe:group-hover:delay-100",
              "group-focus-visible:bg-ring group-data-[resizing=true]:bg-ring",
            )}
          />
        </div>
      )}
      {/* Clips the content while the column is narrower than it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          id={panelId}
          // A collapsed panel leaves the tab order and the accessibility tree at once, even
          // while it fades out.
          inert={collapsed && largeScreen}
          className={cn(
            // The content keeps the open width minus the 1px border while the column animates.
            "flex min-h-0 flex-1 flex-col lg:w-[calc(var(--open-width)-1px)]",
            // It fades out fast on collapse, and back in once the column is mostly open. Only
            // opacity moves: `inert` above hides it from keyboard and assistive tech at once,
            // whereas a `visibility` transition would be inherited by children that animate
            // `all` and keep them unfocusable for a moment after expanding.
            "motion-safe:transition-opacity",
            collapsed
              ? "motion-safe:duration-150 lg:opacity-0"
              : "motion-safe:delay-100 motion-safe:duration-200",
          )}
        >
          {children}
        </div>
      </div>
    </aside>
  );
}
