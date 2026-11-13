import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./chat-panel";
import type { StreamingTurn, TurnFailure } from "./state";

function Harness({
  streaming = null,
  error = null,
  blockedReason = null,
  pending = false,
  onSend,
}: {
  streaming?: StreamingTurn | null;
  error?: TurnFailure | null;
  blockedReason?: string | null;
  pending?: boolean;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <ChatPanel
      messages={[]}
      streaming={streaming}
      error={error}
      blockedReason={blockedReason}
      pending={pending}
      draft={draft}
      onDraftChange={setDraft}
      onSend={onSend}
    />
  );
}

describe("ChatPanel", () => {
  it("sends the trimmed draft with Enter", async () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "  Hello  {Enter}");
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("does not send while another workspace action is saving", async () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} pending />);
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows the streaming status and partial answer", () => {
    render(
      <Harness onSend={vi.fn()} streaming={{ turnId: "t", status: "Checking", text: "Partial" }} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checking");
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("blocks input while a review is pending and shows turn errors", () => {
    render(
      <Harness
        onSend={vi.fn()}
        blockedReason="Pitch is waiting for your review."
        error={{ code: "rate_limited", message: "Slow", status: 429, retryAfterSeconds: 5 }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
    expect(screen.getByText("Pitch is waiting for your review.")).toBeInTheDocument();
    expect(screen.getByText("Try again in 5 seconds.")).toBeInTheDocument();
  });
});
