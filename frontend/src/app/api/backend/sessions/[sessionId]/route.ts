import { BackendError } from "@/lib/backend";
import { optionalString, readJsonObject, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/backend/sessions/[sessionId]">;

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(async (caller, backend) =>
    Response.json(await backend.getSession(caller, sessionId)),
  );
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(async (caller, backend) => {
    const body = await readJsonObject(request);
    const archived = body.archived;
    if (archived !== undefined && typeof archived !== "boolean") {
      throw new BackendError("validation_error", '"archived" must be a boolean.');
    }
    const title = optionalString(body, "title");
    return Response.json(await backend.updateSession(caller, sessionId, { title, archived }));
  });
}
