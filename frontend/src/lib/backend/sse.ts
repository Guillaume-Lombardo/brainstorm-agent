import type { TurnEvent } from "./types";

const encoder = new TextEncoder();

/** Serialize one turn event as a Server-Sent Events frame. */
export function encodeSseEvent(event: TurnEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
