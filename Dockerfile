FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock* README.md LICENSE ./
COPY src ./src
COPY prompts ./prompts
COPY .env.example ./.env.example

RUN uv sync --group dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "brainstorm_agent.api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
