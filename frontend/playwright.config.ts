import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests against the standalone production server with the in-memory mock
 * backend (`BACKEND_MODE=mock`). Lot 7b points them at the backend `fake` mode.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "pnpm build && node scripts/serve-standalone.mjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      BACKEND_MODE: "mock",
      MOCK_STREAM_DELAY_MS: "5",
      // Test-only signing secret for the Auth.js session cookie.
      AUTH_SECRET: "e2e-only-auth-secret-not-for-production", // pragma: allowlist secret
      AUTH_URL: baseURL,
      PORT: String(PORT),
    },
  },
});
