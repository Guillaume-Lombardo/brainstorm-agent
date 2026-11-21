import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

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

  it("continues a list with Enter and leaves it with a second Enter", async () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    await userEvent.click(screen.getByRole("button", { name: "Numbered list" }));
    await userEvent.type(input, "milk{Enter}eggs{Enter}{Enter}");
    expect(input).toHaveValue("1. milk\n2. eggs\n");
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(input, "Thanks{Enter}");
    expect(onSend).toHaveBeenCalledWith("1. milk\n2. eggs\nThanks");
  });

  it("turns the current line into a bulleted list", async () => {
    render(<Harness onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "milk");
    await userEvent.click(screen.getByRole("button", { name: "Bulleted list" }));
    await userEvent.type(input, "{Enter}eggs");
    expect(input).toHaveValue("• milk\n• eggs");
  });

  it("stops following a reply once the reader scrolls up", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });
    const view = (text: string) => (
      <Harness onSend={vi.fn()} streaming={{ turnId: "t", status: null, text }} />
    );
    const { container, rerender } = render(view("First"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    const log = container.querySelector('[aria-live="polite"]')!;
    Object.defineProperties(log, {
      scrollHeight: { value: 2000 },
      clientHeight: { value: 500 },
      scrollTop: { value: 200, writable: true },
    });
    fireEvent.scroll(log);
    rerender(view("First words"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    (log as HTMLElement).scrollTop = 1490;
    fireEvent.scroll(log);
    rerender(view("First words, more"));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    // Scrolled up again, then a new question (from any panel) follows its reply.
    (log as HTMLElement).scrollTop = 0;
    fireEvent.scroll(log);
    rerender(
      <Harness
        onSend={vi.fn()}
        messages={[message("user", "Next question")]}
        streaming={{ turnId: null, status: "Sending…", text: "" }}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });
});
