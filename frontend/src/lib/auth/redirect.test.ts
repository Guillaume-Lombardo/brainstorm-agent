import { describe, expect, it } from "vitest";

import { safeCallbackPath } from "./redirect";

describe("safeCallbackPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeCallbackPath("/sessions/abc?tab=delivery#top")).toBe(
      "/sessions/abc?tab=delivery#top",
    );
  });

  it.each([
    undefined,
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/login",
    "/login?callbackUrl=/sessions",
  ])("falls back to /sessions for %j", (value) => {
    expect(safeCallbackPath(value)).toBe("/sessions");
  });

  it("keeps encoded control characters inside the path", () => {
    expect(new URL(safeCallbackPath("/%09/evil.example"), "https://app.example").origin).toBe(
      "https://app.example",
    );
  });
});
