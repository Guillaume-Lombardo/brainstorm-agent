import { describe, expect, it } from "vitest";

import { BackendConfigError, httpBackendOptions } from "./config";

const JWT_SECRET = "j".repeat(32); // pragma: allowlist secret
const BRIDGE_SECRET = "b".repeat(32); // pragma: allowlist secret
const BASE = {
  BACKEND_URL: "http://backend:8000",
  BACKEND_JWT_SECRET: JWT_SECRET,
  AUTH_BRIDGE_SECRET: BRIDGE_SECRET,
};

describe("httpBackendOptions", () => {
  it("requires an absolute backend URL", () => {
    expect(() => httpBackendOptions({ ...BASE, BACKEND_URL: "" })).toThrow(/BACKEND_URL/);
    expect(() => httpBackendOptions({ ...BASE, BACKEND_URL: "backend:8000" })).toThrow(/absolute/);
  });

  it("requires two distinct secrets of at least 32 characters", () => {
    expect(() => httpBackendOptions({ ...BASE, BACKEND_JWT_SECRET: undefined })).toThrow(
      /BACKEND_JWT_SECRET is required/,
    );
    const short = "short"; // pragma: allowlist secret
    expect(() => httpBackendOptions({ ...BASE, AUTH_BRIDGE_SECRET: short })).toThrow(
      /AUTH_BRIDGE_SECRET must be at least 32/,
    );
    expect(() => httpBackendOptions({ ...BASE, AUTH_BRIDGE_SECRET: JWT_SECRET })).toThrow(
      /must differ/,
    );
  });

  it("reads optional JWT claims and the TTL", () => {
    const options = httpBackendOptions({
      ...BASE,
      BACKEND_JWT_AUDIENCE: "api",
      BACKEND_JWT_TTL_SECONDS: "30",
    });
    expect(options).toEqual({
      baseUrl: "http://backend:8000",
      bridgeSecret: BRIDGE_SECRET,
      jwt: { secret: JWT_SECRET, issuer: undefined, audience: "api", ttlSeconds: 30 },
    });
    expect(httpBackendOptions(BASE).jwt.ttlSeconds).toBe(60);
    expect(() => httpBackendOptions({ ...BASE, BACKEND_JWT_TTL_SECONDS: "-1" })).toThrow(
      BackendConfigError,
    );
  });
});
