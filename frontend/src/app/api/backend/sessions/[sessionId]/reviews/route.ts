import { BackendError } from "@/lib/backend";
import {
  optionalString,
  readJsonObject,
  requireStage,
  requireString,
  withCaller,
} from "@/lib/backend/route";
import { REVIEW_ACTIONS, type ReviewAction } from "@/lib/backend/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/reviews">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(async (caller, backend) => {
    const body = await readJsonObject(request);
    const action = requireString(body, "action");
    if (!(REVIEW_ACTIONS as readonly string[]).includes(action)) {
      throw new BackendError("validation_error", `Unknown review action "${action}".`);
    }
    const detail = await backend.submitReview(caller, sessionId, {
      stage: requireStage(requireString(body, "stage")),
      action: action as ReviewAction,
      note: optionalString(body, "note"),
    });
    return Response.json(detail);
  });
}
