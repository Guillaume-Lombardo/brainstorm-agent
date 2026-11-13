#!/usr/bin/env bash
# Smoke test of a running stack through its public entry point.
#
#   deploy/smoke.sh http://127.0.0.1:47280                          # behind Caddy
#   deploy/smoke.sh http://127.0.0.1:3000 http://127.0.0.1:8000    # dev compose
#
# Checks the frontend login page, the backend probe, a bridge login of the
# bootstrap administrator, then creates a session and plays one turn (JSON and
# SSE) with a short-lived JWT. Run it against LLM_MODE=fake to stay offline.
# Reads BRAINSTORM_AUTH_BRIDGE_SECRET, BRAINSTORM_JWT_SECRET, BRAINSTORM_ADMIN_EMAIL
# and BRAINSTORM_ADMIN_PASSWORD from the environment; never prints them.
# Requires curl and python3.
set -euo pipefail

frontend_url="${1:?usage: deploy/smoke.sh <base-url> [backend-url]}"
frontend_url="${frontend_url%/}"
base_url="${2:-$frontend_url}"
base_url="${base_url%/}"
: "${BRAINSTORM_AUTH_BRIDGE_SECRET:?}" "${BRAINSTORM_JWT_SECRET:?}"
: "${BRAINSTORM_ADMIN_EMAIL:?}" "${BRAINSTORM_ADMIN_PASSWORD:?}"
issuer="${BRAINSTORM_JWT_ISSUER:-brainstorm-frontend}"
audience="${BRAINSTORM_JWT_AUDIENCE:-brainstorm-backend}"

check() {
  printf 'ok   %s\n' "$1"
}

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
user_id=$(curl -sf -X POST "$base_url/api/v1/auth/verify" \
  -H "X-Auth-Bridge: $BRAINSTORM_AUTH_BRIDGE_SECRET" -H 'content-type: application/json' \
  --data-binary @- <<<"$login_body" | python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])')
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

session_id=$(curl -sf -X POST "$base_url/api/v1/sessions" -H "authorization: Bearer $token" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["session_id"])')
check "backend POST /api/v1/sessions -> session $session_id"

curl -sf -X POST "$base_url/api/v1/sessions/$session_id/messages" -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  -d '{"content": "We want a shared grocery list app for flatmates to stop buying duplicates."}' \
  | python3 -c 'import json, sys; body = json.load(sys.stdin); print("ok   turn played, keys:", ", ".join(sorted(body)))'

events=$(curl -sfN -X POST "$base_url/api/v1/sessions/$session_id/messages/stream" \
  -H "authorization: Bearer $token" -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -d '{"content": "The users are three to five flatmates sharing one kitchen."}' | grep -c '^event:' || true)
[ "$events" -gt 0 ] || { echo "FAIL no SSE event received" >&2; exit 1; }
check "backend SSE turn through the proxy -> $events events"

echo "smoke test passed"
