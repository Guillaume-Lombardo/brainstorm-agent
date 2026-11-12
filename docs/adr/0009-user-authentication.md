# ADR 0009: User authentication and session ownership

- Status: Accepted

## Context

D1 requires multiple users with password login and optional OIDC. The backend
already supports API keys and signed JWTs, but sessions previously had no owner.
There is no public registration, group model or password-reset email service.

## Decision

Persist users with normalized unique email, display name, optional Argon2id
password hash, optional unique OIDC `(issuer, subject)`, active flag and timestamps.
Every session has a non-null indexed foreign key to its owner. Migration 0002
assigns existing sessions to the bootstrap identity (no password); downgrade drops
identities and ownership while preserving conversation records.

Auth.js in Next.js will use a Credentials provider calling `/api/v1/auth/verify`
from the server. The backend returns only id, email and display name. Auth.js
will enable OIDC only when configured, verify the provider callback, tokens and
email verification, then call `/api/v1/auth/oidc` with verified claims. Both bridge
endpoints require the server-only `X-Auth-Bridge` secret and use the existing rate
limiter before password hashing or provisioning. Never expose this secret in the
browser. Rotate it through the deployment secret store, not source control.

OIDC resolution uses issuer and subject, never automatic email matching. An email
collision requires administrator intervention; it does not link accounts.
`OIDC_ISSUER` explicitly allows one issuer; absent configuration disables OIDC.
The backend trusts the bridge server to verify OIDC claims; it does not accept
raw provider tokens or run an OIDC authorization flow itself.

The Next.js server calls session APIs with a short-lived signed JWT whose `sub`
is the backend user id and whose `exp` is mandatory. Configure issuer and audience
on both servers. API keys remain supported: `AUTH_API_KEY_OWNERS` maps their stored
normalized hash to an active user id. Unmapped keys and unknown/disabled JWT users
are denied. Existing key lists and peppering remain unchanged.

The shared session service checks ownership before every read or mutation,
including exports, review decisions and the OpenAI facade. Foreign sessions return
404 without revealing existence. Disabled users are checked on each API request.
Authentication-disabled development uses the bootstrap owner only; production must
enable authentication. No caller may omit an owner when auth is enabled.

Administrators use `user create`, `user set-password`, and `user disable` with
passwords read through a hidden terminal prompt. There is no public signup or
reset route. Existing sessions can be recovered by assigning bootstrap credentials
through CLI and mapping service keys explicitly to its id.

## Consequences

Deploy migration before enabling the updated service; provision users and map keys.
This deliberately breaks access for historical JWT subjects not in the user table
and unmapped API keys. The frontend server is a trusted authentication boundary.
The default login limit is five bridge calls per minute per connecting server IP,
shared across both bridge routes; it can be tuned for multiple users. Redis is
preferred; the existing in-memory fallback is per process and resets at restart.
No frontend implementation is included in this lot.
