import type { HttpBackendOptions } from "./http";
import type { MockBackendOptions } from "./mock";

export type BackendMode = "mock" | "http";

type Env = Record<string, string | undefined>;

export class BackendConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendConfigError";
  }
}

/**
 * Resolve `BACKEND_MODE`. It defaults to `mock` outside production and must be
 * set explicitly in production so a deployment never serves mock data silently.
 */
export function resolveBackendMode(env: Env): BackendMode {
  const raw = env.BACKEND_MODE?.trim().toLowerCase();
  if (raw === "mock" || raw === "http") {
    return raw;
  }
  if (!raw && env.NODE_ENV !== "production") {
    return "mock";
  }
  throw new BackendConfigError(
    `BACKEND_MODE must be "mock" or "http" (got ${raw ? `"${raw}"` : "nothing"}).`,
  );
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BackendConfigError(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

export function httpBackendOptions(env: Env): HttpBackendOptions {
  const baseUrl = env.BACKEND_URL?.trim();
  const secret = env.BACKEND_JWT_SECRET?.trim();
  if (!baseUrl) {
    throw new BackendConfigError("BACKEND_URL is required when BACKEND_MODE=http.");
  }
  if (!secret) {
    throw new BackendConfigError("BACKEND_JWT_SECRET is required when BACKEND_MODE=http.");
  }
  return {
    baseUrl,
    serviceApiKey: env.BACKEND_SERVICE_API_KEY?.trim() || undefined,
    jwt: {
      secret,
      issuer: env.BACKEND_JWT_ISSUER?.trim() || undefined,
      audience: env.BACKEND_JWT_AUDIENCE?.trim() || undefined,
      ttlSeconds: positiveInteger(env.BACKEND_JWT_TTL_SECONDS, 60, "BACKEND_JWT_TTL_SECONDS"),
    },
  };
}

export function mockBackendOptions(env: Env): MockBackendOptions {
  // Mock-only demo credential, never used against a real backend.
  const password = env.MOCK_USER_PASSWORD?.trim() || "brainstorm-demo"; // pragma: allowlist secret
  return {
    streamDelayMs: positiveInteger(env.MOCK_STREAM_DELAY_MS, 40, "MOCK_STREAM_DELAY_MS"),
    users: [
      {
        id: "user-demo",
        email: "demo@example.com",
        displayName: "Demo User",
        password,
        seed: true,
      },
      {
        id: "user-empty",
        email: "empty@example.com",
        displayName: "New User",
        password,
        seed: false,
      },
    ],
  };
}
