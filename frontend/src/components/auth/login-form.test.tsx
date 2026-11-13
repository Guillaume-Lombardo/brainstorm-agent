import { render, screen } from "@testing-library/react";
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
});
