import { defineConfig, devices } from "@playwright/test";

import { E2E_BACKEND_PORT, E2E_FRONTEND_PORT, E2E_JWT, E2E_SECRETS } from "./scripts/e2e-env.mjs";

const baseURL = `http://localhost:${E2E_FRONTEND_PORT}`;
const backendURL = `http://127.0.0.1:${E2E_BACKEND_PORT}`;

/**
 * End-to-end tests of the production build against the real backend: `fake` LLM mode,
 * SQLite, JWT auth and the login bridge (`scripts/e2e-backend.mjs`). No Docker needed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
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
  webServer: [
    {
      command: "node scripts/e2e-backend.mjs",
      url: `${backendURL}/readyz`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
    },
    {
      command: "pnpm build && node scripts/serve-standalone.mjs",
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        AUTH_SECRET: E2E_SECRETS.authSecret,
        AUTH_URL: baseURL,
        BACKEND_URL: backendURL,
        BACKEND_JWT_SECRET: E2E_SECRETS.jwtSecret,
        BACKEND_JWT_ISSUER: E2E_JWT.issuer,
        BACKEND_JWT_AUDIENCE: E2E_JWT.audience,
        AUTH_BRIDGE_SECRET: E2E_SECRETS.bridgeSecret,
        PORT: String(E2E_FRONTEND_PORT),
      },
    },
  ],
});
