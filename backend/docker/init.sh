#!/usr/bin/env sh
# One-shot initialization: apply Alembic migrations, then create the bootstrap
# administrator with the `user create` CLI when BOOTSTRAP_ADMIN_EMAIL is set and
# the account does not exist yet. Safe to run on every deployment.
set -eu

brainstorm-agent migrate --revision head

if [ -z "${BOOTSTRAP_ADMIN_EMAIL:-}" ]; then
  echo "init: BOOTSTRAP_ADMIN_EMAIL is empty, no administrator bootstrap."
  exit 0
fi
: "${BOOTSTRAP_ADMIN_PASSWORD:?BOOTSTRAP_ADMIN_PASSWORD is required with BOOTSTRAP_ADMIN_EMAIL}"

# Exit status: 0 when the account exists, 3 when it is absent, anything else is an error.
set +e
python - "$BOOTSTRAP_ADMIN_EMAIL" <<'PY'
import sys

from sqlalchemy import select

from brainstorm_agent.persistence.models import UserRecord
from brainstorm_agent.persistence.session import create_engine_from_settings
from brainstorm_agent.settings import get_settings

engine = create_engine_from_settings(get_settings())
try:
    with engine.connect() as connection:
        found = connection.scalar(select(UserRecord.id).where(UserRecord.email == sys.argv[1].strip().lower()))
finally:
    engine.dispose()
sys.exit(0 if found else 3)
PY
status=$?
set -e

case "$status" in
  0)
    echo "init: administrator already exists, nothing to do."
    ;;
  3)
    # `user create` reads the password from stdin when no terminal is attached.
    printf '%s\n' "$BOOTSTRAP_ADMIN_PASSWORD" \
      | brainstorm-agent user create "$BOOTSTRAP_ADMIN_EMAIL" --display-name "${BOOTSTRAP_ADMIN_DISPLAY_NAME:-Administrator}" >/dev/null
    echo "init: administrator created."
    ;;
  *)
    echo "init: cannot check the administrator account (status $status)." >&2
    exit "$status"
    ;;
esac
