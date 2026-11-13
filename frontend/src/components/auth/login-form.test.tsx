import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const passwordAction = vi.fn(async () => ({ error: null }));

describe("LoginForm", () => {
  it("hides the SSO button when OIDC is not configured", () => {
    render(<LoginForm callbackUrl="/sessions" passwordAction={passwordAction} sso={null} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in with/ })).not.toBeInTheDocument();
  });

  it("shows the SSO button with the provider label when configured", () => {
    render(
      <LoginForm
        callbackUrl="/sessions"
        passwordAction={passwordAction}
        sso={{ label: "Acme SSO", action: vi.fn(async () => undefined) }}
      />,
    );
    expect(screen.getByRole("button", { name: "Sign in with Acme SSO" })).toBeInTheDocument();
  });

  it("shows the error of an Auth.js redirect", () => {
    render(
      <LoginForm
        callbackUrl="/sessions"
        initialError="Sign-in refused."
        passwordAction={passwordAction}
        sso={null}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in refused.");
  });

  it("shows the error returned by the password action", async () => {
    const limited = vi.fn(async () => ({ error: "Too many sign-in attempts." }));
    render(<LoginForm callbackUrl="/sessions" passwordAction={limited} sso={null} />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in attempts.");
    expect(limited).toHaveBeenCalledOnce();
  });
});
