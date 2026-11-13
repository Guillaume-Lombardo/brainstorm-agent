import { MockBackend } from "@/lib/backend/mock";
import type { SessionDetail } from "@/lib/backend/types";

/** A seeded demo session from the mock backend, for component tests. */
export async function demoSession(title: string): Promise<SessionDetail> {
  const mock = new MockBackend({
    streamDelayMs: 0,
    users: [{ id: "u", email: "u@example.com", displayName: "U", password: "p", seed: true }], // pragma: allowlist secret
  });
  const sessions = await mock.listSessions({ userId: "u" }, { includeArchived: true });
  const summary = sessions.find((session) => session.title === title);
  if (!summary) {
    throw new Error(`No demo session ${title}`);
  }
  return mock.getSession({ userId: "u" }, summary.id);
}
