// @vitest-environment node
import { describe, expect, it } from "vitest";

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

/** A frame exactly as the backend writes it (`event:` then `data:`). */
function frame(event: TurnEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

describe("parseTurnEvents", () => {
  it("parses frames split across chunks and CRLF line endings", async () => {
    const events = await collect(
      streamOf([
        'event: message.delta\r\ndata: {"type":"message.delta","del',
        'ta":"Hel"}\r\n\r\nevent: message.delta\ndata: {"type":"message.delta","delta":"lo"}\n\n',
      ]),
    );
    expect(events.map((event) => (event.type === "message.delta" ? event.delta : ""))).toEqual([
      "Hel",
      "lo",
    ]);
  });

  it("keeps a multi-line frame whose CRLF is split between chunks", async () => {
    const events = await collect(
      streamOf(['data: {"type":"message.delta",\r', '\ndata: "delta":"ok"}\r\n\r\n']),
    );
    expect(events).toEqual([{ type: "message.delta", delta: "ok" }]);
  });

  it("parses backend frames and skips comments, unknown types and bad JSON", async () => {
    const started: TurnEvent = { type: "turn.started", turn_id: "t", stage: "stage_0_pitch" };
    const events = await collect(
      streamOf([
        ": keep-alive\n\n",
        'data: {"type":"other"}\n\n',
        "data: {oops\n\n",
        frame(started),
      ]),
    );
    expect(events).toEqual([started]);
  });

  it("ignores the backend keepalive comments between deltas, even split across chunks", async () => {
    const events = await collect(
      streamOf([
        frame({ type: "message.delta", delta: "Hel" }),
        ": keepalive\n\n: keep",
        "alive\n",
        "\n",
        frame({ type: "message.delta", delta: "lo" }),
        ": keepalive\n\n",
      ]),
    );
    expect(events).toEqual([
      { type: "message.delta", delta: "Hel" },
      { type: "message.delta", delta: "lo" },
    ]);
  });

  it("parses a final frame without the trailing blank line", async () => {
    const events = await collect(
      streamOf(['data: {"type":"error","code":"turn_failed","message":"x"}']),
    );
    expect(events).toEqual([{ type: "error", code: "turn_failed", message: "x" }]);
  });
});
