import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { questionFixture } from "@/test/fixtures";

import { OpenQuestions } from "./open-questions";

describe("OpenQuestions", () => {
  it("highlights the recommended option and answers with the chosen one", async () => {
    const question = questionFixture();
    const onAnswer = vi.fn();
    render(<OpenQuestions questions={[question]} disabled={false} onAnswer={onAnswer} />);
    expect(screen.getByText("Blocking")).toBeInTheDocument();
    expect(screen.getByText("Why it matters: It changes the data model.")).toBeInTheDocument();
    const recommended = screen.getByRole("button", { name: /^Yes.*recommended/ });
    expect(recommended).toHaveAttribute("data-recommended", "true");
    expect(screen.getByRole("button", { name: "No" })).not.toHaveAttribute("data-recommended");

    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith(question, "No");
  });

  it("disables answers while a turn or review is pending", () => {
    render(<OpenQuestions questions={[questionFixture()]} disabled onAnswer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });

  it("shows an empty state", () => {
    render(<OpenQuestions questions={[]} disabled={false} onAnswer={vi.fn()} />);
    expect(screen.getByText("No open question for now.")).toBeInTheDocument();
  });
});
