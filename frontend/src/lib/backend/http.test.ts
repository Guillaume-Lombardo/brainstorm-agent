// @vitest-environment node
import { jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";

import { BackendError } from "./errors";
import { HttpBackend } from "./http";

const SECRET = "unit-test-signing-secret-0123456789"; // pragma: allowlist secret
const BRIDGE = "unit-test-bridge-secret-0123456789"; // pragma: allowlist secret
const SESSION = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

function client(fetchImpl: typeof fetch) {
  return new HttpBackend({
    baseUrl: "http://backend:8000",
    bridgeSecret: BRIDGE,
    jwt: {
      secret: SECRET,
      issuer: "brainstorm-frontend",
      audience: "brainstorm-backend",
      ttlSeconds: 60,
    },
    fetchImpl,
  });
}

function headersOf(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) {
  return fetchImpl.mock.calls[call][1]?.headers as Record<string, string>;
}

describe("HttpBackend", () => {
  it("calls the backend with a short-lived JWT whose subject is the user id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ items: [], total: 0, offset: 0, limit: 100 }),
    );
    await client(fetchImpl).listSessions({ userId: "user-7" }, { includeArchived: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "http://backend:8000/api/v1/sessions?include_archived=true&offset=0&limit=100",
    );
    expect(init?.redirect).toBe("error");
    const headers = headersOf(fetchImpl);
    expect(headers["x-auth-bridge"]).toBeUndefined();
    const { payload } = await jwtVerify(
      headers.authorization.replace("Bearer ", ""),
      new TextEncoder().encode(SECRET),
      { issuer: "brainstorm-frontend", audience: "brainstorm-backend" },
    );
    expect(payload.sub).toBe("user-7");
    expect(payload.exp! - payload.iat!).toBe(60);
  });

  it("checks passwords through the login bridge and maps 401 to null", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ detail: "Invalid credentials" }, { status: 401 }),
    );
    await expect(client(fetchImpl).verifyCredentials("a@b.c", "x")).resolves.toBeNull();
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://backend:8000/api/v1/auth/verify");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      email: "a@b.c",
      password: "x", // pragma: allowlist secret
    });
    const headers = headersOf(fetchImpl);
    expect(headers["x-auth-bridge"]).toBe(BRIDGE);
    expect(headers.authorization).toBeUndefined();
  });

  it("raises the backend login limit as rate_limited with its retry hint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(
        { detail: "Too many login attempts" },
        { status: 429, headers: { "retry-after": "12" } },
      ),
    );
    const error = await client(fetchImpl)
      .verifyCredentials("a@b.c", "x")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BackendError);
    expect(error).toMatchObject({ code: "rate_limited", status: 429, retryAfterSeconds: 12 });
  });

  it("resolves OIDC identities through the bridge", async () => {
    const user = { id: "u1", email: "a@b.c", display_name: "A" };
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(user));
    const identity = { issuer: "https://idp", subject: "s", email: "a@b.c", display_name: "A" };
    await expect(client(fetchImpl).resolveOidcUser(identity)).resolves.toEqual(user);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://backend:8000/api/v1/auth/oidc");
    expect(headersOf(fetchImpl)["x-auth-bridge"]).toBe(BRIDGE);
  });

  it.each([
    [409, "conflict", "Stage review pending"],
    [404, "not_found", "Session not found"],
    [403, "forbidden", "Not your session"],
  ])("maps %i to %s with the backend detail", async (status, code, detail) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ detail }, { status }));
    await expect(client(fetchImpl).getSession({ userId: "u" }, SESSION)).rejects.toMatchObject({
      code,
      status,
      message: detail,
    });
  });

  it("hides the detail of backend server and model errors", async () => {
    const leak = { detail: "Traceback: db password rejected" };
    const server = vi.fn<typeof fetch>(async () => Response.json(leak, { status: 500 }));
    await expect(client(server).getSession({ userId: "u" }, SESSION)).rejects.toMatchObject({
      code: "backend_unavailable",
      message: "The backend is unavailable. Try again.",
    });
    const model = vi.fn<typeof fetch>(async () => Response.json(leak, { status: 502 }));
    await expect(client(model).getSession({ userId: "u" }, SESSION)).rejects.toMatchObject({
      code: "llm_error",
      message: "The language model failed to answer. Try again.",
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
        backend.editField({ userId: "u" }, SESSION, "stage_0_pitch", id, "v"),
      ).rejects.toMatchObject({ code: "validation_error" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("sends typed field values and review actions", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({}));
    const backend = client(fetchImpl);
    await backend.editField({ userId: "u" }, SESSION, "stage_0_pitch", "clear_points", ["a"]);
    await backend.submitReview({ userId: "u" }, SESSION, {
      stage: "stage_0_pitch",
      action: "approve",
      note: null,
    });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      `http://backend:8000/api/v1/sessions/${SESSION}/stages/stage_0_pitch/fields/clear_points`,
    );
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ value: ["a"] });
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      `http://backend:8000/api/v1/sessions/${SESSION}/review`,
    );
  });

  it("reports an unreachable backend as 503", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(client(fetchImpl).getSession({ userId: "u" }, SESSION)).rejects.toMatchObject({
      code: "backend_unavailable",
      status: 503,
    });
  });

  it("returns the SSE body of a turn", async () => {
    const body = new ReadableStream<Uint8Array>();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }));
    await expect(client(fetchImpl).streamTurn({ userId: "u" }, SESSION, "hi")).resolves.toBe(body);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`http://backend:8000/api/v1/sessions/${SESSION}/turns`);
    expect(JSON.parse(String(init?.body))).toEqual({ content: "hi", modality: "text" });
    expect(headersOf(fetchImpl).accept).toBe("text/event-stream");
  });

  it("raises a pending review before the stream as review_pending", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ detail: "Human review pending" }, { status: 409 }),
    );
    await expect(
      client(fetchImpl).streamTurn({ userId: "u" }, SESSION, "hi"),
    ).rejects.toMatchObject({ code: "review_pending", status: 409 });
  });
});
