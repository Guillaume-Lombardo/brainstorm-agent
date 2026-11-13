import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD } from "../scripts/e2e-env.mjs";

/**
 * Journeys against the real backend in `fake` LLM mode (see `playwright.config.ts`).
 * The fake model reads `key: value` lines, so a complete pitch is deterministic.
 */

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR ?? "test-results/screenshots";
const PITCH = [
  "pitch: A weekly meal planner that builds the shopping list",
  "clear: weekly plan, shopping list",
  "ambiguous: budget handling",
  "missing: pricing model",
].join("\n");

async function signIn(page: Page, email: string) {
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fsessions$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
}

async function createSession(page: Page, title: string): Promise<string> {
  await page
    .getByRole("button", { name: /New session|Start your first session/ })
    .first()
    .click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  expect(id).toBeTruthy();
  return id!;
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message").fill(message);
  await page.getByRole("button", { name: "Send" }).click();
}

/** The sign-in form error (Next.js also renders an empty route announcer `alert`). */
function formAlert(page: Page) {
  return page.locator("form").getByRole("alert");
}

function sseFrames(...events: object[]): string {
  return events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
}

test("rejects a wrong password and hides SSO when OIDC is not configured", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Sign in with/ })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENSHOTS}/01-login.png` });
  await page.getByLabel("Email").fill("wrong@example.com");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(formAlert(page)).toHaveText("Invalid email or password.");
  await expect(page).toHaveURL(/\/login/);
});

test("the backend login limit is shown as too many attempts", async ({ page }) => {
  await page.goto("/login");
  const alert = formAlert(page);
  // The backend allows five attempts per e-mail and minute, then answers 429.
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await page.getByLabel("Email").fill("limited@example.com");
    await page.getByLabel("Password").fill(`guess-${attempt}`);
    // Wait for each server action: the alert text alone does not change between failures.
    const answered = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/login",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await answered;
    await expect(alert).toHaveText(
      attempt <= 5 ? "Invalid email or password." : /Too many sign-in attempts/,
    );
  }
});

test("login, new session, streamed turn, updated document, review and approval", async ({
  page,
}) => {
  await signIn(page, "journey@example.com");
  await page.screenshot({ path: `${SCREENSHOTS}/02-sessions.png` });
  const title = `Meal planner ${Date.now()}`;
  const sessionId = await createSession(page, title);
  await expect(page.getByRole("navigation", { name: "Stages" }).getByRole("button")).toHaveCount(8);

  // One streamed turn: the proxy relays the backend SSE events unchanged.
  const turn = page.waitForResponse(
    (response) => response.url().endsWith(`/sessions/${sessionId}/turns`) && response.ok(),
  );
  await send(page, PITCH);
  const stream = await (await turn).text();
  for (const event of ["turn.started", "message.delta", "document.updated", "turn.completed"]) {
    expect(stream).toContain(`event: ${event}`);
  }
  expect((await turn).headers()["content-type"]).toContain("text/event-stream");

  // The stage document and the coverage come from the backend state.
  await expect(page.getByTestId("stage-document")).toContainText(
    "A weekly meal planner that builds the shopping list",
  );
  const details = page.getByTestId("stage-details");
  await expect(details.locator('[data-field="pitch_summary"]')).toContainText("clear");
  await expect(details).toContainText(/Readiness \d+\/\d+/);

  // A complete pitch requires human validation: input pauses until the review.
  await expect(page.getByText("Pitch is ready for your review.")).toBeVisible();
  await expect(page.getByText("Input paused")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeDisabled();
  await expect(page.getByTestId("stage-document")).toContainText("weekly meal planner");
  await page.screenshot({ path: `${SCREENSHOTS}/03-review-required.png` });

  // The backend itself refuses a turn while the review is pending (409).
  const refused = await page.request.post(`/api/backend/sessions/${sessionId}/turns`, {
    data: { message: "one more thing" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({ error: { code: "review_pending" } });

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Current: Problem framing")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled();
  // The approved stage stays readable, validated and reopenable.
  await page.getByRole("button", { name: /0\. Pitch/ }).click();
  await expect(page.getByTestId("stage-details")).toContainText("Validated");
  await expect(page.getByTestId("stage-document")).toContainText("weekly meal planner");
  await expect(page.getByRole("button", { name: "Reopen Pitch" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/04-approved.png` });

  // Exports are served by the backend through the proxy.
  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Framing document (Markdown)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^brainstorm-[0-9a-f]{8}-framing\.md$/);

  // The sessions list reflects the new stage.
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("model failure, rate limit and expired session are explained", async ({ page, context }) => {
  await signIn(page, "errors@example.com");
  const sessionId = await createSession(page, `Errors ${Date.now()}`);
  const turns = `**/api/backend/sessions/${sessionId}/turns`;

  // LLM failure during the stream: error shown, message restored in the composer.
  await page.route(turns, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseFrames(
        { type: "turn.started", turn_id: "t1", stage: "stage_0_pitch" },
        { type: "error", code: "turn_failed", message: "The language model failed." },
      ),
    }),
  );
  await send(page, "pitch: anything");
  await expect(page.getByText("The assistant failed")).toBeVisible();
  await expect(page.getByLabel("Message")).toHaveValue("pitch: anything");
  await page.screenshot({ path: `${SCREENSHOTS}/05-llm-error.png` });

  // Rate limit with a retry hint.
  await page.unroute(turns);
  await page.route(turns, (route) =>
    route.fulfill({
      status: 429,
      headers: { "retry-after": "30" },
      json: { error: { code: "rate_limited", message: "Slow down.", retryAfterSeconds: 30 } },
    }),
  );
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Too many requests")).toBeVisible();
  await expect(page.getByText("Try again in 30 seconds.")).toBeVisible();
  await page.unroute(turns);

  // Expired session: the real proxy answers 401 and the UI offers to sign in again.
  await context.clearCookies();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Session expired")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
