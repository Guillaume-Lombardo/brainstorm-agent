import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { StagesSidebar } from "./stages-sidebar";

const KEY = "workspace.stages-sidebar.collapsed";

describe("StagesSidebar", () => {
  afterEach(() => window.localStorage.clear());

  it("collapses and expands the panel and remembers the choice", async () => {
    const { unmount } = render(
      <StagesSidebar>
        <p>Stepper</p>
      </StagesSidebar>,
    );
    const toggle = screen.getByRole("button", { name: "Collapse stages panel" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "stages-panel");

    await userEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("Expand stages panel");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Stepper").closest("aside")).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem(KEY)).toBe("true");

    unmount();
    render(
      <StagesSidebar>
        <p>Stepper</p>
      </StagesSidebar>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Expand stages panel" }));
    expect(window.localStorage.getItem(KEY)).toBe("false");
    expect(screen.getByRole("button", { name: "Collapse stages panel" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
