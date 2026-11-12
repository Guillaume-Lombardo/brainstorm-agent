# brainstorm-agent backend

Persistent project framing service built with FastAPI, LangGraph, SQLAlchemy,
Postgres and Redis. Business and OpenAI-compatible HTTP APIs preserve the fixed
seven-stage workflow.

From this directory:

```bash
uv sync --group dev
cp .env.template .env
uv run brainstorm-agent serve
```

See the [repository documentation](https://github.com/Guillaume-Lombardo/brainstorm-agent)
for API contracts, Compose deployment, configuration and validation.
