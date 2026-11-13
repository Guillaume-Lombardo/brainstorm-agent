import { BackendError } from "@/lib/backend";
import {
  json,
  optionalString,
  readJsonObject,
  requireStage,
  requireString,
  withCaller,
} from "@/lib/backend/route";
import { isReviewAction } from "@/lib/backend/types";

export const dynamic = "force-dynamic";

/** Approve, reject or request changes on the pending stage. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/review">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const body = await readJsonObject(request);
    const action = requireString(body, "action");
    if (!isReviewAction(action)) {
      throw new BackendError("validation_error", `Unknown review action "${action}".`);
    }
    const session = await backend.submitReview(caller, sessionId, {
      stage: requireStage(requireString(body, "stage")),
      action,
      note: optionalString(body, "note")?.trim() || null,
    });
    return json(session);
  });
}
