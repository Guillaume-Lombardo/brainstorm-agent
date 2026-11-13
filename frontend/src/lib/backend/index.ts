import "server-only";

import type { BackendClient } from "./client";
import { httpBackendOptions, mockBackendOptions, resolveBackendMode } from "./config";
import { HttpBackend } from "./http";
import { MockBackend } from "./mock";

export type { BackendClient, Caller } from "./client";
export { BackendError } from "./errors";

const globalForBackend = globalThis as typeof globalThis & {
  __brainstormBackend?: BackendClient;
};

/**
 * The single entry point to the backend for server code (route handlers,
 * Auth.js callbacks). The instance is cached on `globalThis` so the in-memory
 * mock keeps its state across hot reloads and route bundles.
 */
export function getBackend(): BackendClient {
  if (!globalForBackend.__brainstormBackend) {
    const env = process.env;
    globalForBackend.__brainstormBackend =
      resolveBackendMode(env) === "http"
        ? new HttpBackend(httpBackendOptions(env))
        : new MockBackend(mockBackendOptions(env));
  }
  return globalForBackend.__brainstormBackend;
}
