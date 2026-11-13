"""CLI entry point for brainstorm-agent."""

from __future__ import annotations

import argparse
from getpass import getpass
from pathlib import Path

import uvicorn
from sqlalchemy import select

from brainstorm_agent import __version__
from brainstorm_agent.async_runner import run_async
from brainstorm_agent.evaluation.runner import default_scenarios, evaluate
from brainstorm_agent.logging import configure_logging, get_logger
from brainstorm_agent.persistence.models import UserRecord
from brainstorm_agent.persistence.session import (
    create_engine_from_settings,
    create_session_factory,
    upgrade_database,
)
from brainstorm_agent.services.auth import hash_api_key
from brainstorm_agent.services.users import UserService, hash_password
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
    user_parser = subparsers.add_parser("user", help="Administer users (no public registration).")
    user_commands = user_parser.add_subparsers(dest="user_command", required=True)
    for operation in ("create", "set-password", "disable"):
        operation_parser = user_commands.add_parser(operation)
        operation_parser.add_argument("email")
        if operation == "create":
            operation_parser.add_argument("--display-name", required=True)
    evaluation = subparsers.add_parser("eval", help="Evaluate golden scenarios (fake mode is offline).")
    evaluation.add_argument("--model", action="append", dest="models")
    evaluation.add_argument("--judge-model", default="claude-opus-5-5")
    evaluation.add_argument("--scenarios", type=Path, default=default_scenarios())
    evaluation.add_argument("--output", type=Path, default=Path(".evaluation-reports"))
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
    if command == "eval":
        return (
            0
            if run_async(
                evaluate(
                    settings=settings,
                    models=args.models or ["glm-5.3-flash"],
                    scenarios_dir=args.scenarios,
                    output_dir=args.output,
                    judge_model=args.judge_model,
                ),
            )
            else 1
        )
    configure_logging(settings=settings)
    logger = get_logger("brainstorm_agent.cli")
    if command == "user":
        engine = create_engine_from_settings(settings)
        try:
            with create_session_factory(engine)() as db:
                if args.user_command == "create":
                    user = UserService(db).create(args.email, args.display_name, getpass("Password: "))
                else:
                    user = db.scalar(select(UserRecord).where(UserRecord.email == args.email.strip().lower()))
                    if user is None:
                        parser.error("User not found.")
                    if args.user_command == "disable":
                        user.active = False
                    else:
                        user.password_hash = hash_password(getpass("New password: "))
                db.commit()
                print(user.id)
        finally:
            engine.dispose()
        return 0
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
