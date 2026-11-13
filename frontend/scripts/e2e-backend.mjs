#!/usr/bin/env node
// Start the real backend for end-to-end tests and local development: `fake` LLM mode,
// a throwaway SQLite database, JWT auth and the login bridge, with the test accounts of
// `e2e-env.mjs`. Needs `uv` (the backend toolchain). Stops and cleans up on SIGINT/SIGTERM.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { E2E_BACKEND_PORT, E2E_JWT, E2E_PASSWORD, E2E_SECRETS, E2E_USERS } from "./e2e-env.mjs";

const frontendDir = new URL("..", import.meta.url).pathname;
const backendDir = resolve(frontendDir, "..", "backend");
// One fixed, git-ignored directory: every start begins from an empty database.
const dataDir = join(frontendDir, ".e2e-backend");
const cleanup = () => rmSync(dataDir, { recursive: true, force: true });
cleanup();
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  APP_ENV: "dev",
  HOST: "127.0.0.1",
  PORT: String(E2E_BACKEND_PORT),
  DATABASE_URL: `sqlite:///${join(dataDir, "e2e.db")}`,
  AUTO_CREATE_SCHEMA: "false",
  RUN_DB_MIGRATIONS_ON_STARTUP: "false",
  // No Redis in the test stack: the backend falls back to in-process locks and limits.
  REDIS_URL: "redis://127.0.0.1:1/0",
  RATE_LIMIT_ENABLED: "false",
  LLM_MODE: "fake",
  ENABLE_AUTH: "true",
  AUTH_MODE: "jwt",
  JWT_SECRET_KEY: E2E_SECRETS.jwtSecret,
  JWT_ISSUER: E2E_JWT.issuer,
  JWT_AUDIENCE: E2E_JWT.audience,
  AUTH_BRIDGE_SECRET: E2E_SECRETS.bridgeSecret,
  REQUIRE_HUMAN_VALIDATION_FOR_TRANSITIONS: "true",
  LOG_JSON: "false",
};

function run(args, input) {
  const result = spawnSync("uv", ["run", "brainstorm-agent", ...args], {
    cwd: backendDir,
    env,
    input,
    stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    cleanup();
    console.error(`brainstorm-agent ${args.join(" ")} failed (${result.status ?? result.error}).`);
    process.exit(1);
  }
}

run(["migrate"]);
for (const user of E2E_USERS) {
  run(["user", "create", user.email, "--display-name", user.displayName], `${E2E_PASSWORD}\n`);
}

const server = spawn("uv", ["run", "brainstorm-agent", "serve"], {
  cwd: backendDir,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
    // The test runner may not wait for the server to exit: remove the data now.
    cleanup();
  });
}
server.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
