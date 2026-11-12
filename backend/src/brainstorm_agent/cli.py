"""CLI entry point for brainstorm-agent."""

from __future__ import annotations

import argparse

import uvicorn

from brainstorm_agent import __version__
from brainstorm_agent.logging import configure_logging, get_logger
from brainstorm_agent.persistence.session import upgrade_database
from brainstorm_agent.services.auth import hash_api_key
from brainstorm_agent.settings import get_settings


def build_parser() -> argparse.ArgumentParser:
    """Create the command-line parser.

    Returns:
        argparse.ArgumentParser: The configured argument parser.
    """
    parser = argparse.ArgumentParser(prog="brainstorm-agent")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command")
    serve_parser = subparsers.add_parser("serve", help="Run the FastAPI backend.")
    serve_parser.add_argument("--host", default=None)
    serve_parser.add_argument("--port", default=None, type=int)
    migrate_parser = subparsers.add_parser("migrate", help="Run Alembic migrations.")
    migrate_parser.add_argument("--revision", default="head")
    hash_parser = subparsers.add_parser("hash-api-key", help="Hash an API key for storage.")
    hash_parser.add_argument("value")
    hash_parser.add_argument("--pepper", default=None)
    return parser


def main() -> int:
    """Run the CLI.

    Returns:
        int: Exit code (0 for success).
    """
    parser = build_parser()
    args = parser.parse_args()
    command = getattr(args, "command", None)
    if command == "hash-api-key":
        print(hash_api_key(args.value, pepper=args.pepper))
        return 0

    settings = get_settings()
    configure_logging(settings=settings)
    logger = get_logger("brainstorm_agent.cli")
    if command == "serve":
        logger.info("Starting API server", host=args.host or settings.host, port=args.port or settings.port)
        uvicorn.run(
            "brainstorm_agent.api.main:create_app",
            factory=True,
            host=args.host or settings.host,
            port=args.port or settings.port,
        )
        return 0
    if command == "migrate":
        logger.info("Running migrations", revision=args.revision)
        upgrade_database(database_url=settings.database_url, revision=args.revision)
        return 0

    logger.info("CLI initialized", version=__version__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
