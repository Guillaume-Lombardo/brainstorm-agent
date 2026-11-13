import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./chat-panel";
import type { StreamingTurn, TurnFailure } from "./state";
import type { ChatMessage } from "./view-model";

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: `${role}-${content.length}`, role, content };
}

function Harness({
  messages = [],
  streaming = null,
  error = null,
  blockedReason = null,
  pending = false,
  onSend,
}: {
  messages?: ChatMessage[];
  streaming?: StreamingTurn | null;
  error?: TurnFailure | null;
  blockedReason?: string | null;
  pending?: boolean;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <ChatPanel
      messages={messages}
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

  it("renders assistant Markdown without interpreting raw HTML", () => {
    const { container } = render(
      <Harness
        onSend={vi.fn()}
        messages={[
          message(
            "assistant",
            "**Next step**\n\n- Option A *(recommandé)*\n- Option B\n\n<b>raw</b><script>alert(1)</script>",
          ),
        ]}
      />,
    );
    const bubble = container.querySelector('[data-role="assistant"]');
    expect(bubble?.querySelector("strong")).toHaveTextContent("Next step");
    expect(bubble?.querySelectorAll("li")).toHaveLength(2);
    expect(bubble?.querySelector("em")).toHaveTextContent("(recommandé)");
    expect(bubble).not.toHaveTextContent("*");
    expect(bubble?.querySelector("b, script")).toBeNull();
    expect(bubble).toHaveTextContent("<b>raw</b>");
  });

  it("keeps user messages as plain text", () => {
    const { container } = render(
      <Harness
        onSend={vi.fn()}
        messages={[message("user", "- not a list **literal** <b>x</b>")]}
      />,
    );
    const bubble = container.querySelector('[data-role="user"]');
    expect(bubble).toHaveTextContent("- not a list **literal** <b>x</b>");
    expect(bubble?.querySelector("li, strong, b")).toBeNull();
  });

  it("streams incomplete Markdown without breaking the bubble", () => {
    const { container } = render(
      <Harness
        onSend={vi.fn()}
        streaming={{ turnId: "t", status: null, text: "- First *(recomm" }}
      />,
    );
    const bubble = container.querySelector(
      '[data-testid="streaming-turn"] [data-role="assistant"]',
    );
    expect(bubble?.querySelector("li")).toHaveTextContent("First *(recomm");
  });
});
