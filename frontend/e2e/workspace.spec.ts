import { expect, test, type Page } from "@playwright/test";

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR ?? "test-results/screenshots";
const DEMO_PASSWORD = "brainstorm-demo"; // pragma: allowlist secret

async function signIn(page: Page, email: string) {
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fsessions$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
}

test("rejects a wrong password and hides SSO when OIDC is not configured", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Sign in with/ })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENSHOTS}/login.png` });
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("a new user creates a session and converses with streamed turns", async ({ page }) => {
  await signIn(page, "empty@example.com");
  await expect(page.getByText("No session yet")).toBeVisible();

  await page.getByRole("button", { name: "Start your first session" }).click();
  await page.getByLabel("Title").fill("Recipe planner");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Recipe planner" })).toBeVisible();

  const composer = page.getByLabel("Message");
  await composer.fill("A weekly meal planner that builds the shopping list.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks, I recorded Product idea.")).toBeVisible();
  await expect(page.getByTestId("stage-document")).toContainText("Product idea");

  // Simulated LLM failure: error shown, message restored in the composer.
  await composer.fill("/simulate llm_error");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("The assistant failed")).toBeVisible();
  await expect(composer).toHaveValue("/simulate llm_error");

  await composer.fill("Busy parents of young children.");
  await page.getByRole("button", { name: "Send" }).click();
  await composer.fill("Save two hours of planning per week.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Pitch is ready for your review.")).toBeVisible();
  await expect(page.getByText("Input paused")).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Current: Problem framing")).toBeVisible();

  // Rename and archive from the sessions list.
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Rename Recipe planner" }).click();
  await page.getByLabel("Title").fill("Meal planner");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Meal planner" })).toBeVisible();
  await page.getByRole("button", { name: "Archive Meal planner" }).click();
  await expect(page.getByText("No session yet")).toBeVisible();
  await page.getByRole("button", { name: "Show archived" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
});

test("the demo workspace shows review, questions, versions and delivery slicing", async ({
  page,
}) => {
  await signIn(page, "demo@example.com");
  await page.screenshot({ path: `${SCREENSHOTS}/sessions.png` });

  await page.getByRole("link", { name: "Team retrospective tool" }).click();
  await expect(page.getByTestId("stage-details")).toContainText("User story mapping");
  await page.getByRole("tab", { name: /Questions/ }).click();
  const recommended = page.locator("[data-recommended]").first();
  await expect(recommended).toHaveText(/Collect feedback and vote/);
  await page.getByRole("tab", { name: "Document" }).click();
  await page.getByRole("button", { name: "Diff with v1" }).click();
  await expect(page.getByTestId("diff-view")).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/workspace.png` });

  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("link", { name: "Field service scheduling" }).click();
  await expect(page.getByText("Delivery slicing is ready for your review.")).toBeVisible();
  await page.getByRole("tab", { name: "Delivery" }).click();
  await expect(page.getByRole("tab", { name: "Delivery" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("img", { name: "Slice dependency graph" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Contract matrix" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/delivery.png` });

  // A message while a review is pending is blocked (409 path is disabled in the UI).
  await expect(page.getByLabel("Message")).toBeDisabled();

  // Reopen an earlier stage: downstream stages become stale.
  await page.getByRole("button", { name: /1\. Problem framing/ }).click();
  await page.getByRole("button", { name: "Reopen Problem framing" }).click();
  await expect(page.getByText("Current: Problem framing")).toBeVisible();
  await expect(page.getByText("stale").first()).toBeVisible();
});
