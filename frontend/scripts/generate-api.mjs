/** Regenerate the versioned backend schema and TypeScript without a running server. */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";

const result = spawnSync(
  "uv",
  [
    "run",
    "--project",
    "../backend",
    "python",
    "-c",
    [
      "import json",
      "from brainstorm_agent.api.main import create_app",
      "from brainstorm_agent.settings import Settings",
      "app = create_app(Settings(database_url='sqlite:///:memory:', llm_mode='fake', auto_create_schema=False, run_db_migrations_on_startup=False, redis_url='redis://localhost:6399/0'))",
      "print(json.dumps(app.openapi(), indent=2, sort_keys=True))",
    ].join("; "),
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) throw new Error(result.stderr);
const schema = JSON.parse(result.stdout);
writeFileSync("src/lib/backend/generated/openapi.json", JSON.stringify(schema, null, 2) + "\n");
writeFileSync("src/lib/backend/generated/api.ts", astToString(await openapiTS(schema)));
