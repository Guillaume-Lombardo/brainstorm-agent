import { TURN_EVENT_TYPES, type TurnEvent } from "@/lib/backend/types";

/**
 * Parse a Server-Sent Events byte stream into typed turn events.
 * Frames are separated by a blank line; only `data:` lines carry the JSON
 * payload, whose `type` must be a known turn event.
 */
export async function* parseTurnEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<TurnEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // A chunk may end between the `\r` and `\n` of a CRLF: keep that `\r`
      // for the next chunk instead of reading it as a line break now.
      const carry = !done && buffer.endsWith("\r") ? "\r" : "";
      buffer = buffer.slice(0, buffer.length - carry.length).replace(/\r\n?/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const event = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) {
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }
      buffer += carry;
      if (done) {
        const event = parseFrame(buffer);
        if (event) {
          yield event;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): TurnEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (data.length === 0) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    TURN_EVENT_TYPES.includes((payload as { type?: TurnEvent["type"] }).type as TurnEvent["type"])
  ) {
    return payload as TurnEvent;
  }
  return null;
}
