import type { BackendClient, Caller, OidcIdentity } from "./client";
import { BackendError } from "./errors";
import { DEMO_DELIVERY_SLICING, MOCK_STAGE_FIELDS } from "./mock-data";
import { encodeSseEvent } from "./sse";
import {
  STAGES,
  STAGE_LABELS,
  earlierStagesValidated,
  type AuthenticatedUser,
  type ChatMessage,
  type DeliverySlicing,
  type DocumentVersion,
  type ExportFile,
  type ExportFormat,
  type FieldCoverage,
  type OpenQuestion,
  type ReadinessCheck,
  type ReviewAction,
  type SessionDetail,
  type SessionSummary,
  type StageId,
  type StageState,
  type TurnEvent,
} from "./types";

export interface MockUser extends AuthenticatedUser {
  password: string;
  /** Seed demo sessions on first access. */
  seed: boolean;
}

export interface MockBackendOptions {
  users: MockUser[];
  /** Delay between streamed events, in milliseconds. */
  streamDelayMs: number;
  now?: () => Date;
}

interface SessionRecord {
  ownerId: string;
  detail: SessionDetail;
  documents: Record<StageId, DocumentVersion[]>;
  slicing: DeliverySlicing | null;
}

const SIMULATE_PREFIX = "/simulate ";

const clone = <T>(value: T): T => structuredClone(value);

function emptyDocuments(): Record<StageId, DocumentVersion[]> {
  return Object.fromEntries(STAGES.map((stage) => [stage, []])) as unknown as Record<
    StageId,
    DocumentVersion[]
  >;
}

function stageIndex(stage: StageId): number {
  return STAGES.indexOf(stage);
}

function buildFields(stage: StageId): FieldCoverage[] {
  return MOCK_STAGE_FIELDS[stage].map((definition) => ({
    ...definition,
    coverage: "missing",
    value: null,
  }));
}

function computeReadiness(state: StageState, questions: OpenQuestion[]): ReadinessCheck[] {
  return [
    {
      id: "critical-fields",
      label: "All critical fields are clear",
      passed: state.fields
        .filter((field) => field.critical)
        .every((field) => field.coverage === "clear"),
    },
    {
      id: "no-missing-field",
      label: "No field is missing",
      passed: state.fields.every((field) => field.coverage !== "missing"),
    },
    {
      id: "no-open-question",
      label: "No open question left for this stage",
      passed: !questions.some((question) => question.stage === state.stage),
    },
  ];
}

/** Render a stage document with the mandatory sections (facts, assumptions, ...). */
export function renderStageMarkdown(
  state: StageState,
  version: number,
  questions: OpenQuestion[],
): string {
  const facts = state.fields.filter((field) => field.coverage === "clear");
  const assumptions = state.fields.filter((field) => field.coverage === "partial");
  const missing = state.fields.filter((field) => field.coverage === "missing");
  const stageQuestions = questions.filter((question) => question.stage === state.stage);
  const list = (items: string[], empty: string) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `_${empty}_`;

  return [
    `# ${STAGE_LABELS[state.stage]}`,
    "",
    `_Version ${version}_`,
    "",
    "## Facts",
    "",
    list(
      facts.map((field) => `**${field.label}**: ${field.value}`),
      "No confirmed fact yet.",
    ),
    "",
    "## Assumptions",
    "",
    list(
      assumptions.map(
        (field) =>
          `**${field.label}**: ${field.value} _(to confirm${field.reason ? `: ${field.reason}` : ""})_`,
      ),
      "No assumption recorded.",
    ),
    "",
    "## Decisions",
    "",
    list(
      state.status === "validated" ? ["Stage validated by the reviewer."] : [],
      "No decision yet.",
    ),
    "",
    "## Risks",
    "",
    list(
      state.stage === "stage_5_risk_storming" && facts.some((f) => f.field === "risks")
        ? ["See the risk register above."]
        : [],
      "No risk recorded for this stage.",
    ),
    "",
    "## Open questions",
    "",
    list(
      [
        ...missing.map((field) => `${field.label} is still missing.`),
        ...stageQuestions.map((question) => question.question),
      ],
      "No open question.",
    ),
    "",
    "## Readiness",
    "",
    state.readiness.map((check) => `- [${check.passed ? "x" : " "}] ${check.label}`).join("\n"),
    "",
  ].join("\n");
}

function splitIntoDeltas(text: string): string[] {
  const words = text.split(/(\s+)/);
  const deltas: string[] = [];
  for (let index = 0; index < words.length; index += 6) {
    deltas.push(words.slice(index, index + 6).join(""));
  }
  return deltas;
}

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * In-memory backend used for development, component work and end-to-end tests
 * until the real application API (lots 5 and 6) is available.
 *
 * Mock-only commands: a message `/simulate llm_error`, `/simulate rate_limited`
 * or `/simulate forbidden` reproduces the corresponding backend failure.
 */
export class MockBackend implements BackendClient {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly seededUsers = new Set<string>();
  private readonly oidcUsers = new Map<string, AuthenticatedUser>();
  private readonly now: () => Date;

  constructor(private readonly options: MockBackendOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async verifyCredentials(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = this.options.users.find(
      (candidate) =>
        candidate.email.toLowerCase() === email.trim().toLowerCase() &&
        candidate.password === password,
    );
    return user ? { id: user.id, email: user.email, displayName: user.displayName } : null;
  }

  async resolveOidcUser(identity: OidcIdentity): Promise<AuthenticatedUser> {
    const key = `${identity.issuer}|${identity.subject}`;
    const existing = this.oidcUsers.get(key);
    if (existing) {
      return existing;
    }
    const user: AuthenticatedUser = {
      id: `oidc-${crypto.randomUUID()}`,
      email: identity.email ?? `${identity.subject}@oidc.invalid`,
      displayName: identity.name ?? identity.email ?? identity.subject,
    };
    this.oidcUsers.set(key, user);
    return user;
  }

  async listSessions(
    caller: Caller,
    options: { includeArchived: boolean },
  ): Promise<SessionSummary[]> {
    this.ensureSeeded(caller);
    return [...this.sessions.values()]
      .filter((record) => record.ownerId === caller.userId)
      .filter((record) => options.includeArchived || !record.detail.archived)
      .map((record) => this.summary(record.detail))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createSession(caller: Caller, input: { title: string }): Promise<SessionSummary> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new BackendError("validation_error", "A session title is required.");
    }
    const record = this.newRecord(caller.userId, title);
    this.sessions.set(record.detail.id, record);
    return this.summary(record.detail);
  }

  async updateSession(
    caller: Caller,
    sessionId: string,
    patch: { title?: string; archived?: boolean },
  ): Promise<SessionSummary> {
    const record = this.record(caller, sessionId);
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (title.length === 0) {
        throw new BackendError("validation_error", "A session title is required.");
      }
      record.detail.title = title;
    }
    if (patch.archived !== undefined) {
      record.detail.archived = patch.archived;
    }
    this.touch(record);
    return this.summary(record.detail);
  }

  async getSession(caller: Caller, sessionId: string): Promise<SessionDetail> {
    return clone(this.record(caller, sessionId).detail);
  }

  async streamTurn(
    caller: Caller,
    sessionId: string,
    input: { message: string },
  ): Promise<ReadableStream<Uint8Array>> {
    const record = this.writable(caller, sessionId);
    const message = input.message.trim();
    if (message.length === 0) {
      throw new BackendError("validation_error", "The message is empty.");
    }
    if (message === `${SIMULATE_PREFIX}rate_limited`) {
      throw new BackendError("rate_limited", "Too many requests. Try again later.", {
        retryAfterSeconds: 30,
      });
    }
    if (message === `${SIMULATE_PREFIX}forbidden`) {
      throw new BackendError("forbidden", "You do not have access to this session.");
    }
    if (record.detail.pendingReview) {
      throw new BackendError(
        "review_pending",
        `${STAGE_LABELS[record.detail.pendingReview.stage]} is waiting for your review.`,
      );
    }
    const events =
      message === `${SIMULATE_PREFIX}llm_error`
        ? this.failingTurnEvents(record)
        : this.applyTurn(record, message);
    return this.eventStream(events);
  }

  async listDocumentVersions(
    caller: Caller,
    sessionId: string,
    stage: StageId,
  ): Promise<DocumentVersion[]> {
    return clone(this.record(caller, sessionId).documents[stage]);
  }

  async submitReview(
    caller: Caller,
    sessionId: string,
    input: { stage: StageId; action: ReviewAction; note?: string },
  ): Promise<SessionDetail> {
    const record = this.writable(caller, sessionId);
    const { detail } = record;
    if (detail.pendingReview?.stage !== input.stage) {
      throw new BackendError(
        "validation_error",
        `${STAGE_LABELS[input.stage]} is not waiting for a review.`,
      );
    }
    const state = this.stage(detail, input.stage);
    detail.pendingReview = null;
    const label = STAGE_LABELS[input.stage];
    if (input.action === "approve") {
      state.status = "validated";
      this.addVersion(record, input.stage);
      const next = STAGES[stageIndex(input.stage) + 1];
      if (next) {
        this.stage(detail, next).status = "active";
        detail.currentStage = next;
        this.recompute(detail, next);
        this.addAssistantMessage(
          detail,
          `${label} approved. Let's move on to ${STAGE_LABELS[next]}.`,
        );
      } else {
        this.addAssistantMessage(detail, `${label} approved. The framing is complete.`);
      }
    } else {
      state.status = "active";
      if (input.action === "request_changes" && input.note) {
        detail.comments.push({
          id: crypto.randomUUID(),
          stage: input.stage,
          section: "Review",
          body: input.note,
          createdAt: this.timestamp(),
        });
      }
      const verb = input.action === "reject" ? "rejected" : "sent back with change requests";
      this.addAssistantMessage(
        detail,
        `${label} was ${verb}${input.note ? `: ${input.note}` : "."} Let's refine it.`,
      );
    }
    this.touch(record);
    return clone(detail);
  }

  async reopenStage(caller: Caller, sessionId: string, stage: StageId): Promise<SessionDetail> {
    const record = this.writable(caller, sessionId);
    const { detail } = record;
    const state = this.stage(detail, stage);
    if (state.status !== "validated" && state.status !== "stale") {
      throw new BackendError(
        "validation_error",
        `${STAGE_LABELS[stage]} cannot be reopened while it is ${state.status.replace("_", " ")}.`,
      );
    }
    if (!earlierStagesValidated(detail.stages, stage)) {
      throw new BackendError(
        "validation_error",
        `Revalidate the stages before ${STAGE_LABELS[stage]} first.`,
      );
    }
    state.status = "active";
    for (const downstream of detail.stages.slice(stageIndex(stage) + 1)) {
      if (downstream.status !== "locked") {
        downstream.status = "stale";
      }
    }
    detail.pendingReview = null;
    detail.currentStage = stage;
    this.recompute(detail, stage);
    this.addAssistantMessage(
      detail,
      `${STAGE_LABELS[stage]} is reopened. Later stages are marked stale until revalidated.`,
    );
    this.touch(record);
    return clone(detail);
  }

  async updateField(
    caller: Caller,
    sessionId: string,
    stage: StageId,
    field: string,
    value: string,
  ): Promise<SessionDetail> {
    const record = this.writable(caller, sessionId);
    const state = this.stage(record.detail, stage);
    if (state.status !== "active" && state.status !== "stale") {
      throw new BackendError(
        "validation_error",
        `Reopen ${STAGE_LABELS[stage]} before editing its fields.`,
      );
    }
    const target = state.fields.find((candidate) => candidate.field === field);
    if (!target) {
      throw new BackendError("not_found", `Unknown field ${field}.`);
    }
    const trimmed = value.trim();
    target.value = trimmed.length > 0 ? trimmed : null;
    target.coverage = trimmed.length > 0 ? "clear" : "missing";
    delete target.reason;
    this.recompute(record.detail, stage);
    this.addVersion(record, stage);
    this.touch(record);
    return clone(record.detail);
  }

  async addComment(
    caller: Caller,
    sessionId: string,
    input: { stage: StageId; section: string; body: string },
  ): Promise<SessionDetail> {
    const record = this.writable(caller, sessionId);
    const body = input.body.trim();
    if (body.length === 0) {
      throw new BackendError("validation_error", "A comment cannot be empty.");
    }
    record.detail.comments.push({
      id: crypto.randomUUID(),
      stage: input.stage,
      section: input.section,
      body,
      createdAt: this.timestamp(),
    });
    this.touch(record);
    return clone(record.detail);
  }

  async getDeliverySlicing(caller: Caller, sessionId: string): Promise<DeliverySlicing> {
    const record = this.record(caller, sessionId);
    return clone(record.slicing ?? { slices: [], waves: [], contracts: [] });
  }

  async exportSession(
    caller: Caller,
    sessionId: string,
    format: ExportFormat,
  ): Promise<ExportFile> {
    const record = this.record(caller, sessionId);
    const slug = record.detail.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slicing = record.slicing ?? { slices: [], waves: [], contracts: [] };
    switch (format) {
      case "markdown":
        return {
          filename: `${slug}.md`,
          contentType: "text/markdown; charset=utf-8",
          body: STAGES.map((stage) => record.documents[stage].at(-1)?.markdown)
            .filter((markdown): markdown is string => Boolean(markdown))
            .join("\n---\n\n"),
        };
      case "json":
        return {
          filename: `${slug}.json`,
          contentType: "application/json",
          body: JSON.stringify(record.detail, null, 2),
        };
      case "slice_specs":
        return {
          filename: `${slug}-slices.md`,
          contentType: "text/markdown; charset=utf-8",
          body: slicing.slices
            .map((slice) =>
              [
                `# ${slice.id} ${slice.name}`,
                "",
                slice.goal,
                "",
                `- Owned domain: ${slice.ownedDomain}`,
                `- Depends on: ${slice.dependsOn.join(", ") || "none"}`,
                `- Provides: ${slice.provides.join(", ") || "none"}`,
                `- Consumes: ${slice.consumes.join(", ") || "none"}`,
                "",
                "## Integration scenarios",
                "",
                ...slice.integrationScenarios.map((scenario) => `- ${scenario}`),
                "",
              ].join("\n"),
            )
            .join("\n"),
        };
      case "backlog_json":
        return {
          filename: `${slug}-backlog.json`,
          contentType: "application/json",
          body: JSON.stringify(
            {
              waves: slicing.waves,
              slices: slicing.slices.map((slice) => ({
                id: slice.id,
                backlogItemIds: slice.backlogItemIds,
                dependsOn: slice.dependsOn,
              })),
            },
            null,
            2,
          ),
        };
    }
  }

  // ---------------------------------------------------------------- internals

  private record(caller: Caller, sessionId: string): SessionRecord {
    this.ensureSeeded(caller);
    const record = this.sessions.get(sessionId);
    // Another owner's session is reported as missing, like the backend does.
    if (!record || record.ownerId !== caller.userId) {
      throw new BackendError("not_found", "Session not found.");
    }
    return record;
  }

  private writable(caller: Caller, sessionId: string): SessionRecord {
    const record = this.record(caller, sessionId);
    if (record.detail.archived) {
      throw new BackendError("validation_error", "Archived sessions are read-only.");
    }
    return record;
  }

  private stage(detail: SessionDetail, stage: StageId): StageState {
    const state = detail.stages.find((candidate) => candidate.stage === stage);
    if (!state) {
      throw new BackendError("not_found", `Unknown stage ${stage}.`);
    }
    return state;
  }

  private summary(detail: SessionDetail): SessionSummary {
    return {
      id: detail.id,
      title: detail.title,
      currentStage: detail.currentStage,
      archived: detail.archived,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private touch(record: SessionRecord): void {
    record.detail.updatedAt = this.timestamp();
  }

  private newRecord(ownerId: string, title: string): SessionRecord {
    const createdAt = this.timestamp();
    const stages: StageState[] = STAGES.map((stage, index) => ({
      stage,
      status: index === 0 ? "active" : "locked",
      fields: buildFields(stage),
      readiness: [],
      documentVersion: 0,
    }));
    const detail: SessionDetail = {
      id: crypto.randomUUID(),
      title,
      currentStage: "stage_0_pitch",
      archived: false,
      createdAt,
      updatedAt: createdAt,
      stages,
      messages: [],
      openQuestions: [],
      pendingReview: null,
      comments: [],
    };
    for (const stage of STAGES) {
      this.recompute(detail, stage);
    }
    this.addAssistantMessage(
      detail,
      "Welcome. Pitch your project in a few sentences: what is the idea and who is it for?",
    );
    return { ownerId, detail, documents: emptyDocuments(), slicing: null };
  }

  private recompute(detail: SessionDetail, stage: StageId): void {
    const state = this.stage(detail, stage);
    state.readiness = computeReadiness(state, detail.openQuestions);
  }

  private addVersion(record: SessionRecord, stage: StageId): DocumentVersion {
    const state = this.stage(record.detail, stage);
    const version = record.documents[stage].length + 1;
    const document: DocumentVersion = {
      stage,
      version,
      createdAt: this.timestamp(),
      markdown: renderStageMarkdown(state, version, record.detail.openQuestions),
    };
    record.documents[stage].push(document);
    state.documentVersion = version;
    return document;
  }

  private addAssistantMessage(detail: SessionDetail, content: string): ChatMessage {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      stage: detail.currentStage,
      createdAt: this.timestamp(),
    };
    detail.messages.push(message);
    return message;
  }

  private applyTurn(record: SessionRecord, message: string): TurnEvent[] {
    const { detail } = record;
    const stage = detail.currentStage;
    const state = this.stage(detail, stage);
    const turnId = crypto.randomUUID();
    detail.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      stage,
      createdAt: this.timestamp(),
    });

    const answered = detail.openQuestions.find(
      (question) => question.stage === stage && message.includes(question.question),
    );
    if (answered) {
      detail.openQuestions = detail.openQuestions.filter((question) => question !== answered);
    }
    const target = answered ? undefined : state.fields.find((field) => field.coverage !== "clear");
    if (target) {
      target.value = message;
      target.coverage = "clear";
      delete target.reason;
    }
    if (state.status === "stale") {
      state.status = "active";
    }
    this.recompute(detail, stage);
    const ready = state.readiness.every((check) => check.passed);
    if (ready) {
      state.status = "awaiting_review";
      detail.pendingReview = { stage, requestedAt: this.timestamp() };
    }
    const document = this.addVersion(record, stage);
    const nextGap = state.fields.find((field) => field.coverage !== "clear");
    const reply = ready
      ? `Every readiness check of ${STAGE_LABELS[stage]} passes. Please review the stage document, then approve it or request changes.`
      : `Thanks, I recorded ${target ? `**${target.label}**` : "your answer"}. ${
          nextGap
            ? `Next, tell me about the ${nextGap.label.toLowerCase()}: what do you know for sure, and what is still an assumption?`
            : "Please answer the remaining open questions."
        }`;
    const assistant = this.addAssistantMessage(detail, reply);
    this.touch(record);

    const events: TurnEvent[] = [
      { type: "turn.started", turnId, stage },
      {
        type: "analysis.status",
        status: "extracting",
        message: "Extracting facts from your answer",
      },
      { type: "analysis.status", status: "validating", message: "Checking stage completeness" },
      ...splitIntoDeltas(reply).map((delta): TurnEvent => ({
        type: "message.delta",
        messageId: assistant.id,
        delta,
      })),
      { type: "document.updated", document: clone(document) },
      { type: "coverage.updated", stage: clone(state) },
      { type: "questions.updated", questions: clone(detail.openQuestions) },
    ];
    if (detail.pendingReview) {
      events.push({ type: "review.required", review: clone(detail.pendingReview) });
    }
    events.push({ type: "turn.completed", turnId, message: clone(assistant) });
    return events;
  }

  private failingTurnEvents(record: SessionRecord): TurnEvent[] {
    return [
      { type: "turn.started", turnId: crypto.randomUUID(), stage: record.detail.currentStage },
      {
        type: "analysis.status",
        status: "extracting",
        message: "Extracting facts from your answer",
      },
      {
        type: "error",
        code: "llm_error",
        message:
          "The language model did not return a valid analysis. Your message was not applied; try again.",
      },
    ];
  }

  private eventStream(events: TurnEvent[]): ReadableStream<Uint8Array> {
    const delay = this.options.streamDelayMs;
    let index = 0;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index >= events.length) {
          controller.close();
          return;
        }
        if (index > 0) {
          await sleep(delay);
        }
        controller.enqueue(encodeSseEvent(events[index]));
        index += 1;
      },
    });
  }

  private ensureSeeded(caller: Caller): void {
    if (this.seededUsers.has(caller.userId)) {
      return;
    }
    this.seededUsers.add(caller.userId);
    const user = this.options.users.find((candidate) => candidate.id === caller.userId);
    if (user?.seed) {
      this.seedDemoSessions(caller.userId);
    }
  }

  private fillStage(
    record: SessionRecord,
    stage: StageId,
    values: Partial<Record<string, string>>,
    partial: Partial<Record<string, string>> = {},
  ): void {
    const state = this.stage(record.detail, stage);
    for (const field of state.fields) {
      const value = values[field.field];
      if (value !== undefined) {
        field.value = value;
        field.coverage = "clear";
      } else if (partial[field.field] !== undefined) {
        field.value = partial[field.field] ?? null;
        field.coverage = "partial";
        field.reason = "needs a measurable boundary";
      }
    }
  }

  private seedDemoSessions(ownerId: string): void {
    const retro = this.newRecord(ownerId, "Team retrospective tool");
    const fieldService = this.newRecord(ownerId, "Field service scheduling");
    this.seedRetro(retro);
    this.seedFieldService(fieldService);
    this.sessions.set(fieldService.detail.id, fieldService);
    this.sessions.set(retro.detail.id, retro);
  }

  private validateStage(record: SessionRecord, stage: StageId, values: Record<string, string>) {
    const state = this.stage(record.detail, stage);
    const first = state.fields[0];
    this.fillStage(record, stage, { [first.field]: values[first.field] ?? "" });
    this.recompute(record.detail, stage);
    this.addVersion(record, stage);
    this.fillStage(record, stage, values);
    state.status = "validated";
    this.recompute(record.detail, stage);
    this.addVersion(record, stage);
  }

  private seedRetro(record: SessionRecord): void {
    const { detail } = record;
    detail.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: "A lightweight tool for remote teams to run sprint retrospectives asynchronously.",
      stage: "stage_0_pitch",
      createdAt: this.timestamp(),
    });
    this.validateStage(record, "stage_0_pitch", {
      product_idea: "Asynchronous sprint retrospectives for remote teams",
      target_users: "Scrum masters and team members of distributed teams",
      expected_value: "Retros that fit time zones without losing candour",
    });
    this.validateStage(record, "stage_1_problem_framing", {
      problem_statement: "Synchronous retros exclude members in distant time zones",
      context_5w1h: "Teams of 5-12 people across 3+ time zones, every 2 weeks",
      measurable_objectives: "80% participation per retro within 3 months",
    });
    const storyMap = this.stage(detail, "stage_2_user_story_mapping");
    storyMap.status = "active";
    detail.currentStage = "stage_2_user_story_mapping";
    this.fillStage(record, "stage_2_user_story_mapping", { actors: "Facilitator, team member" });
    this.recompute(detail, "stage_2_user_story_mapping");
    this.addVersion(record, "stage_2_user_story_mapping");
    this.fillStage(
      record,
      "stage_2_user_story_mapping",
      { actors: "Facilitator, team member, engineering manager (read-only)" },
      { backbone_activities: "Collect feedback, group, vote, decide actions" },
    );
    detail.openQuestions = [
      {
        id: crypto.randomUUID(),
        stage: "stage_2_user_story_mapping",
        question: "Which activities belong to the first release?",
        whyItMatters: "The MVP scope gates the backlog synthesis and the delivery slices.",
        options: [
          { id: "collect-vote", label: "Collect feedback and vote", recommended: true },
          { id: "full-cycle", label: "Full cycle including action tracking", recommended: false },
          { id: "collect-only", label: "Feedback collection only", recommended: false },
        ],
      },
      {
        id: crypto.randomUUID(),
        stage: "stage_2_user_story_mapping",
        question: "Must feedback be anonymous by default?",
        whyItMatters: "Anonymity changes the data model and the moderation features.",
        options: [
          { id: "anonymous", label: "Yes, anonymous by default", recommended: true },
          { id: "named", label: "No, always named", recommended: false },
        ],
      },
    ];
    this.recompute(detail, "stage_2_user_story_mapping");
    this.addVersion(record, "stage_2_user_story_mapping");
    this.addAssistantMessage(
      detail,
      "The backbone is taking shape. Two open questions remain before the MVP scope is clear.",
    );
  }

  private seedFieldService(record: SessionRecord): void {
    const { detail } = record;
    const values: Record<StageId, Record<string, string>> = {
      stage_0_pitch: {
        product_idea: "Scheduling assistant for field service dispatchers",
        target_users: "Dispatchers and field technicians",
        expected_value: "Fewer idle technician hours",
      },
      stage_1_problem_framing: {
        problem_statement: "Dispatchers plan jobs in spreadsheets and miss skill constraints",
        context_5w1h: "Regional HVAC company, 40 technicians, daily planning",
        measurable_objectives: "Cut planning time from 2 h to 30 min per day",
      },
      stage_2_user_story_mapping: {
        actors: "Dispatcher, technician, customer",
        backbone_activities: "Intake job, declare availability, dispatch, report",
        mvp_scope: "Intake, availability, dispatch board",
      },
      stage_3_event_storming: {
        relevance: "Relevant: several bounded contexts",
        domain_events: "JobCreated, AvailabilityChanged, JobScheduled",
        aggregates: "Job, Technician, Schedule",
      },
      stage_4_impact_mapping: {
        goal: "Planning time under 30 minutes",
        actor_impacts: "Dispatchers plan with skill-aware suggestions",
        deliverables: "Dispatch board with matching",
      },
      stage_5_risk_storming: {
        risks: "Data quality of skills; adoption; calendar sync",
        mitigations: "Skill audit; pilot team; read-only sync first",
        pre_mortem: "Dispatchers keep spreadsheets in parallel",
      },
      stage_6_backlog_synthesis: {
        backlog_items: "B1-B7 linked to goals and risks",
        definition_of_done: "Deployed, tested, documented",
        traceability: "Every item links to a goal or a risk",
      },
      stage_7_delivery_slicing: {
        slices: "S0 walking skeleton, S1 intake, S2 availability, S3 dispatch",
        contracts: "C1-C5 with one owning slice each",
        waves: "3 waves derived from the dependency graph",
      },
    };
    for (const stage of STAGES.slice(0, 7)) {
      this.validateStage(record, stage, values[stage]);
    }
    const slicing = this.stage(detail, "stage_7_delivery_slicing");
    this.fillStage(record, "stage_7_delivery_slicing", values.stage_7_delivery_slicing);
    slicing.status = "awaiting_review";
    detail.currentStage = "stage_7_delivery_slicing";
    this.recompute(detail, "stage_7_delivery_slicing");
    this.addVersion(record, "stage_7_delivery_slicing");
    detail.pendingReview = { stage: "stage_7_delivery_slicing", requestedAt: this.timestamp() };
    record.slicing = clone(DEMO_DELIVERY_SLICING);
    this.addAssistantMessage(
      detail,
      "The delivery slicing is complete: 4 slices in 3 waves. Please review it.",
    );
  }
}
