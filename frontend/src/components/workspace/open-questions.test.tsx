import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OpenQuestion } from "@/lib/backend/types";

import { OpenQuestions } from "./open-questions";

const question: OpenQuestion = {
  id: "q1",
  stage: "stage_2_user_story_mapping",
  question: "Must feedback be anonymous?",
  whyItMatters: "It changes the data model.",
  options: [
    { id: "yes", label: "Yes", recommended: true },
    { id: "no", label: "No", recommended: false },
  ],
};

describe("OpenQuestions", () => {
  it("highlights the recommended option and answers with the chosen one", async () => {
    const onAnswer = vi.fn();
    render(<OpenQuestions questions={[question]} disabled={false} onAnswer={onAnswer} />);
    const recommended = screen.getByRole("button", { name: /^Yes.*recommended/ });
    expect(recommended).toHaveAttribute("data-recommended", "true");
    expect(screen.getByRole("button", { name: "No" })).not.toHaveAttribute("data-recommended");

    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith(question, question.options[1]);
  });

  it("shows an empty state", () => {
    render(<OpenQuestions questions={[]} disabled={false} onAnswer={vi.fn()} />);
    expect(screen.getByText("No open question for now.")).toBeInTheDocument();
  });
});
