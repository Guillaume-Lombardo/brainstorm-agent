"""CLI entry point for brainstorm-agent."""

from __future__ import annotations

import argparse

import uvicorn

from brainstorm_agent import __version__
from brainstorm_agent.logging import configure_logging, get_logger
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
    return parser


def main() -> int:
    """Run the CLI.

    Returns:
        int: Exit code (0 for success).
    """
    parser = build_parser()
    args = parser.parse_args()
    settings = get_settings()
    configure_logging(settings=settings)
    logger = get_logger("brainstorm_agent.cli")
    command = getattr(args, "command", None)
    if command == "serve":
        logger.info("Starting API server", host=args.host or settings.host, port=args.port or settings.port)
        uvicorn.run(
            "brainstorm_agent.api.main:create_app",
            factory=True,
            host=args.host or settings.host,
            port=args.port or settings.port,
        )
        return 0

    logger.info("CLI initialized", version=__version__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
