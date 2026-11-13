#!/usr/bin/env bash
# Smoke test of a running stack through its public entry point.
#
#   BRAINSTORM_COMPOSE="docker compose -f deploy/docker-box/compose.yaml" \
#     deploy/smoke.sh http://127.0.0.1:47280                        # behind Caddy
#   deploy/smoke.sh http://127.0.0.1:3000 http://127.0.0.1:8000    # dev compose
#
# Checks the frontend login page, the backend probe, a bridge login of the
# bootstrap administrator, then creates a session and plays one turn (JSON and
# SSE) with a short-lived JWT. Run it against LLM_MODE=fake to stay offline.
# Reads BRAINSTORM_AUTH_BRIDGE_SECRET, BRAINSTORM_JWT_SECRET, BRAINSTORM_ADMIN_EMAIL
# and BRAINSTORM_ADMIN_PASSWORD from the environment (the bridge secret only when
# the bridge is called directly); never prints them.
# Behind Caddy the bridge (/api/v1/auth/*) must answer 404: set BRAINSTORM_COMPOSE
# to the stack's compose command (e.g. "docker compose -p bs -f deploy/docker-box/compose.yaml")
# so the bridge login runs inside the backend container instead.
# Requires bash, curl and python3.
set -euo pipefail

frontend_url="${1:?usage: deploy/smoke.sh <base-url> [backend-url]}"
frontend_url="${frontend_url%/}"
base_url="${2:-$frontend_url}"
base_url="${base_url%/}"
: "${BRAINSTORM_JWT_SECRET:?}"
: "${BRAINSTORM_ADMIN_EMAIL:?}" "${BRAINSTORM_ADMIN_PASSWORD:?}"
issuer="${BRAINSTORM_JWT_ISSUER:-brainstorm-frontend}"
audience="${BRAINSTORM_JWT_AUDIENCE:-brainstorm-backend}"

check() {
  printf 'ok   %s\n' "$1"
}

# Secret headers are read by curl from a file descriptor (`-H @file`), never
# passed as arguments that `ps` would show; printf is a shell builtin.

status=$(curl -s -o /dev/null -w '%{http_code}' "$frontend_url/login")
[ "$status" = 200 ] || { echo "FAIL frontend /login returned $status" >&2; exit 1; }
check "frontend GET /login -> 200"

status=$(curl -s -o /dev/null -w '%{http_code}' "$frontend_url/api/auth/csrf")
[ "$status" = 200 ] || { echo "FAIL Auth.js /api/auth/csrf returned $status" >&2; exit 1; }
check "frontend (Auth.js) GET /api/auth/csrf -> 200"

status=$(curl -s -o /dev/null -w '%{http_code}' "$base_url/readyz")
[ "$status" = 200 ] || { echo "FAIL backend /readyz returned $status" >&2; exit 1; }
check "backend GET /readyz -> 200"

login_body=$(python3 -c 'import json, os; print(json.dumps({"email": os.environ["BRAINSTORM_ADMIN_EMAIL"], "password": os.environ["BRAINSTORM_ADMIN_PASSWORD"]}))')
if [ -n "${BRAINSTORM_COMPOSE:-}" ]; then
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base_url/api/v1/auth/verify")
  [ "$status" = 404 ] || { echo "FAIL public bridge /api/v1/auth/verify returned $status" >&2; exit 1; }
  check "public POST /api/v1/auth/verify -> 404 (bridge stays internal)"
  # The credentials go through stdin; the container already holds the bridge secret.
  # shellcheck disable=SC2086 # BRAINSTORM_COMPOSE is a command line on purpose.
  user_id=$($BRAINSTORM_COMPOSE exec -T backend python -c '
import json, os, sys, urllib.request
request = urllib.request.Request(
    "http://127.0.0.1:8000/api/v1/auth/verify",
    data=sys.stdin.buffer.read(),
    headers={"X-Auth-Bridge": os.environ["AUTH_BRIDGE_SECRET"], "content-type": "application/json"},
)
print(json.load(urllib.request.urlopen(request, timeout=10))["id"])
' <<<"$login_body")
else
  : "${BRAINSTORM_AUTH_BRIDGE_SECRET:?}"
  user_id=$(curl -sf -X POST "$base_url/api/v1/auth/verify" \
    -H @<(printf 'X-Auth-Bridge: %s\n' "$BRAINSTORM_AUTH_BRIDGE_SECRET") -H 'content-type: application/json' \
    --data-binary @- <<<"$login_body" | python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])')
fi
check "backend POST /api/v1/auth/verify (bootstrap admin) -> user $user_id"

token=$(USER_ID="$user_id" ISSUER="$issuer" AUDIENCE="$audience" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time

def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

now = int(time.time())
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
claims = {"sub": os.environ["USER_ID"], "iat": now, "exp": now + 120,
          "iss": os.environ["ISSUER"], "aud": os.environ["AUDIENCE"]}
payload = b64(json.dumps(claims).encode())
signing_input = f"{header}.{payload}".encode()
signature = hmac.new(os.environ["BRAINSTORM_JWT_SECRET"].encode(), signing_input, hashlib.sha256).digest()
print(f"{header}.{payload}.{b64(signature)}")
PY
)

status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base_url/api/v1/sessions")
[ "$status" = 401 ] || { echo "FAIL anonymous session creation returned $status" >&2; exit 1; }
check "backend POST /api/v1/sessions without token -> 401"

session_id=$(curl -sf -X POST "$base_url/api/v1/sessions" -H @<(printf 'authorization: Bearer %s\n' "$token") \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["session_id"])')
check "backend POST /api/v1/sessions -> session $session_id"

curl -sf -X POST "$base_url/api/v1/sessions/$session_id/messages" -H @<(printf 'authorization: Bearer %s\n' "$token") \
  -H 'content-type: application/json' \
  -d '{"content": "We want a shared grocery list app for flatmates to stop buying duplicates."}' \
  | python3 -c 'import json, sys; body = json.load(sys.stdin); print("ok   turn played, keys:", ", ".join(sorted(body)))'

stream=$(curl -sfN -X POST "$base_url/api/v1/sessions/$session_id/messages/stream" \
  -H @<(printf 'authorization: Bearer %s\n' "$token") -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -d '{"content": "The users are three to five flatmates sharing one kitchen."}')
events=$(grep -c '^event:' <<<"$stream")
grep -qx 'event: done' <<<"$stream" || { echo "FAIL SSE stream ended without the done event" >&2; exit 1; }
check "backend SSE turn through the proxy -> $events events"

echo "smoke test passed"
