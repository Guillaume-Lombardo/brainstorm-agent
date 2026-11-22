import { readFile } from "node:fs/promises";

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
  // The panel is about the selected stage: the document does not name it again.
  await expect(
    page.getByTestId("stage-document").getByRole("heading", { name: /Stage 0/ }),
  ).toHaveCount(0);
  const details = page.getByTestId("stage-details");
  await expect(details.locator('[data-field="pitch_summary"]')).toContainText("clear");

  // A complete pitch requires human validation: input pauses until the review.
  await expect(page.getByText("Pitch: to review")).toBeVisible();
  await expect(page.getByPlaceholder("Review the stage to continue.")).toBeVisible();
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

  const opening = page.waitForResponse((response) =>
    response.url().endsWith("/stages/stage_1_problem_framing/opening"),
  );
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("button", { name: /1\. Problem framing/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.getByLabel("Message")).toBeEnabled();
  // The assistant starts the new stage by itself, below a marker in the conversation.
  expect((await opening).ok()).toBe(true);
  await expect(page.getByTestId("streaming-turn")).toHaveCount(0);
  const marker = page.getByRole("separator", { name: "New stage 1. Problem framing" });
  await expect(marker).toBeVisible();
  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation.locator('[data-role="user"]')).toHaveCount(1);
  await expect(conversation.locator('[role="separator"] ~ [data-role="assistant"]')).toHaveCount(1);
  await page.screenshot({ path: `${SCREENSHOTS}/04-stage-opened.png` });
  // The approved stage stays readable, validated and reopenable.
  await page.getByRole("button", { name: /0\. Pitch/ }).click();
  await expect(page.getByRole("button", { name: /0\. Pitch Validated/ })).toBeVisible();
  await expect(page.getByTestId("stage-document")).toContainText("weekly meal planner");
  await expect(page.getByRole("button", { name: "Reopen Pitch" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/04-approved.png` });

  // Exports are served by the backend through the proxy.
  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Framing document (Markdown)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^brainstorm-[0-9a-f]{8}-framing\.md$/);

  await page.getByRole("button", { name: "Export" }).click();
  const archiveDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "All documents (ZIP)" }).click();
  const archive = await archiveDownload;
  expect(archive.suggestedFilename()).toMatch(/^brainstorm-[0-9a-f]{8}-documents\.zip$/);
  // ZIP entry names are stored uncompressed.
  const bytes = (await readFile(await archive.path())).toString("latin1");
  expect(bytes.startsWith("PK")).toBe(true);
  expect(bytes).toContain("framing.md");
  expect(bytes).toContain("stages/stage_0_pitch.md");

  // The sessions list reflects the new stage.
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("a stage whose opening failed can be started by hand, once", async ({ page }) => {
  await signIn(page, "opening@example.com");
  const sessionId = await createSession(page, `Opening ${Date.now()}`);
  await send(page, PITCH);
  await expect(page.getByPlaceholder("Review the stage to continue.")).toBeVisible();
  const openings = `**/api/backend/sessions/${sessionId}/stages/*/opening`;
  await page.route(openings, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseFrames(
        { type: "turn.started", turn_id: "t1", stage: "stage_1_problem_framing" },
        { type: "error", code: "turn_failed", message: "The language model failed." },
      ),
    }),
  );
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("The assistant failed")).toBeVisible();
  await page.unroute(openings);

  // Nothing restarts by itself on a reload; the marker and the button stay.
  await page.reload();
  await expect(page.getByRole("separator", { name: "New stage 1. Problem framing" })).toBeVisible();
  await page.getByRole("button", { name: "Start this stage" }).click();
  await expect(page.getByRole("button", { name: "Start this stage" })).toHaveCount(0);
  await expect(page.locator('[role="separator"] ~ [data-role="assistant"]')).toHaveCount(1);
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
  await expect(page.getByText("Try again in 30 s.")).toBeVisible();
  await page.unroute(turns);

  // Expired session: the real proxy answers 401 and the UI offers to sign in again.
  await context.clearCookies();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Session expired")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("a long conversation scrolls inside its panel, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await signIn(page, "layout@example.com");
  await createSession(page, `Layout ${Date.now()}`);
  const turn = page.waitForResponse((response) => response.url().endsWith("/turns"));
  await send(page, Array.from({ length: 60 }, (_, line) => `Idea line ${line + 1}`).join("\n"));
  await (await turn).text();
  await expect(page.getByTestId("streaming-turn")).toHaveCount(0);

  // The header, stepper and document stay on screen; only the message list scrolls.
  const overflow = await page.evaluate(
    () => document.scrollingElement!.scrollHeight - window.innerHeight,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Stages" })).toBeInViewport();
  await expect(page.getByRole("tab", { name: "Document" })).toBeInViewport();
  await expect(page.getByLabel("Message")).toBeInViewport();
});

test("the stages column collapses to a rail and stays collapsed after a reload", async ({
  page,
}) => {
  await signIn(page, "sidebar@example.com");
  await createSession(page, `Sidebar ${Date.now()}`);
  const stages = page.getByRole("navigation", { name: "Stages" });
  const stagesPanel = page.locator("#stages-panel");
  const conversation = page.getByRole("region", { name: "Conversation" });
  const railWidth = async () =>
    (await page.locator('aside[data-side="left"]').boundingBox())!.width;
  const chatWidth = async () => (await conversation.boundingBox())!.width;
  expect(await railWidth()).toBe(260);
  const openChat = await chatWidth();

  await page.getByRole("button", { name: "Collapse stages panel" }).click();
  await expect(stagesPanel).toHaveAttribute("inert");
  await expect.poll(railWidth).toBe(48);
  expect(await chatWidth()).toBe(openChat + 212);
  await page.screenshot({ path: `${SCREENSHOTS}/07-stages-collapsed.png` });

  await page.reload();
  await expect(page.getByRole("button", { name: "Expand stages panel" })).toBeVisible();
  await expect(stagesPanel).toHaveAttribute("inert");

  await page.getByRole("button", { name: "Expand stages panel" }).click();
  await expect(stagesPanel).not.toHaveAttribute("inert");
  await expect(stages).toBeVisible();
  await expect.poll(railWidth).toBe(260);

  // With reduced motion the column snaps to its new width instead of animating.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Collapse stages panel" }).click();
  expect(await railWidth()).toBe(48);
  expect(await stagesPanel.evaluate((panel) => getComputedStyle(panel).opacity)).toBe("0");
});

test("the document column collapses to a rail, alone or with the stages column", async ({
  page,
}) => {
  await signIn(page, "document@example.com");
  await createSession(page, `Document ${Date.now()}`);
  const panel = page.locator("#document-panel");
  const conversation = page.getByRole("region", { name: "Conversation" });
  const railWidth = async () =>
    (await page.locator('aside[data-side="right"]').boundingBox())!.width;
  const chatWidth = async () => (await conversation.boundingBox())!.width;
  expect(await railWidth()).toBe(440);
  const openChat = await chatWidth();

  await page.getByRole("button", { name: "Collapse document panel" }).click();
  await expect(panel).toHaveAttribute("inert");
  await expect.poll(railWidth).toBe(48);
  expect(await chatWidth()).toBe(openChat + 392);

  // Both columns collapsed leave the whole width to the conversation.
  await page.getByRole("button", { name: "Collapse stages panel" }).click();
  await expect.poll(chatWidth).toBe(openChat + 392 + 212);
  await page.screenshot({ path: `${SCREENSHOTS}/08-both-collapsed.png` });

  await page.reload();
  await expect(page.getByRole("button", { name: "Expand document panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand stages panel" })).toBeVisible();
  await expect(panel).toHaveAttribute("inert");

  await page.getByRole("button", { name: "Expand document panel" }).click();
  await expect(page.getByRole("tab", { name: "Document" })).toBeVisible();
  await expect.poll(railWidth).toBe(440);

  // Keyboard: Tab right after collapsing never lands in the fading panel, and Tab right after
  // expanding reaches its tabs (past the resize handle).
  const documentTab = page.getByRole("tab", { name: "Document" });
  await page.getByRole("button", { name: "Collapse document panel" }).focus();
  const focusInPanel = () =>
    page.evaluate(() => document.activeElement?.closest("#document-panel") !== null);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  expect(await focusInPanel()).toBe(false);
  await expect.poll(railWidth).toBe(48);
  expect(await focusInPanel()).toBe(false);
  await page.getByRole("button", { name: "Expand document panel" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("separator", { name: "Resize document panel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(documentTab).toBeFocused();
});

test("the side columns resize by dragging their inner edge, within bounds", async ({ page }) => {
  await signIn(page, "resize@example.com");
  await createSession(page, `Resize ${Date.now()}`);
  const width = async (side: string) =>
    (await page.locator(`aside[data-side="${side}"]`).boundingBox())!.width;
  const chatWidth = async () =>
    (await page.getByRole("region", { name: "Conversation" }).boundingBox())!.width;
  async function drag(name: string, dx: number) {
    const box = (await page.getByRole("separator", { name }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  /** Measures after a full frame: layout and resize observers have run, as on screen. */
  const resizeWindow = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  };
  /** Narrowest conversation width over every frame while `action` runs and animations end. */
  async function narrowestChatDuring(action: () => Promise<void>) {
    await page.evaluate(() => {
      const chat = document.querySelector('[aria-label="Conversation"]')!;
      const state = { min: Infinity, running: true };
      (window as unknown as { chatFrames: typeof state }).chatFrames = state;
      const tick = () => {
        state.min = Math.min(state.min, chat.getBoundingClientRect().width);
        if (state.running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await action();
    await page.waitForTimeout(600);
    return page.evaluate(() => {
      const state = (window as unknown as { chatFrames: { min: number; running: boolean } })
        .chatFrames;
      state.running = false;
      return state.min;
    });
  }
  const openChat = await chatWidth();

  await drag("Resize stages panel", 100);
  expect(await width("left")).toBe(360);
  await drag("Resize document panel", -100);
  expect(await width("right")).toBe(540);
  expect(await chatWidth()).toBe(openChat - 200);

  // Widening pushes the other column down to its minimum, never the conversation below 360px.
  await drag("Resize document panel", -1000);
  expect(await width("right")).toBe(800);
  expect(await width("left")).toBe(280);
  expect(await chatWidth()).toBe(360);
  await page.screenshot({ path: `${SCREENSHOTS}/09-resized.png` });

  await page.reload();
  await expect(page.getByRole("separator", { name: "Resize stages panel" })).toBeVisible();
  expect(await width("left")).toBe(280);
  expect(await width("right")).toBe(800);

  // A second command while the first one still animates never squeezes the conversation.
  const stagesEdge = page.getByRole("separator", { name: "Resize stages panel" });
  const documentEdge = page.getByRole("separator", { name: "Resize document panel" });
  await stagesEdge.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => width("left")).toBe(200);
  const narrowest = await narrowestChatDuring(async () => {
    await stagesEdge.focus();
    await page.keyboard.press("End");
    await documentEdge.focus();
    await page.keyboard.press("End");
  });
  expect(narrowest).toBeGreaterThanOrEqual(360);
  expect(await width("left")).toBe(280);
  expect(await width("right")).toBe(800);

  // Double click restores the default width; arrow keys step it.
  await page.getByRole("separator", { name: "Resize stages panel" }).dblclick();
  await expect.poll(() => width("left")).toBe(260);
  await page.getByRole("separator", { name: "Resize document panel" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width("right")).toBe(784);

  // A narrower window shrinks both columns in the same frame, without animation, so the
  // conversation keeps 360px; a wider one brings back the chosen widths.
  await resizeWindow(1024);
  expect(await chatWidth()).toBeGreaterThanOrEqual(360);
  expect(await chatWidth()).toBeLessThan(380);
  await resizeWindow(1440);
  expect(await width("right")).toBe(784);
  expect(await width("left")).toBe(260);

  // The widest stages column, set while the document column is collapsed, still leaves room
  // for the conversation once the document column reopens, during the animation too.
  await page.getByRole("button", { name: "Collapse document panel" }).click();
  await expect.poll(() => width("right")).toBe(48);
  await drag("Resize stages panel", 1000);
  expect(await width("left")).toBe(480);
  const reopening = await narrowestChatDuring(() =>
    page.getByRole("button", { name: "Expand document panel" }).click(),
  );
  expect(reopening).toBeGreaterThanOrEqual(360);
  expect(await width("right")).toBeGreaterThan(600);

  // Widening a column that was shrunk to fit the window widens it.
  await resizeWindow(1024);
  const separator = page.getByRole("separator", { name: "Resize document panel" });
  const fitted = await width("right");
  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => width("right")).toBe(fitted + 16);
  expect(await chatWidth()).toBeGreaterThanOrEqual(360);

  // A drag cut short by a window too narrow for side columns keeps what it showed, and the
  // pointer moves after that change nothing.
  await resizeWindow(1440);
  const before = await width("left");
  const edge = (await page.getByRole("separator", { name: "Resize stages panel" }).boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 200);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 30, edge.y + 200, { steps: 3 });
  await resizeWindow(900);
  await page.mouse.move(edge.x + edge.width / 2 - 200, edge.y + 200, { steps: 3 });
  await page.mouse.up();
  await resizeWindow(1440);
  expect(await width("left")).toBe(before + 30);
});

test("a French pitch gets readable gate questions and a formatted reply", async ({ page }) => {
  await signIn(page, "francais@example.com");
  await createSession(page, `Cadrage ${Date.now()}`);
  const turn = page.waitForResponse((response) => response.url().endsWith("/turns"));
  await send(page, "pitch: Un planificateur de repas pour les familles pressées");
  await (await turn).text();
  await expect(page.getByTestId("streaming-turn")).toHaveCount(0);

  // The reply is rendered Markdown: list items and emphasis, no literal asterisks.
  const reply = page.locator('[data-role="assistant"]').last();
  await expect(reply.locator("li")).toHaveCount(3);
  await expect(reply.locator("em").first()).toHaveText("(recommandé)");
  await expect(reply).not.toContainText("*");
  await page.screenshot({ path: `${SCREENSHOTS}/06-markdown-reply.png` });

  // Questions are phrased in the session language, with options and a recommendation.
  await page.getByRole("tab", { name: /Questions/ }).click();
  // The tab being left stays mounted while it exits: name the panel.
  const panel = page.getByRole("tabpanel", { name: /Questions/ });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel).toContainText("Quels points de l'idée sont déjà clairs et arrêtés ?");
  await expect(panel).not.toContainText("Please clarify");
  await expect(panel).not.toContainText("scope");
  await expect(panel).toContainText("Blocking");
  await expect(panel.locator('[data-recommended="true"]')).toHaveCount(3);
  await page.screenshot({ path: `${SCREENSHOTS}/07-questions-fr.png` });
});

test("questions are answered while a turn runs and leave together in the next one", async ({
  page,
}) => {
  await signIn(page, "francais@example.com");
  const sessionId = await createSession(page, `File d'attente ${Date.now()}`);
  const pitch = page.waitForResponse((response) => response.url().endsWith("/turns"));
  await send(page, "pitch: Un planificateur de repas pour les familles pressées");
  await (await pitch).text();
  await page.getByRole("tab", { name: /Questions/ }).click();
  const panel = page.getByRole("tabpanel", { name: /Questions/ });
  await expect(panel.getByRole("listitem")).toHaveCount(3);

  // Hold the next turn open, as a slow model would.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: string[] = [];
  await page.route(`**/api/backend/sessions/${sessionId}/turns`, async (route) => {
    sent.push((route.request().postDataJSON() as { message: string }).message);
    if (sent.length === 1) {
      await held;
    }
    await route.continue();
  });
  const answer = async () => {
    const question = panel.getByRole("listitem").first();
    const text = await question.locator("p").first().innerText();
    await question.locator('[data-recommended="true"]').click();
    await expect(panel.getByText(text)).toHaveCount(0);
    return text;
  };
  const first = await answer();
  await expect(panel).toContainText("your answers will leave together");
  const second = await answer();
  const third = await answer();
  await expect(panel).toContainText("No other question until the analysis ends.");
  await page.getByLabel("Message").fill("Une précision de plus");
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  const queue = page.getByRole("region", { name: "Waiting answers" });
  await expect(queue.getByRole("listitem")).toHaveCount(3);
  await page.screenshot({ path: `${SCREENSHOTS}/08-queued-answers.png` });

  release();
  await expect(queue).toHaveCount(0);
  await expect(page.getByTestId("streaming-turn")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toContain(first);
  for (const text of [second, third, "Une précision de plus"]) {
    expect(sent[1]).toContain(text);
  }
});

test("a failed turn keeps the queued answers until the user sends them", async ({ page }) => {
  await signIn(page, "errors@example.com");
  const sessionId = await createSession(page, `Kept ${Date.now()}`);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: string[] = [];
  await page.route(`**/api/backend/sessions/${sessionId}/turns`, async (route) => {
    sent.push((route.request().postDataJSON() as { message: string }).message);
    if (sent.length === 1) {
      await held;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseFrames({ type: "error", code: "turn_failed", message: "The model failed." }),
      });
    } else if (sent.length === 2) {
      // Cut without any terminal event: the backend kept nothing.
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseFrames({ type: "turn.started", turn_id: "t2", stage: "stage_0_pitch" }),
      });
    } else {
      await route.continue();
    }
  });
  await send(page, "pitch: Un planificateur de repas pour les familles");
  await page.getByLabel("Message").fill("clear: plan hebdomadaire");
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  release();
  const input = page.getByLabel("Message");
  const queue = page.getByRole("region", { name: "Waiting answers" });
  await expect(input).toHaveValue("pitch: Un planificateur de repas pour les familles");
  await expect(queue).toContainText("clear: plan hebdomadaire");

  // An interrupted stream gives the message back too.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(input).toHaveValue("pitch: Un planificateur de repas pour les familles");

  // A successful resend does not send the kept answer on its own.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("stage-details")).toContainText("planificateur");
  await expect(page.getByRole("button", { name: "Send now" })).toBeEnabled();
  expect(sent).toHaveLength(3);
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(queue).toHaveCount(0);
  await expect.poll(() => sent.at(-1)).toBe("clear: plan hebdomadaire");
});

test("research products and retain two benchmark features", async ({ page }) => {
  await signIn(page, "journey@example.com");
  await createSession(page, "Benchmark project");
  await send(page, PITCH);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Find similar products" })).toBeVisible();
  await send(page, "problem: Teams need shared project framing");
  await expect(page.getByLabel("Message")).toBeEnabled();
  await page.getByRole("button", { name: "Find similar products" }).click();
  const panel = page.getByRole("region", { name: "Benchmark" });
  await expect(panel.getByText("Frameboard", { exact: true })).toBeVisible();
  await panel.getByRole("checkbox").nth(0).check();
  await panel.getByRole("checkbox").nth(1).check();
  await panel.getByRole("button", { name: "Keep selected features" }).click();
  await expect(panel.getByText(/2 features kept/)).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("stage-document")).toContainText("Benchmark");
  await page.screenshot({ path: `${SCREENSHOTS}/10-benchmark.png`, fullPage: true });
  await page.reload();
  const reloaded = page.getByRole("region", { name: "Benchmark" });
  await reloaded.getByRole("button", { name: "Show benchmark" }).click();
  await expect(reloaded.getByRole("checkbox").nth(0)).toBeChecked();
});

test("the theme follows the system until one is chosen, and the choice is kept", async ({
  page,
}) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  const light = await background();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(background).not.toBe(light);
  const dark = await background();

  await page.getByRole("radio", { name: "Light theme" }).click();
  await expect.poll(background).toBe(light);
  await page.reload();
  expect(await background()).toBe(light);
  await expect(page.getByRole("radio", { name: "Light theme" })).toBeChecked();

  await page.getByRole("radio", { name: "System theme" }).click();
  await expect.poll(background).toBe(dark);
  await page.reload();
  expect(await background()).toBe(dark);
});

test("the interface switches language in place and remembers it", async ({ page }) => {
  await signIn(page, "journey@example.com");
  const title = `Langue ${Date.now()}`;
  await createSession(page, title);
  await page.getByLabel("Message").fill("An unsent draft");

  await page.getByRole("button", { name: "Passer en français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("button", { name: /1\. Cadrage du problème/ })).toBeVisible();
  // Nothing on screen was reloaded: the unsent draft is still there.
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("An unsent draft");

  await page.reload();
  await expect(page.getByRole("button", { name: "Exporter" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
});

test("on a phone the questions and the send button stay within reach", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page, "layout@example.com");
  await createSession(page, `Phone ${Date.now()}`);
  const turn = page.waitForResponse((response) => response.url().endsWith("/turns"));
  await send(page, Array.from({ length: 60 }, (_, line) => `Idea line ${line + 1}`).join("\n"));
  await (await turn).text();

  await page.getByLabel("Message").fill("Line\n".repeat(40));
  const button = page.getByRole("button", { name: "Send", exact: true });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport({ ratio: 1 });

  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("link", { name: /Questions/ })
    .click();
  await expect(page.getByRole("tab", { name: /Questions/ })).toBeInViewport();
  await expect(page.getByRole("tab", { name: /Questions/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a French browser gets the French interface by default", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await context.close();
});
