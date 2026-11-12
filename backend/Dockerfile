FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml backend/uv.lock backend/README.md LICENSE backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/docker ./docker
COPY backend/src ./src
COPY backend/.env.template ./.env.template

RUN uv sync --frozen --no-dev
RUN chmod +x /app/docker/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/docker/entrypoint.sh"]
