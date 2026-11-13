import "server-only";

import { auth } from "@/auth";

import { BackendError } from "./errors";
import type { Caller, HttpBackend } from "./http";
import { getBackend } from "./index";
import { isStage, type Stage } from "./types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** JSON error response with the shared `ErrorBody` shape. */
function errorResponse(error: BackendError): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (error.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(error.retryAfterSeconds));
  }
  return Response.json(error.toBody(), { status: error.status, headers });
}

/** Origin the browser must send on mutating requests: `AUTH_URL`, else the `Host` header. */
function expectedOrigin(request: Request): string | null {
  const configured = process.env.AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return null;
    }
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) {
    return null;
  }
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol;
  return `${protocol.replace(/:$/, "")}://${host}`;
}

/**
 * Cross-site request forgery guard for mutating routes. The session cookie is
 * `SameSite=Lax`; on top of it, a mutating request must come from this origin and,
 * when it has a body, be JSON (which a cross-site form cannot send without CORS).
 */
export function checkMutation(request: Request): BackendError | null {
  if (SAFE_METHODS.has(request.method)) {
    return null;
  }
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((site && site !== "same-origin") || (origin && origin !== expectedOrigin(request))) {
    return new BackendError("forbidden", "Cross-site requests are not allowed.");
  }
  const length = request.headers.get("content-length");
  const hasBody = request.body !== null && length !== "0";
  const type = request.headers.get("content-type") ?? "";
  if (hasBody && !/^application\/json\b/i.test(type)) {
    return new BackendError("validation_error", "The request body must be application/json.");
  }
  return null;
}

/**
 * Run a route handler for the signed-in user. Credentials and backend tokens
 * never leave the server: the browser only sees this proxy's JSON or SSE.
 */
export async function withCaller(
  request: Request,
  handler: (caller: Caller, backend: HttpBackend) => Promise<Response>,
): Promise<Response> {
  const rejected = checkMutation(request);
  if (rejected) {
    return errorResponse(rejected);
  }
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

export function requireStage(value: string): Stage {
  if (!isStage(value)) {
    throw new BackendError("validation_error", `Unknown stage "${value}".`);
  }
  return value;
}

/**
 * Longest silence accepted from the backend on a turn stream: four of its
 * 15 s keepalive comments. It no longer depends on the LLM timeout, since the
 * backend speaks during every long provider call and its retries.
 */
const TURN_STREAM_IDLE_MS = 60_000;

/** Terminal frame sent when the backend stops speaking; the blank line first ends any partial frame. */
const IDLE_ERROR_FRAME = `\n\nevent: error\ndata: ${JSON.stringify({
  type: "error",
  code: "turn_failed",
  message: "The turn stopped responding; retry the request.",
})}\n\n`;

/** Relay `upstream` chunk by chunk; past `idleMs` of silence, end it with an error and cancel it. */
function withIdleTimeout(
  upstream: ReadableStream<Uint8Array>,
  idleMs: number,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const idle = new Promise<"idle">((resolve) => {
        timer = setTimeout(() => resolve("idle"), idleMs);
      });
      try {
        const result = await Promise.race([reader.read(), idle]);
        if (result === "idle") {
          controller.enqueue(new TextEncoder().encode(IDLE_ERROR_FRAME));
          controller.close();
          await reader.cancel("The backend turn stream went silent.").catch(() => undefined);
        } else if (result.done) {
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } finally {
        clearTimeout(timer);
      }
    },
    async cancel(reason) {
      clearTimeout(timer);
      await reader.cancel(reason);
    },
  });
}

/**
 * Relay a turn event stream to the browser without buffering. Keepalive
 * comments pass through unchanged, so the reverse proxies see traffic too.
 */
export function sseResponse(
  stream: ReadableStream<Uint8Array>,
  { idleMs = TURN_STREAM_IDLE_MS }: { idleMs?: number } = {},
): Response {
  return new Response(withIdleTimeout(stream, idleMs), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/** JSON response that must never be cached (per-user data). */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}
