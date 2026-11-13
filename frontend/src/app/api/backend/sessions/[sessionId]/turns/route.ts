import { readJsonObject, requireString, sseResponse, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** Start a turn and relay the backend's typed Server-Sent Events unchanged. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/turns">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const body = await readJsonObject(request);
    const stream = await backend.streamTurn(
      caller,
      sessionId,
      requireString(body, "message"),
      request.signal,
    );
    return sseResponse(stream);
  });
}
