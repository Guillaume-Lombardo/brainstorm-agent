// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("./index", () => ({ getBackend: () => ({}) }));

import { BackendError } from "./errors";
import { readJsonObject, requireStage, withCaller } from "./route";

describe("withCaller", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("answers 401 JSON without a signed-in user", async () => {
    authMock.mockResolvedValue(null);
    const handler = vi.fn();
    const response = await withCaller(handler);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the user id as caller and relays backend errors with Retry-After", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await withCaller(async (caller) => {
      expect(caller).toEqual({ userId: "user-1" });
      throw new BackendError("rate_limited", "Slow down", { retryAfterSeconds: 7 });
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "Slow down", retryAfterSeconds: 7 },
    });
  });

  it("hides unexpected errors behind a 503", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await withCaller(async () => {
      throw new Error("database password leaked in message");
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("password");
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
