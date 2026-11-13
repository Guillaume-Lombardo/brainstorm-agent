import { BackendError } from "@/lib/backend";
import { json, sseResponse, withCaller } from "@/lib/backend/route";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/research">,
) {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) =>
    json(await backend.researchHistory(caller, sessionId)),
  );
}
export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/research">,
) {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const response = await backend.research(caller, sessionId, request.signal);
    if (!response.body) {
      throw new BackendError("backend_unavailable", "The backend returned no research stream.");
    }
    return sseResponse(response.body);
  });
}
