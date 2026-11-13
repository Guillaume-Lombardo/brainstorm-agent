# syntax=docker/dockerfile:1

# FastAPI backend image. Build from the repository root (it copies the root
# LICENSE): docker build -f backend/Dockerfile -t brainstorm-agent-backend .
ARG PYTHON_IMAGE=python:3.14-slim
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.0

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS build
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY --from=uv /uv /usr/local/bin/uv
# Dependencies first so source edits reuse the cached layer.
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
COPY backend/README.md LICENSE ./
COPY backend/src ./src
# Editable install: Alembic resolves alembic.ini from the source tree.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM ${PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}" \
    HOST=0.0.0.0 \
    PORT=8000
WORKDIR /app
RUN groupadd --system --gid 10001 brainstorm \
    && useradd --system --uid 10001 --gid brainstorm --home-dir /app --no-create-home brainstorm
COPY --from=build /app/.venv ./.venv
COPY --from=build /app/src ./src
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY --chmod=0755 backend/docker ./docker
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD ["python", "-c", "import os, sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/readyz', timeout=4).status == 200 else 1)"]
ENTRYPOINT ["/app/docker/entrypoint.sh"]
