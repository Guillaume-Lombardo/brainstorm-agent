import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreferenceControls } from "./preference-controls";
import { PreferencesProvider } from "./provider";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function forget() {
  for (const name of ["theme", "lang"]) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
  delete document.documentElement.dataset.theme;
}

describe("PreferenceControls", () => {
  beforeEach(() => {
    forget();
    refresh.mockClear();
  });
  afterEach(forget);

  it("applies and stores the chosen theme, and forgets it when following the system", async () => {
    render(
      <PreferencesProvider locale="en" theme="system">
        <PreferenceControls />
      </PreferencesProvider>,
    );
    expect(screen.getByRole("radio", { name: "System theme" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(screen.getByRole("radio", { name: "Dark theme" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("theme=dark");

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "System theme" })).toHaveFocus();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).not.toContain("theme=");
  });

  it("stores the other language and renders the page again", async () => {
    render(
      <PreferencesProvider locale="fr" theme="system">
        <PreferenceControls />
      </PreferencesProvider>,
    );
    expect(screen.getByRole("radiogroup", { name: "Thème" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to English" }));
    expect(document.cookie).toContain("lang=en");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
