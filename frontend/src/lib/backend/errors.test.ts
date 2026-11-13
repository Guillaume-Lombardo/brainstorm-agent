import { describe, expect, it } from "vitest";

import { BackendError, codeForStatus } from "./errors";

describe("BackendError", () => {
  it("is recognised across bundled copies of the class", () => {
    // Another bundle's copy: a different class carrying the same registered brand.
    const foreign = Object.assign(new Error("Review pending"), {
      [Symbol.for("brainstorm-agent.BackendError")]: true,
      code: "review_pending",
    });
    expect(foreign instanceof BackendError).toBe(true);
    expect(new Error("plain") instanceof BackendError).toBe(false);
    expect((null as unknown) instanceof BackendError).toBe(false);
  });

  it("carries the relayed status and the JSON envelope", () => {
    const error = new BackendError("rate_limited", "Slow down", { retryAfterSeconds: 3 });
    expect(error.status).toBe(429);
    expect(error.toBody()).toEqual({
      error: { code: "rate_limited", message: "Slow down", retryAfterSeconds: 3 },
    });
    expect(new BackendError("review_pending", "x").status).toBe(409);
  });

  it.each([
    [409, "conflict"],
    [422, "validation_error"],
    [502, "llm_error"],
    [504, "llm_error"],
    [500, "backend_unavailable"],
  ] as const)("maps backend status %i to %s", (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });
});
