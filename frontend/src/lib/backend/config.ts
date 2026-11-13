import type { HttpBackendOptions } from "./http";

type Env = Record<string, string | undefined>;

/** Shortest accepted shared secret (ADR 0009: at least 32 random bytes). */
const MIN_SECRET_LENGTH = 32;

export class BackendConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendConfigError";
  }
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BackendConfigError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function secret(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new BackendConfigError(`${name} is required.`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new BackendConfigError(`${name} must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }
  return value;
}

/**
 * Read the backend connection settings. Validated on first use, so `next build`
 * never needs secrets.
 */
export function httpBackendOptions(env: Env): HttpBackendOptions {
  const baseUrl = env.BACKEND_URL?.trim();
  if (!baseUrl) {
    throw new BackendConfigError("BACKEND_URL is required.");
  }
  let protocol: string;
  try {
    protocol = new URL(baseUrl).protocol;
  } catch {
    protocol = "";
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new BackendConfigError("BACKEND_URL must be an absolute http(s) URL.");
  }
  const jwtSecret = secret(env, "BACKEND_JWT_SECRET");
  const bridgeSecret = secret(env, "AUTH_BRIDGE_SECRET");
  if (jwtSecret === bridgeSecret) {
    throw new BackendConfigError("AUTH_BRIDGE_SECRET must differ from BACKEND_JWT_SECRET.");
  }
  return {
    baseUrl,
    bridgeSecret,
    jwt: {
      secret: jwtSecret,
      issuer: env.BACKEND_JWT_ISSUER?.trim() || undefined,
      audience: env.BACKEND_JWT_AUDIENCE?.trim() || undefined,
      ttlSeconds: positiveInteger(env.BACKEND_JWT_TTL_SECONDS, 60, "BACKEND_JWT_TTL_SECONDS"),
    },
  };
}
