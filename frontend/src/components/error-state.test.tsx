import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { describeError, ErrorState } from "./error-state";

describe("describeError", () => {
  it.each([
    [new ApiError(401, "unauthorized", "x"), "Session expired"],
    [new ApiError(403, "forbidden", "x"), "Access denied"],
    [new ApiError(409, "review_pending", "Pitch is waiting."), "Review pending"],
    [new ApiError(409, "conflict", "Stage is not active."), "Not possible right now"],
    [new ApiError(503, "backend_unavailable", "x"), "Service unavailable"],
    [new ApiError(429, "rate_limited", "x", 30), "Too many requests"],
    [new ApiError(502, "llm_error", "Model failed"), "The assistant failed"],
  ])("maps %o to %s", (error, title) => {
    expect(describeError(error).title).toBe(title);
  });

  it("gives the retry delay for rate limits", () => {
    expect(describeError(new ApiError(429, "rate_limited", "x", 30)).description).toBe(
      "Try again in 30 seconds.",
    );
  });
});

describe("ErrorState", () => {
  it("offers to sign in again after a 401", () => {
    render(<ErrorState error={new ApiError(401, "unauthorized", "expired")} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
