import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleColumn } from "./collapsible-column";

const PREFIX = "workspace.test-panel";

function renderColumn(side: "left" | "right") {
  return render(
    <CollapsibleColumn
      side={side}
      name="test"
      panelId="test-panel"
      storageKey={PREFIX}
      defaultWidth={300}
      minWidth={200}
      maxWidth={500}
    >
      <p>Content</p>
    </CollapsibleColumn>,
  );
}

const column = () => screen.getByText("Content").closest("aside")!;
const handle = () => screen.getByRole("separator", { name: "Resize test panel" });

describe("CollapsibleColumn", () => {
  afterEach(() => window.localStorage.clear());

  it("collapses and expands the panel and remembers the choice", async () => {
    const { unmount } = renderColumn("left");
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
    renderColumn("left");
    await userEvent.click(screen.getByRole("button", { name: "Expand test panel" }));
    expect(window.localStorage.getItem(`${PREFIX}.collapsed`)).toBe("false");
    expect(screen.getByRole("button", { name: "Collapse test panel" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("puts the border and the controls on the inner side of a right column", () => {
    renderColumn("right");
    expect(column()).toHaveAttribute("data-side", "right");
    expect(column()).toHaveClass("border-l");
    expect(column().style.getPropertyValue("--open-width")).toBe("300px");
    expect(screen.getByRole("button", { name: "Collapse test panel" })).toHaveClass("left-2");
    expect(handle()).toHaveClass("-left-1");
  });

  it("resizes with the keyboard within bounds and remembers the width", () => {
    const { unmount } = renderColumn("left");
    expect(handle()).toHaveAttribute("aria-valuenow", "300");

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
    renderColumn("left");
    expect(handle()).toHaveAttribute("aria-valuenow", "216");
    fireEvent.doubleClick(handle());
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
    expect(window.localStorage.getItem(`${PREFIX}.width`)).toBe("300");
  });

  it("widens a right column when its edge moves left", () => {
    renderColumn("right");
    fireEvent.keyDown(handle(), { key: "ArrowLeft" });
    expect(handle()).toHaveAttribute("aria-valuenow", "316");
  });

  it("ignores a stored width outside the bounds", () => {
    window.localStorage.setItem(`${PREFIX}.width`, "9000");
    renderColumn("left");
    expect(handle()).toHaveAttribute("aria-valuenow", "500");
  });
});
