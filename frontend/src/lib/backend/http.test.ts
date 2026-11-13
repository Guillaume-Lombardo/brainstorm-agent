// @vitest-environment node
import { jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";

import { BackendError } from "./errors";
import { HttpBackend } from "./http";

const SECRET = "unit-test-signing-secret-0123456789"; // pragma: allowlist secret

function client(fetchImpl: typeof fetch) {
  return new HttpBackend({
    baseUrl: "http://backend:8000",
    serviceApiKey: "service-key", // pragma: allowlist secret
    jwt: {
      secret: SECRET,
      issuer: "brainstorm-frontend",
      audience: "brainstorm-api",
      ttlSeconds: 60,
    },
    fetchImpl,
  });
}

describe("HttpBackend", () => {
  it("calls the backend with a short-lived JWT whose subject is the user id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json([]));
    await client(fetchImpl).listSessions({ userId: "user-7" }, { includeArchived: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://backend:8000/api/v1/sessions?include_archived=true");
    const authorization = (init?.headers as Record<string, string>).authorization;
    const token = authorization.replace("Bearer ", "");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "brainstorm-frontend",
      audience: "brainstorm-api",
    });
    expect(payload.sub).toBe("user-7");
    expect(payload.exp! - payload.iat!).toBe(60);
  });

  it("uses the service key for credential checks and maps 401 to null", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ detail: "bad" }, { status: 401 }),
    );
    await expect(client(fetchImpl).verifyCredentials("a@b.c", "x")).resolves.toBeNull();
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("service-key");
    expect(headers.authorization).toBeUndefined();
  });

  it("maps error statuses to backend errors with retry hints", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ detail: "Slow down" }, { status: 429, headers: { "retry-after": "12" } }),
    );
    const error = await client(fetchImpl)
      .getSession({ userId: "u" }, "s1")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BackendError);
    expect(error).toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfterSeconds: 12,
      message: "Slow down",
    });
  });

  it("hides the detail of backend server errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ detail: "Traceback: db password rejected" }, { status: 500 }),
    );
    await expect(client(fetchImpl).getSession({ userId: "u" }, "s1")).rejects.toMatchObject({
      message: "Backend request failed (500).",
    });
  });

  it.each([".", "..", "a/b", "%2e%2e", ""])(
    "rejects the identifier %j before calling the backend",
    async (id) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const backend = client(fetchImpl);
      await expect(backend.getSession({ userId: "u" }, id)).rejects.toMatchObject({
        code: "validation_error",
        status: 422,
      });
      await expect(
        backend.updateField({ userId: "u" }, "s1", "stage_0_pitch", id, "v"),
      ).rejects.toMatchObject({ code: "validation_error" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("reports an unreachable backend as 503", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(client(fetchImpl).getSession({ userId: "u" }, "s1")).rejects.toMatchObject({
      code: "backend_unavailable",
      status: 503,
    });
  });

  it("returns the SSE body of a turn", async () => {
    const body = new ReadableStream<Uint8Array>();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }));
    await expect(
      client(fetchImpl).streamTurn({ userId: "u" }, "s-1", { message: "hi" }),
    ).resolves.toBe(body);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "http://backend:8000/api/v1/sessions/s-1/turns",
    );
  });
});
