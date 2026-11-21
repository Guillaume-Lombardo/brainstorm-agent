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

/** Width left to the middle column when a side column is widened. */
const MIN_MAIN_WIDTH = 360;
/** Width change per arrow key press on the resize handle. */
const KEY_STEP = 16;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the panel still works for this page.
  }
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface CollapsibleColumnProps {
  /** Workspace edge the column sits on; the toggle and resize handle sit on its inner side. */
  side: "left" | "right";
  /** Panel name used in control labels, e.g. `stages` gives "Collapse stages panel". */
  name: string;
  /** Id of the content element, referenced by the controls' `aria-controls`. */
  panelId: string;
  /** `localStorage` key prefix: `<prefix>.collapsed` and `<prefix>.width` remember the layout. */
  storageKey: string;
  /** Default open width in pixels, border included. */
  defaultWidth: number;
  /** Smallest open width in pixels. */
  minWidth: number;
  /** Largest open width in pixels; the middle column also keeps `MIN_MAIN_WIDTH`. */
  maxWidth: number;
  children: ReactNode;
}

/**
 * Workspace side column that collapses to a narrow rail and resizes on large screens.
 *
 * The column width animates while the content keeps its open width and fades out, so text
 * never re-wraps during the motion. A handle on the inner edge resizes the open column with
 * the pointer or the arrow keys, and a double click restores the default width. The toggle
 * is absolutely placed in the top 44px of the column: content must keep that band free of
 * anything that scrolls. Collapsed state and width are remembered in `localStorage`.
 *
 * Args:
 *   props (CollapsibleColumnProps): Column side, label, ids, storage prefix, widths, content.
 *
 * Returns:
 *   JSX.Element: The column.
 */
export function CollapsibleColumn({
  side,
  name,
  panelId,
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  children,
}: CollapsibleColumnProps) {
  const collapsedKey = `${storageKey}.collapsed`;
  const widthKey = `${storageKey}.width`;
  const [collapsed, setCollapsed] = useState(() => readStored(collapsedKey) === "true");
  const [width, setWidth] = useState(() => {
    const stored = Number(readStored(widthKey));
    return stored ? clamp(stored, minWidth, maxWidth) : defaultWidth;
  });
  const [resizing, setResizing] = useState(false);
  const largeScreen = useLargeScreen();
  const columnRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; start: number; max: number; width: number } | null>(null);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeStored(collapsedKey, String(next));
  }

  /** Largest width that still leaves `MIN_MAIN_WIDTH` to the middle column. */
  function layoutMax(): number {
    const column = columnRef.current;
    const grid = column?.parentElement;
    if (!column || !grid || grid.clientWidth === 0) {
      return maxWidth;
    }
    const otherColumns = Array.from(grid.children)
      .filter((child) => child !== column && child.tagName === "ASIDE")
      .reduce((total, child) => total + child.getBoundingClientRect().width, 0);
    return clamp(grid.clientWidth - otherColumns - MIN_MAIN_WIDTH, minWidth, maxWidth);
  }

  function resize(next: number) {
    setWidth(next);
    writeStored(widthKey, String(next));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    // No text selection while dragging.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: width, max: layoutMax(), width };
    setResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) {
      return;
    }
    const delta = side === "left" ? event.clientX - current.x : current.x - event.clientX;
    current.width = clamp(current.start + delta, minWidth, current.max);
    setWidth(current.width);
  }

  function endDrag() {
    if (drag.current) {
      writeStored(widthKey, String(drag.current.width));
      drag.current = null;
      setResizing(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Arrows move the handle: toward the middle widens the column.
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    const max = layoutMax();
    const next = {
      [grow]: width + KEY_STEP,
      [shrink]: width - KEY_STEP,
      Home: minWidth,
      End: max,
    }[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    resize(clamp(next, minWidth, max));
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
        // A drag follows the pointer; only collapse, expand and key steps animate.
        !resizing &&
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
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onDoubleClick={() => resize(clamp(defaultWidth, minWidth, layoutMax()))}
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
