#!/usr/bin/env sh
set -eu

if [ "${RUN_DB_MIGRATIONS_ON_STARTUP:-false}" = "true" ]; then
  uv run brainstorm-agent migrate --revision head
fi

exec uv run uvicorn brainstorm_agent.api.main:create_app --factory --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}"
