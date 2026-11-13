import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./messages";
import { oidcIdentity, readOidcSettings } from "./oidc";
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

describe("oidcIdentity", () => {
  const profile = { sub: "abc", email: "ada@example.com", email_verified: true, name: "Ada" };

  it("maps a verified profile to the backend OIDC request", () => {
    expect(oidcIdentity("https://idp", profile)).toEqual({
      issuer: "https://idp",
      subject: "abc",
      email: "ada@example.com",
      display_name: "Ada",
    });
    expect(oidcIdentity("https://idp", { ...profile, name: null })?.display_name).toBe(
      "ada@example.com",
    );
  });

  it.each([
    ["an unverified e-mail", { ...profile, email_verified: false }],
    ["a missing email_verified claim", { ...profile, email_verified: undefined }],
    ["a missing e-mail", { ...profile, email: null }],
    ["a missing subject", { ...profile, sub: "" }],
  ])("refuses %s", (_label, claims) => {
    expect(oidcIdentity("https://idp", claims)).toBeNull();
  });

  it("refuses an unconfigured issuer", () => {
    expect(oidcIdentity("", profile)).toBeNull();
  });
});

describe("signInErrorMessage", () => {
  it("explains a refused SSO sign-in and hides unknown error types", () => {
    expect(signInErrorMessage("AccessDenied")).toMatch(/did not confirm your e-mail/);
    expect(signInErrorMessage("<script>")).toBe("Sign-in failed. Try again later.");
    expect(signInErrorMessage(undefined)).toBeNull();
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
