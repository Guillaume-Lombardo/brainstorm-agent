import { describe, expect, it } from "vitest";

import { readOidcSettings } from "./oidc";
import { safeCallbackPath } from "./redirect";

describe("readOidcSettings", () => {
  it("is disabled unless issuer, client id and secret are all set", () => {
    expect(readOidcSettings({})).toBeNull();
    expect(
      readOidcSettings({ AUTH_OIDC_ISSUER: "https://idp", AUTH_OIDC_CLIENT_ID: "id" }),
    ).toBeNull();
    expect(
      readOidcSettings({
        AUTH_OIDC_ISSUER: "https://idp",
        AUTH_OIDC_CLIENT_ID: "id",
        AUTH_OIDC_CLIENT_SECRET: "s", // pragma: allowlist secret
      }),
    ).toEqual({ issuer: "https://idp", clientId: "id", clientSecret: "s", name: "SSO" });
  });
});

describe("safeCallbackPath", () => {
  it("keeps same-origin paths only", () => {
    expect(safeCallbackPath("/sessions/42")).toBe("/sessions/42");
    expect(safeCallbackPath("https://evil.example")).toBe("/sessions");
    expect(safeCallbackPath("//evil.example")).toBe("/sessions");
    expect(safeCallbackPath("/\\evil.example")).toBe("/sessions");
    expect(safeCallbackPath("/login")).toBe("/sessions");
    expect(safeCallbackPath(null)).toBe("/sessions");
  });
});
