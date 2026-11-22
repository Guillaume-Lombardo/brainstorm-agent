import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PreferencesProvider } from "@/components/preferences/provider";
import { questionFixture } from "@/test/fixtures";

import { OpenQuestions } from "./open-questions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("OpenQuestions", () => {
  it("highlights the recommended option and answers with the chosen one", async () => {
    const question = questionFixture();
    const onAnswer = vi.fn();
    render(<OpenQuestions questions={[question]} disabled={false} onAnswer={onAnswer} />);
    expect(screen.getByText("Blocking")).toBeInTheDocument();
    expect(screen.getByText("It changes the data model.")).toBeInTheDocument();
    const recommended = screen.getByRole("button", { name: /^Yes.*recommended/ });
    expect(recommended).toHaveAttribute("data-recommended", "true");
    expect(screen.getByRole("button", { name: "No" })).not.toHaveAttribute("data-recommended");

    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith(question, "No");
  });

  it("speaks the language of the interface without exposing internal priority codes", () => {
    render(
      <PreferencesProvider locale="fr" theme="system">
        <OpenQuestions
          questions={[questionFixture({ priority: "scope" })]}
          disabled={false}
          onAnswer={vi.fn()}
        />
      </PreferencesProvider>,
    );
    expect(screen.getByText("Bloquante")).toBeInTheDocument();
    expect(screen.queryByText("scope")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yes.*recommandé/ })).toHaveAttribute(
      "data-recommended",
      "true",
    );
  });

  it("keeps answers available while a turn runs", async () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <OpenQuestions
        questions={[questionFixture()]}
        disabled={false}
        queueing
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText(/your answers will leave together/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledOnce();
    rerender(<OpenQuestions questions={[]} disabled={false} queueing onAnswer={onAnswer} />);
    expect(screen.getByText(/No other question/)).toBeInTheDocument();
  });

  it("disables answers while an action or review is pending", () => {
    render(<OpenQuestions questions={[questionFixture()]} disabled onAnswer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });

  it("wraps a long option inside the panel instead of overflowing it", () => {
    const option = "Immediate booking for members, approval only for outside associations";
    render(
      <OpenQuestions
        questions={[questionFixture({ options: [option], recommended_option: option })]}
        disabled={false}
        onAnswer={vi.fn()}
      />,
    );
    // A one-line button would be clipped by the panel.
    const button = screen.getByRole("button", { name: /^Immediate booking/ });
    expect(button).toHaveClass("max-w-full");
    expect(button).not.toHaveClass("whitespace-nowrap");
  });

  it("shows an empty state", () => {
    render(<OpenQuestions questions={[]} disabled={false} onAnswer={vi.fn()} />);
    expect(screen.getByText("No open question.")).toBeInTheDocument();
  });
});
