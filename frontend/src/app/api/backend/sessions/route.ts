import { readJsonObject, requireString, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const includeArchived = new URL(request.url).searchParams.get("archived") === "include";
  return withCaller(async (caller, backend) =>
    Response.json(await backend.listSessions(caller, { includeArchived })),
  );
}

export async function POST(request: Request): Promise<Response> {
  return withCaller(async (caller, backend) => {
    const body = await readJsonObject(request);
    const session = await backend.createSession(caller, { title: requireString(body, "title") });
    return Response.json(session, { status: 201 });
  });
}
