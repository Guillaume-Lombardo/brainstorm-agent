import { json, withCaller } from "@/lib/backend/route";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: RouteContext<"/api/backend/sessions/[sessionId]/research">) {
  const {sessionId} = await context.params;
  return withCaller(request, async (caller, backend) => json(await backend.researchHistory(caller, sessionId)));
}
export async function POST(request: Request, context: RouteContext<"/api/backend/sessions/[sessionId]/research">) {
  const {sessionId} = await context.params;
  return withCaller(request, async (caller, backend) => {
    const response = await backend.research(caller, sessionId, request.signal);
    return new Response(response.body, {headers: {"content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no"}});
  });
}
