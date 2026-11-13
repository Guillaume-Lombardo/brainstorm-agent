import { json, readJsonObject, requireString, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** `?archived=include` also lists archived sessions. */
export async function GET(request: Request): Promise<Response> {
  const includeArchived = new URL(request.url).searchParams.get("archived") === "include";
  return withCaller(request, async (caller, backend) =>
    json(await backend.listSessions(caller, { includeArchived })),
  );
}

export async function POST(request: Request): Promise<Response> {
  return withCaller(request, async (caller, backend) => {
    const body = await readJsonObject(request);
    const created = await backend.createSession(caller, requireString(body, "title").trim());
    return json(created, { status: 201 });
  });
}
