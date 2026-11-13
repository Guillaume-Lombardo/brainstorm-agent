import { BackendError } from "@/lib/backend";
import { json, readJsonObject, requireStage, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/**
 * Edit one field of the active stage. `value` is the typed JSON value of the
 * stage contract (string, list of strings, boolean or null); the backend validates it.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/fields/[field]">,
): Promise<Response> {
  const { sessionId, stage, field } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const body = await readJsonObject(request);
    if (!("value" in body)) {
      throw new BackendError("validation_error", '"value" is required.');
    }
    return json(await backend.editField(caller, sessionId, requireStage(stage), field, body.value));
  });
}
