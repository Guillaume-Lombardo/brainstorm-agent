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
    expect(screen.getByText("Bloquante")).toBeInTheDocument();
    expect(
      screen.getByText("Pourquoi cette question : It changes the data model."),
    ).toBeInTheDocument();
    const recommended = screen.getByRole("button", { name: /^Yes.*recommandé/ });
    expect(recommended).toHaveAttribute("data-recommended", "true");
    expect(screen.getByRole("button", { name: "No" })).not.toHaveAttribute("data-recommended");

    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith(question, "No");
  });

  it("uses French labels without exposing internal priority codes", () => {
    render(
      <OpenQuestions
        questions={[questionFixture({ priority: "scope" })]}
        disabled={false}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.getByText("Bloquante")).toBeInTheDocument();
    expect(screen.queryByText("scope")).not.toBeInTheDocument();
    expect(
      screen.getByText("Pourquoi cette question : It changes the data model."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yes.*recommandé/ })).toHaveAttribute(
      "data-recommended",
      "true",
    );
  });

  it("disables answers while a turn or review is pending", () => {
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
    // Buttons default to one fixed-height line: the panel would clip a long option.
    expect(screen.getByRole("button", { name: /^Immediate booking/ })).toHaveClass(
      "h-auto",
      "max-w-full",
      "whitespace-normal",
    );
  });

  it("shows an empty state", () => {
    render(<OpenQuestions questions={[]} disabled={false} onAnswer={vi.fn()} />);
    expect(screen.getByText("Aucune question ouverte pour le moment.")).toBeInTheDocument();
  });
});
