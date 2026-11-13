#!/usr/bin/env sh
# Container entrypoint: run the given command, or serve the API by default.
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "${RUN_DB_MIGRATIONS_ON_STARTUP:-false}" = "true" ]; then
  brainstorm-agent migrate --revision head
fi

exec uvicorn brainstorm_agent.api.main:create_app --factory --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}"
