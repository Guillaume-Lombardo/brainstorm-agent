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

### Similar products research

Stage 1 and later expose an optional, explicitly triggered snippet benchmark. Users select features;
only selected candidates become benchmark decisions and stage 2 context. Reruns are versioned.
Markdown and JSON exports include Benchmark. Apply migration 0003 through the init service.

`SEARCH_PROVIDER=none|searxng|tavily|brave|litellm|fake` defaults to `none` (control hidden).
SearXNG requires `SEARXNG_BASE_URL`; Tavily/Brave require their `*_API_KEY`, with configurable
`*_SEARCH_URL`. LiteLLM requires `LITELLM_SEARCH_URL`, `LITELLM_SEARCH_API_KEY`, `SEARCH_TOOL_NAME`.
`SEARCH_TIMEOUT_SECONDS` bounds each call. `fake` requires `LLM_MODE=fake`. See backend/.env.template.

The deployment uses internal SearXNG with no published port and versioned JSON-enabled settings in
`deploy/searxng/settings.yml`. Provision `BRAINSTORM_SEARXNG_SECRET` in 1Password and Dockhand before
merging; Compose requires it. The image consumes `SEARXNG_SECRET`. Never commit its value.
For dev, set the secret, `SEARCH_PROVIDER=searxng`, and use `docker compose --profile search`.

Owner-scoped API: `GET /api/v1/sessions/{id}/research` returns availability/history; `POST` streams
`research.started` and `research.completed` or `error`; `PATCH /research/{benchmark_id}/selection`
replaces `selected_ids`. Empty results are valid. No search result page is downloaded.
