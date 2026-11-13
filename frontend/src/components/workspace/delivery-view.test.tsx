import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEMO_DELIVERY_SLICING } from "@/lib/backend/mock-data";

import { DeliverySlicingView } from "./delivery-view";

describe("DeliverySlicingView", () => {
  it("renders slice cards, one graph node per slice and the contract matrix", () => {
    render(<DeliverySlicingView slicing={DEMO_DELIVERY_SLICING} />);
    expect(screen.getByTestId("slice-S3")).toHaveTextContent("Dispatch board");
    for (const slice of DEMO_DELIVERY_SLICING.slices) {
      expect(screen.getByTestId(`graph-node-${slice.id}`)).toBeInTheDocument();
    }
    const matrix = screen.getByRole("table", { name: "Contract matrix" });
    const intake = within(matrix).getByRole("row", { name: /C4 Job intake API/ });
    const cells = within(intake).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["", "O", "", "C"]);
  });

  it("shows an empty state before stage 7", () => {
    render(<DeliverySlicingView slicing={{ slices: [], waves: [], contracts: [] }} />);
    expect(screen.getByText(/Delivery slices appear/)).toBeInTheDocument();
  });
});
