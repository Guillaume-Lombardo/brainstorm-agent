import { describe, expect, it } from "vitest";

import { BackendConfigError, httpBackendOptions, resolveBackendMode } from "./config";

describe("resolveBackendMode", () => {
  it("defaults to mock outside production only", () => {
    expect(resolveBackendMode({ NODE_ENV: "development" })).toBe("mock");
    expect(() => resolveBackendMode({ NODE_ENV: "production" })).toThrow(BackendConfigError);
    expect(resolveBackendMode({ NODE_ENV: "production", BACKEND_MODE: "HTTP" })).toBe("http");
  });

  it("rejects unknown modes", () => {
    expect(() => resolveBackendMode({ BACKEND_MODE: "fake" })).toThrow(/mock" or "http/);
  });
});

describe("httpBackendOptions", () => {
  it("requires the backend URL and the JWT secret", () => {
    expect(() => httpBackendOptions({ BACKEND_JWT_SECRET: "x" })).toThrow(/BACKEND_URL/);
    expect(() => httpBackendOptions({ BACKEND_URL: "http://b" })).toThrow(/BACKEND_JWT_SECRET/);
  });

  it("reads optional JWT claims and the TTL", () => {
    const options = httpBackendOptions({
      BACKEND_URL: "http://b",
      BACKEND_JWT_SECRET: "s", // pragma: allowlist secret
      BACKEND_JWT_AUDIENCE: "api",
      BACKEND_JWT_TTL_SECONDS: "30",
    });
    expect(options.jwt).toEqual({
      secret: "s",
      issuer: undefined,
      audience: "api",
      ttlSeconds: 30,
    });
    expect(() =>
      httpBackendOptions({
        BACKEND_URL: "http://b",
        BACKEND_JWT_SECRET: "s",
        BACKEND_JWT_TTL_SECONDS: "-1",
      }),
    ).toThrow(BackendConfigError);
  });
});
