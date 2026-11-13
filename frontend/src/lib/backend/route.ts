import "server-only";

import { auth } from "@/auth";

import type { BackendClient, Caller } from "./client";
import { BackendError } from "./errors";
import { getBackend } from "./index";
import { isStageId, type StageId } from "./types";

/** JSON error response with the shared `ErrorBody` shape. */
export function errorResponse(error: BackendError): Response {
  const headers = new Headers();
  if (error.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(error.retryAfterSeconds));
  }
  return Response.json(error.toBody(), { status: error.status, headers });
}

/**
 * Run a route handler for the signed-in user. Credentials and backend tokens
 * never leave the server: the browser only sees this proxy's JSON or SSE.
 */
export async function withCaller(
  handler: (caller: Caller, backend: BackendClient) => Promise<Response>,
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return errorResponse(
      new BackendError("unauthorized", "Your session has expired. Sign in again."),
    );
  }
  try {
    return await handler({ userId }, getBackend());
  } catch (error) {
    if (error instanceof BackendError) {
      return errorResponse(error);
    }
    console.error("Backend proxy failure", error);
    return errorResponse(new BackendError("backend_unavailable", "Unexpected server error."));
  }
}

/** Parse a JSON object body or raise a 422 `validation_error`. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BackendError("validation_error", "The request body must be JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BackendError("validation_error", "The request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw new BackendError("validation_error", `"${key}" must be a string.`);
  }
  return value;
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BackendError("validation_error", `"${key}" must be a string.`);
  }
  return value;
}

export function requireStage(value: string): StageId {
  if (!isStageId(value)) {
    throw new BackendError("validation_error", `Unknown stage "${value}".`);
  }
  return value;
}

/** Relay a turn event stream to the browser without buffering. */
export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
