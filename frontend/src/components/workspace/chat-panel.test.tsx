import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import type { Stage } from "@/lib/backend/types";

import { ChatPanel } from "./chat-panel";
import type { StreamingTurn, TurnFailure } from "./state";
import type { QueuedMessage } from "./turn-queue";
import type { ChatMessage } from "./view-model";

function message(
  role: ChatMessage["role"],
  content: string,
  stage: Stage = "stage_0_pitch",
): ChatMessage {
  return { id: `${role}-${content.length}`, role, content, stage };
}

function Harness({
  messages = [],
  stage = "stage_0_pitch",
  streaming = null,
  error = null,
  blockedReason = null,
  pending = false,
  running = false,
  queue = [],
  onSend = vi.fn(),
  onSendQueue = vi.fn(),
  onRemoveQueued = vi.fn(),
  onStart = null,
}: {
  messages?: ChatMessage[];
  stage?: Stage;
  streaming?: StreamingTurn | null;
  error?: TurnFailure | null;
  blockedReason?: string | null;
  pending?: boolean;
  running?: boolean;
  queue?: QueuedMessage[];
  onSend?: (message: string) => void;
  onSendQueue?: () => void;
  onRemoveQueued?: (id: string) => void;
  onStart?: (() => void) | null;
}) {
  const [draft, setDraft] = useState("");
  return (
    <ChatPanel
      messages={messages}
      stage={stage}
      streaming={streaming}
      error={error}
      blockedReason={blockedReason}
      pending={pending}
      running={running}
      queue={queue}
      draft={draft}
      onDraftChange={setDraft}
      onSend={onSend}
      onSendQueue={onSendQueue}
      onRemoveQueued={onRemoveQueued}
      onStart={onStart}
    />
  );
}

const queued: QueuedMessage = {
  id: "q1",
  content: "Who pays?\nFamilies",
};

/** Conversation in reading order: stage dividers by name, messages by content. */
function timeline(): (string | null)[] {
  return [...document.querySelectorAll('[role="separator"], [data-role]')].map(
    (node) => node.getAttribute("aria-label") ?? node.textContent,
  );
}

describe("ChatPanel", () => {
  it("marks every stage change in the conversation, also when going back", () => {
    render(
      <Harness
        stage="stage_0_pitch"
        messages={[
          message("assistant", "Welcome"),
          message("user", "My pitch"),
          message("assistant", "Here is the problem.", "stage_1_problem_framing"),
        ]}
      />,
    );
    expect(timeline()).toEqual([
      "Welcome",
      "My pitch",
      "New stage 1. Problem framing",
      "Here is the problem.",
      "Back to 0. Pitch",
    ]);
  });

  it("marks the new stage before the opening it streams, and after a reply that ends a stage", () => {
    const messages = [message("user", "My pitch")];
    const streaming = { turnId: "t", text: "Reply", status: null };
    const view = render(
      <Harness
        stage="stage_1_problem_framing"
        messages={messages}
        streaming={{ ...streaming, opening: true }}
      />,
    );
    expect(timeline()).toEqual(["My pitch", "New stage 1. Problem framing", "Reply"]);
    view.rerender(
      <Harness stage="stage_1_problem_framing" messages={messages} streaming={streaming} />,
    );
    expect(timeline()).toEqual(["My pitch", "Reply", "New stage 1. Problem framing"]);
  });

  it("offers to start the stage only while nothing runs", async () => {
    const onStart = vi.fn();
    const view = render(<Harness onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: "Start this stage" }));
    expect(onStart).toHaveBeenCalledOnce();
    view.rerender(<Harness onStart={onStart} running />);
    expect(screen.queryByRole("button", { name: "Start this stage" })).toBeNull();
    view.rerender(<Harness />);
    expect(screen.queryByRole("button", { name: "Start this stage" })).toBeNull();
  });

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
      <Harness onSend={vi.fn()} streaming={{ turnId: "t", status: "document", text: "Partial" }} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Updating the stage document…");
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("accepts a message while a turn runs and shows the queue", async () => {
    const onSend = vi.fn();
    const onRemoveQueued = vi.fn();
    render(
      <Harness
        running
        streaming={{ turnId: "t", status: "document", text: "" }}
        queue={[queued]}
        onSend={onSend}
        onRemoveQueued={onRemoveQueued}
      />,
    );
    expect(screen.getByRole("region", { name: "Waiting answers" })).toHaveTextContent(
      "Who pays? Families",
    );
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "More");
    await userEvent.click(screen.getByRole("button", { name: "Queue" }));
    expect(onSend).toHaveBeenCalledWith("More");
    await userEvent.click(screen.getByRole("button", { name: "Remove from queue" }));
    expect(onRemoveQueued).toHaveBeenCalledWith("q1");
  });

  it("lets the user send a kept queue, unless input is paused", async () => {
    const onSendQueue = vi.fn();
    const { rerender } = render(<Harness queue={[queued]} onSendQueue={onSendQueue} />);
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(onSendQueue).toHaveBeenCalledOnce();
    // While another turn runs, a kept message is told apart from those about to leave.
    rerender(<Harness running queue={[{ ...queued, held: true }]} />);
    expect(screen.getByText("Kept")).toBeInTheDocument();
    rerender(<Harness queue={[queued]} blockedReason="Review first." onSendQueue={onSendQueue} />);
    expect(screen.getByRole("button", { name: "Send now" })).toBeDisabled();
  });

  it("blocks input while a review is pending and shows turn errors", () => {
    render(
      <Harness
        onSend={vi.fn()}
        blockedReason="Pitch is waiting for your review."
        error={{ code: "rate_limited", message: "Slow", status: 429, retryAfterSeconds: 5 }}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Message" });
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription("Pitch is waiting for your review.");
    expect(screen.getByPlaceholderText("Pitch is waiting for your review.")).toBeInTheDocument();
    expect(screen.getByText("Try again in 5 s.")).toBeInTheDocument();
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
    await userEvent.type(input, "1. milk{Enter}eggs{Enter}{Enter}");
    expect(input).toHaveValue("1. milk\n2. eggs\n");
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(input, "Thanks{Enter}");
    expect(onSend).toHaveBeenCalledWith("1. milk\n2. eggs\nThanks");
  });

  it("detects a list as it is typed, with nested items", async () => {
    render(<Harness onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Buy{Shift>}{Enter}{/Shift}* milk{Enter}whole");
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.type(input, "{Enter}{Enter}eggs");
    expect(input).toHaveValue("Buy\n• milk\n  ◦ whole\n• eggs");
    expect(screen.queryByRole("button", { name: /list/i })).toBeNull();
  });

  it("starts a numbered list at the typed number", async () => {
    render(<Harness onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "4. milk{Enter}eggs");
    expect(input).toHaveValue("4. milk\n5. eggs");
  });

  it("leaves pasted text alone and lets Tab move the focus outside a list", async () => {
    render(<Harness onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    await userEvent.click(input);
    await userEvent.paste("* ");
    expect(input).toHaveValue("* ");
    await userEvent.clear(input);
    await userEvent.type(input, "milk");
    await userEvent.tab();
    expect(input).not.toHaveFocus();
  });

  it("stops following a reply once the reader scrolls up", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).scrollTo;
    });
    const view = (text: string) => (
      <Harness onSend={vi.fn()} streaming={{ turnId: "t", status: null, text }} />
    );
    const { container, rerender } = render(view("First"));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    const log = container.querySelector('[aria-live="polite"]')!;
    Object.defineProperties(log, {
      scrollHeight: { value: 2000 },
      clientHeight: { value: 500 },
      scrollTop: { value: 200, writable: true },
    });
    fireEvent.scroll(log);
    rerender(view("First words"));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    (log as HTMLElement).scrollTop = 1490;
    fireEvent.scroll(log);
    rerender(view("First words, more"));
    expect(scrollTo).toHaveBeenCalledTimes(2);

    // Scrolled up again, then a new question (from any panel) follows its reply.
    (log as HTMLElement).scrollTop = 0;
    fireEvent.scroll(log);
    rerender(
      <Harness
        onSend={vi.fn()}
        messages={[message("user", "Next question")]}
        streaming={{ turnId: null, status: "sending", text: "" }}
      />,
    );
    expect(scrollTo).toHaveBeenCalledTimes(3);

    // A failed turn drops the local question: a reader who scrolled up stays where they are.
    (log as HTMLElement).scrollTop = 0;
    fireEvent.scroll(log);
    rerender(<Harness onSend={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledTimes(3);
  });
});
