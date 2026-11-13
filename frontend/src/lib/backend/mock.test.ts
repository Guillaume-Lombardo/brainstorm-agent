// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseTurnEvents } from "@/lib/api/sse";

import { BackendError } from "./errors";
import { MockBackend } from "./mock";
import type { TurnEvent } from "./types";

const PASSWORD = "test-password"; // pragma: allowlist secret
const alice = { userId: "alice" };
const bob = { userId: "bob" };

function backend() {
  return new MockBackend({
    streamDelayMs: 0,
    now: () => new Date("2026-11-13T10:00:00Z"),
    users: [
      {
        id: "alice",
        email: "alice@example.com",
        displayName: "Alice",
        password: PASSWORD,
        seed: false,
      },
      { id: "bob", email: "bob@example.com", displayName: "Bob", password: PASSWORD, seed: true },
    ],
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of parseTurnEvents(stream)) {
    events.push(event);
  }
  return events;
}

describe("MockBackend", () => {
  let mock: MockBackend;

  beforeEach(() => {
    mock = backend();
  });

  it("verifies credentials case-insensitively on the email", async () => {
    await expect(mock.verifyCredentials("ALICE@example.com", PASSWORD)).resolves.toMatchObject({
      id: "alice",
    });
    await expect(mock.verifyCredentials("alice@example.com", "nope")).resolves.toBeNull();
  });

  it("links an OIDC identity to the same user on every login", async () => {
    const identity = { issuer: "https://idp", subject: "42", email: "c@example.com", name: "C" };
    const first = await mock.resolveOidcUser(identity);
    await expect(mock.resolveOidcUser(identity)).resolves.toEqual(first);
  });

  it("creates, renames and archives a session", async () => {
    const created = await mock.createSession(alice, { title: "  Planner " });
    expect(created).toMatchObject({
      title: "Planner",
      currentStage: "stage_0_pitch",
      archived: false,
    });
    await mock.updateSession(alice, created.id, { title: "Renamed", archived: true });
    await expect(mock.listSessions(alice, { includeArchived: false })).resolves.toEqual([]);
    await expect(mock.listSessions(alice, { includeArchived: true })).resolves.toMatchObject([
      { title: "Renamed", archived: true },
    ]);
  });

  it("isolates sessions between owners", async () => {
    const created = await mock.createSession(alice, { title: "Private" });
    await expect(mock.getSession(bob, created.id)).rejects.toMatchObject({ status: 404 });
    const bobSessions = await mock.listSessions(bob, { includeArchived: true });
    expect(bobSessions.map((session) => session.title)).not.toContain("Private");
  });

  it("streams typed events and requires a review once the stage is ready", async () => {
    const { id } = await mock.createSession(alice, { title: "Planner" });
    const first = await collect(await mock.streamTurn(alice, id, { message: "Meal planner" }));
    expect(first.map((event) => event.type)).toEqual([
      "turn.started",
      "analysis.status",
      "analysis.status",
      ...first.filter((event) => event.type === "message.delta").map(() => "message.delta"),
      "document.updated",
      "coverage.updated",
      "questions.updated",
      "turn.completed",
    ]);
    await collect(await mock.streamTurn(alice, id, { message: "Parents" }));
    const third = await collect(await mock.streamTurn(alice, id, { message: "Save time" }));
    expect(third.some((event) => event.type === "review.required")).toBe(true);

    await expect(mock.streamTurn(alice, id, { message: "More" })).rejects.toMatchObject({
      code: "review_pending",
      status: 409,
    });

    const approved = await mock.submitReview(alice, id, {
      stage: "stage_0_pitch",
      action: "approve",
    });
    expect(approved.currentStage).toBe("stage_1_problem_framing");
    expect(approved.stages[0].status).toBe("validated");
    expect(approved.stages[1].status).toBe("active");
    expect(await mock.listDocumentVersions(alice, id, "stage_0_pitch")).toHaveLength(4);
  });

  it("keeps the stage active and records the note when changes are requested", async () => {
    const [session] = await mock.listSessions(bob, { includeArchived: false });
    const fieldService = (await mock.listSessions(bob, { includeArchived: false })).find(
      (candidate) => candidate.title === "Field service scheduling",
    )!;
    expect(session).toBeDefined();
    const detail = await mock.submitReview(bob, fieldService.id, {
      stage: "stage_7_delivery_slicing",
      action: "request_changes",
      note: "Split S3",
    });
    expect(detail.pendingReview).toBeNull();
    expect(detail.stages[7].status).toBe("active");
    expect(detail.comments.at(-1)).toMatchObject({ section: "Review", body: "Split S3" });
  });

  it("reopens a validated stage and marks downstream stages stale", async () => {
    const fieldService = (await mock.listSessions(bob, { includeArchived: false })).find(
      (candidate) => candidate.title === "Field service scheduling",
    )!;
    const detail = await mock.reopenStage(bob, fieldService.id, "stage_2_user_story_mapping");
    expect(detail.currentStage).toBe("stage_2_user_story_mapping");
    expect(detail.pendingReview).toBeNull();
    expect(detail.stages.map((stage) => stage.status)).toEqual([
      "validated",
      "validated",
      "active",
      "stale",
      "stale",
      "stale",
      "stale",
      "stale",
    ]);
  });

  it("only edits fields of an active or stale stage", async () => {
    const { id } = await mock.createSession(alice, { title: "Planner" });
    const detail = await mock.updateField(alice, id, "stage_0_pitch", "product_idea", "Planner");
    expect(detail.stages[0].fields[0]).toMatchObject({ coverage: "clear", value: "Planner" });
    await expect(
      mock.updateField(alice, id, "stage_1_problem_framing", "problem_statement", "x"),
    ).rejects.toBeInstanceOf(BackendError);
  });

  it("simulates backend failures on demand", async () => {
    const { id } = await mock.createSession(alice, { title: "Planner" });
    const events = await collect(
      await mock.streamTurn(alice, id, { message: "/simulate llm_error" }),
    );
    expect(events.at(-1)).toMatchObject({ type: "error", code: "llm_error" });
    expect((await mock.getSession(alice, id)).messages).toHaveLength(1);
    await expect(
      mock.streamTurn(alice, id, { message: "/simulate rate_limited" }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });
  });

  it("exports the framing document and the backlog with waves", async () => {
    const fieldService = (await mock.listSessions(bob, { includeArchived: false })).find(
      (candidate) => candidate.title === "Field service scheduling",
    )!;
    const markdown = await mock.exportSession(bob, fieldService.id, "markdown");
    expect(markdown.filename).toBe("field-service-scheduling.md");
    expect(markdown.body).toContain("# Delivery slicing");
    const backlog = await mock.exportSession(bob, fieldService.id, "backlog_json");
    expect(JSON.parse(backlog.body).waves).toHaveLength(3);
  });
});
