// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("./index", () => ({ getBackend: () => ({}) }));

import { BackendError } from "./errors";
import { checkMutation, readJsonObject, requireStage, sseResponse, withCaller } from "./route";

const get = () => new Request("http://app.test/api/backend/sessions");

function post(headers: Record<string, string>, body: string | null = "{}") {
  return new Request("http://app.test/api/backend/sessions", {
    method: "POST",
    headers: { host: "app.test", ...headers },
    body,
  });
}

describe("withCaller", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("answers 401 JSON without a signed-in user", async () => {
    authMock.mockResolvedValue(null);
    const handler = vi.fn();
    const response = await withCaller(get(), handler);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the user id as caller and relays backend errors with Retry-After", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await withCaller(get(), async (caller) => {
      expect(caller).toEqual({ userId: "user-1" });
      throw new BackendError("rate_limited", "Slow down", { retryAfterSeconds: 7 });
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "Slow down", retryAfterSeconds: 7 },
    });
  });

  it("relays a pending review as 409 review_pending", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await withCaller(get(), async () => {
      throw new BackendError("review_pending", "Review first");
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "review_pending" } });
  });

  it("hides unexpected errors behind a 503", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await withCaller(get(), async () => {
      throw new Error("database password leaked in message");
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });

  it("rejects a cross-site mutation before reading the session", async () => {
    const response = await withCaller(
      post({ origin: "https://evil.test", "content-type": "application/json" }),
      vi.fn(),
    );
    expect(response.status).toBe(403);
    expect(authMock).not.toHaveBeenCalled();
  });
});

describe("checkMutation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets safe methods through", () => {
    expect(checkMutation(get())).toBeNull();
  });

  it("accepts a same-origin JSON mutation", () => {
    expect(
      checkMutation(
        post({
          origin: "http://app.test",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        }),
      ),
    ).toBeNull();
  });

  it("rejects cross-site fetch metadata and foreign origins", () => {
    expect(
      checkMutation(post({ "sec-fetch-site": "cross-site", "content-type": "application/json" })),
    ).toMatchObject({ code: "forbidden" });
    expect(
      checkMutation(post({ origin: "http://evil.test", "content-type": "application/json" })),
    ).toMatchObject({ code: "forbidden" });
  });

  it("compares the origin with AUTH_URL when it is set", () => {
    vi.stubEnv("AUTH_URL", "https://brainstorm.example");
    expect(
      checkMutation(post({ origin: "http://app.test", "content-type": "application/json" })),
    ).toMatchObject({ code: "forbidden" });
    expect(
      checkMutation(
        post({ origin: "https://brainstorm.example", "content-type": "application/json" }),
      ),
    ).toBeNull();
  });

  it("requires JSON bodies, which a cross-site form cannot send", () => {
    expect(checkMutation(post({ "content-type": "text/plain" }))).toMatchObject({
      code: "validation_error",
    });
    expect(checkMutation(post({}, null))).toBeNull();
  });
});

describe("request validation", () => {
  it("rejects non-object JSON bodies and unknown stages", async () => {
    await expect(
      readJsonObject(new Request("http://x", { method: "POST", body: "[1]" })),
    ).rejects.toMatchObject({ status: 422 });
    expect(() => requireStage("stage_9")).toThrow(BackendError);
    expect(requireStage("stage_7_delivery_slicing")).toBe("stage_7_delivery_slicing");
  });
});

/** Upstream SSE body that writes each chunk after its delay, then closes. */
function timedStream(chunks: Array<[delayMs: number, text: string]>, onCancel = vi.fn()) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [delayMs, text] of chunks) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
    cancel: onCancel,
  });
}

describe("sseResponse", () => {
  const completed = 'event: turn.completed\ndata: {"type":"turn.completed"}\n\n';

  it("relays keepalive comments and frames unchanged", async () => {
    const response = sseResponse(
      timedStream([
        [0, 'event: turn.started\ndata: {"type":"turn.started"}\n\n'],
        [10, ": keepalive\n\n"],
        [10, ": keepalive\n\n"],
        [10, completed],
      ]),
      { idleMs: 1_000 },
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toBe(
      'event: turn.started\ndata: {"type":"turn.started"}\n\n: keepalive\n\n: keepalive\n\n' +
        completed,
    );
  });

  it("keeps a long turn open while keepalives arrive within the idle delay", async () => {
    const keepalives = Array.from({ length: 6 }, (): [number, string] => [15, ": keepalive\n\n"]);
    const response = sseResponse(timedStream([...keepalives, [15, completed]]), { idleMs: 60 });
    const text = await response.text();
    expect(text.endsWith(completed)).toBe(true);
    expect(text).not.toContain("event: error");
  });

  it("keeps research synthesis open beyond the idle delay while comments arrive", async () => {
    const complete = 'event: research.completed\ndata: {"version":1}\n\n';
    const frames: [number, string][] = Array.from({ length: 6 }, () => [15, ": keepalive\n\n"]);
    const response = sseResponse(timedStream([...frames, [15, complete]]), { idleMs: 60 });
    expect(await response.text()).toBe(frames.map(([, frame]) => frame).join("") + complete);
  });

  it("ends a silent stream with a turn_failed error and cancels the backend request", async () => {
    const onCancel = vi.fn();
    const response = sseResponse(
      timedStream(
        [
          [0, ": keepalive\n\n"],
          [500, completed],
        ],
        onCancel,
      ),
      { idleMs: 30 },
    );
    const text = await response.text();
    expect(text.startsWith(": keepalive\n\n")).toBe(true);
    expect(text).not.toContain("turn.completed");
    const frames = text.split("\n\n").filter((frame) => frame.startsWith("event: error"));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0].split("\ndata: ")[1])).toEqual({
      type: "error",
      code: "turn_failed",
      message: "The turn stopped responding; retry the request.",
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
