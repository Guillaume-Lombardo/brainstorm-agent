import { readJsonObject, requireString, sseResponse, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** Start a turn and relay its typed Server-Sent Events. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/turns">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(async (caller, backend) => {
    const body = await readJsonObject(request);
    const stream = await backend.streamTurn(
      caller,
      sessionId,
      { message: requireString(body, "message") },
      request.signal,
    );
    return sseResponse(stream);
  });
}
