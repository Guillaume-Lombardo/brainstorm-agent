import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SLICES } from "@/test/fixtures";

import { DeliverySlicingView } from "./delivery-view";

describe("DeliverySlicingView", () => {
  it("renders slice cards, one graph node per slice and the contract matrix", () => {
    render(<DeliverySlicingView slices={SLICES} waves={[["S1"], ["S2"], ["S3"]]} />);
    expect(screen.getByTestId("slice-S2")).toHaveTextContent("Shopping list");
    expect(screen.getByTestId("slice-S2")).toHaveTextContent("a planned week");
    expect(screen.getByTestId("slice-S1")).toHaveTextContent(
      "WHEN a week is planned THE SYSTEM SHALL store it",
    );
    for (const slice of SLICES) {
      expect(screen.getByTestId(`graph-node-${slice.id}`)).toBeInTheDocument();
    }
    expect(screen.getByText("Wave 2")).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: "Contract matrix" });
    const plan = within(matrix).getByRole("row", { name: /C1 Plan API/ });
    const cells = within(plan).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["O", "C", ""]);
  });

  it("shows the notice instead of waves while the plan is not validated", () => {
    render(<DeliverySlicingView slices={SLICES} waves={null} notice="Waves appear later." />);
    expect(screen.getByText("Waves appear later.")).toBeInTheDocument();
    expect(screen.queryByText("Wave 0")).not.toBeInTheDocument();
  });
});
