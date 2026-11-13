import "server-only";

import { httpBackendOptions } from "./config";
import { HttpBackend } from "./http";

export type { Caller } from "./http";
export { BackendError } from "./errors";

let backend: HttpBackend | undefined;

/**
 * The single entry point to the backend for server code (route handlers, Auth.js
 * callbacks). Configuration is read on first use, so builds need no secrets.
 */
export function getBackend(): HttpBackend {
  backend ??= new HttpBackend(httpBackendOptions(process.env));
  return backend;
}
