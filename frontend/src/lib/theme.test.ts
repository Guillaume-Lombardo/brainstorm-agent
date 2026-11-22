import { expect, it } from "vitest";

import { resolveTheme } from "./theme";

it("follows the system unless a known theme was chosen", () => {
  expect(resolveTheme("dark")).toBe("dark");
  expect(resolveTheme("light")).toBe("light");
  expect(resolveTheme("sepia")).toBe("system");
  expect(resolveTheme(undefined)).toBe("system");
});
