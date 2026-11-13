// @vitest-environment node
import { describe, expect, it } from "vitest";

import { encodeSseEvent } from "@/lib/backend/sse";
import type { TurnEvent } from "@/lib/backend/types";

import { parseTurnEvents } from "./sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events: TurnEvent[] = [];
  for await (const event of parseTurnEvents(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseTurnEvents", () => {
  it("parses frames split across chunks and CRLF line endings", async () => {
    const events = await collect(
      streamOf([
        'event: message.delta\r\ndata: {"type":"message.delta","messageId":"m","del',
        'ta":"Hel"}\r\n\r\nevent: message.delta\ndata: {"type":"message.delta","messageId":"m","delta":"lo"}\n\n',
      ]),
    );
    expect(events.map((event) => (event.type === "message.delta" ? event.delta : ""))).toEqual([
      "Hel",
      "lo",
    ]);
  });

  it("round-trips encoded events and skips comments, unknown types and bad JSON", async () => {
    const decoder = new TextDecoder();
    const started = decoder.decode(
      encodeSseEvent({ type: "turn.started", turnId: "t", stage: "stage_0_pitch" }),
    );
    const events = await collect(
      streamOf([": keep-alive\n\n", 'data: {"type":"other"}\n\n', "data: {oops\n\n", started]),
    );
    expect(events).toEqual([{ type: "turn.started", turnId: "t", stage: "stage_0_pitch" }]);
  });

  it("parses a final frame without the trailing blank line", async () => {
    const events = await collect(
      streamOf(['data: {"type":"error","code":"llm_error","message":"x"}']),
    );
    expect(events).toEqual([{ type: "error", code: "llm_error", message: "x" }]);
  });
});
