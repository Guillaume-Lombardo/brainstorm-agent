import { BackendError } from "@/lib/backend";
import { json, readJsonObject, withCaller } from "@/lib/backend/route";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: RouteContext<"/api/backend/sessions/[sessionId]/research/[benchmarkId]/selection">) {
  const {sessionId, benchmarkId} = await context.params;
  return withCaller(request, async (caller, backend) => {
    const body = await readJsonObject(request);
    if (!Array.isArray(body.selected_ids) || !body.selected_ids.every((id) => typeof id === "string")) throw new BackendError("validation_error", "Sélection invalide.");
    return json(await backend.selectResearch(caller, sessionId, benchmarkId, body.selected_ids));
  });
}
