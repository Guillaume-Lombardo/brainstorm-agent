// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("./index", () => ({ getBackend: () => ({}) }));

import { BackendError } from "./errors";
import { checkMutation, readJsonObject, requireStage, withCaller } from "./route";

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
