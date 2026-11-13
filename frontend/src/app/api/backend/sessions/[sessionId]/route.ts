import { BackendError } from "@/lib/backend";
import { json, optionalString, readJsonObject, withCaller } from "@/lib/backend/route";
import type { SessionSnapshot } from "@/lib/backend/types";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/backend/sessions/[sessionId]">;

/** Session state and conversation history in one response. */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const [session, messages] = await Promise.all([
      backend.getSession(caller, sessionId),
      backend.listMessages(caller, sessionId),
    ]);
    return json({ session, messages } satisfies SessionSnapshot);
  });
}

/** Rename or archive. */
export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const body = await readJsonObject(request);
    const archived = body.archived;
    if (archived !== undefined && typeof archived !== "boolean") {
      throw new BackendError("validation_error", '"archived" must be a boolean.');
    }
    const title = optionalString(body, "title")?.trim();
    if (title !== undefined && title.length === 0) {
      throw new BackendError("validation_error", "The title cannot be empty.");
    }
    return json(await backend.updateSession(caller, sessionId, { title, archived }));
  });
}
