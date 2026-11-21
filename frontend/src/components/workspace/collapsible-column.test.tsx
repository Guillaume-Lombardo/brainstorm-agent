import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { CollapsibleColumn } from "./collapsible-column";
import { useSideColumns, type ColumnSpec } from "./column-layout";

const PREFIX = "workspace.test-panel";
const SPEC: ColumnSpec = { storageKey: PREFIX, defaultWidth: 300, minWidth: 200, maxWidth: 500 };
const OTHER: ColumnSpec = { storageKey: "other", defaultWidth: 300, minWidth: 200, maxWidth: 500 };

function Harness({ side }: { side: "left" | "right" }) {
  // An unmeasured grid: the column bounds are its own.
  const [layout] = useSideColumns({ current: null }, SPEC, OTHER);
  return (
    <CollapsibleColumn side={side} name="test" panelId="test-panel" layout={layout}>
      <p>Content</p>
    </CollapsibleColumn>
  );
}

const column = () => screen.getByText("Content").closest("aside")!;
const handle = () => screen.getByRole("separator", { name: "Resize test panel" });

describe("CollapsibleColumn", () => {
  afterEach(() => window.localStorage.clear());

  it("collapses and expands the panel and remembers the choice", async () => {
    const { unmount } = render(<Harness side="left" />);
    const toggle = screen.getByRole("button", { name: "Collapse test panel" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "test-panel");
    expect(screen.getByText("Content").closest("#test-panel")).not.toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("Expand test panel");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(column()).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByRole("separator")).toBeNull();
    expect(window.localStorage.getItem(`${PREFIX}.collapsed`)).toBe("true");

    unmount();
    render(<Harness side="left" />);
    await userEvent.click(screen.getByRole("button", { name: "Expand test panel" }));
    expect(window.localStorage.getItem(`${PREFIX}.collapsed`)).toBe("false");
  });

  it("puts the border and the controls on the inner side of a right column", () => {
    render(<Harness side="right" />);
    expect(column()).toHaveAttribute("data-side", "right");
    expect(column()).toHaveClass("border-l");
    expect(column().style.getPropertyValue("--open-width")).toBe("300px");
    expect(screen.getByRole("button", { name: "Collapse test panel" })).toHaveClass("left-2");
    expect(handle()).toHaveClass("-left-1");
  });

  it("resizes with the keyboard within bounds and remembers the width", () => {
    const { unmount } = render(<Harness side="left" />);
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
    expect(handle()).toHaveAttribute("aria-valuemax", "500");

    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(handle()).toHaveAttribute("aria-valuenow", "316");
    fireEvent.keyDown(handle(), { key: "End" });
    expect(handle()).toHaveAttribute("aria-valuenow", "500");
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(handle()).toHaveAttribute("aria-valuenow", "500");
    fireEvent.keyDown(handle(), { key: "Home" });
    expect(handle()).toHaveAttribute("aria-valuenow", "200");
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(column().style.getPropertyValue("--open-width")).toBe("216px");

    unmount();
    render(<Harness side="left" />);
    expect(handle()).toHaveAttribute("aria-valuenow", "216");
    fireEvent.doubleClick(handle());
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
    expect(window.localStorage.getItem(`${PREFIX}.width`)).toBe("300");
  });

  it("widens a right column when its edge moves left", () => {
    render(<Harness side="right" />);
    fireEvent.keyDown(handle(), { key: "ArrowLeft" });
    expect(handle()).toHaveAttribute("aria-valuenow", "316");
  });

  it("collapses from the handle with Enter and keeps focus on the toggle", () => {
    render(<Harness side="left" />);
    handle().focus();
    fireEvent.keyDown(handle(), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Expand test panel" })).toHaveFocus();
  });

  it("follows only the pointer that grabbed the handle, and ends the drag on collapse", async () => {
    // jsdom has no layout: report the column at its open width, so it is not animating.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300,
    } as DOMRect);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    // The handle only drags on large screens.
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    });
    render(<Harness side="left" />);

    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 100 });
    expect(handle()).toHaveAttribute("data-resizing", "true");
    // A second pointer neither takes over nor moves the handle.
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 2, clientX: 400 });
    fireEvent.pointerMove(handle(), { pointerId: 2, clientX: 400 });
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 140 });
    expect(handle()).toHaveAttribute("aria-valuenow", "340");

    await userEvent.click(screen.getByRole("button", { name: "Collapse test panel" }));
    await userEvent.click(screen.getByRole("button", { name: "Expand test panel" }));
    expect(handle()).toHaveAttribute("data-resizing", "false");
    expect(window.localStorage.getItem(`${PREFIX}.width`)).toBe("340");
  });
});
