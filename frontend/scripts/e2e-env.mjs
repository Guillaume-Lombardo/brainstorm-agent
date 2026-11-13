// Shared settings of the local test stack (`scripts/e2e-backend.mjs`, `playwright.config.ts`).
// Every secret here is a throwaway value for a local SQLite database: never reuse it.

export const E2E_BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 8100);
export const E2E_FRONTEND_PORT = Number(process.env.E2E_PORT ?? 3100);

export const E2E_SECRETS = {
  // Auth.js session cookie.
  authSecret: "e2e-only-auth-secret-not-for-production-0000", // pragma: allowlist secret
  // HS256 key shared by the frontend (signs) and the backend (verifies).
  jwtSecret: "e2e-only-backend-jwt-secret-not-for-production", // pragma: allowlist secret
  // `X-Auth-Bridge` secret of the server-to-server login bridge.
  bridgeSecret: "e2e-only-auth-bridge-secret-not-for-production", // pragma: allowlist secret
};

export const E2E_JWT = { issuer: "brainstorm-frontend", audience: "brainstorm-backend" };

export const E2E_PASSWORD = "e2e-password-0123"; // pragma: allowlist secret

/** Accounts created at backend start; each test signs in with its own (login limit per e-mail). */
export const E2E_USERS = [
  { email: "journey@example.com", displayName: "Journey" },
  { email: "errors@example.com", displayName: "Errors" },
  { email: "wrong@example.com", displayName: "Wrong password" },
];
