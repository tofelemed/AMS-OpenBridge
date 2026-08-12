# Session policy — dual clock (sliding idle + absolute max)

Recorded 2026-08-12. Backend enforcement lives **only** in auth-service
`POST /api/auth/refresh` against PostgreSQL; the frontend supplies the
"no API call" idle UX. The gateway does **not** track activity — it validates
signature/expiry and revocation (5s poll), nothing session-shaped.

## The three clocks

| Clock | Sliding? | Default | Enforced where |
|---|---|---|---|
| Access JWT `exp` | no | **1h** (`JWT_EXPIRES_IN`) | gateway JWT validation |
| Idle (inactivity) | yes | **30m** (`SESSION_IDLE_TIMEOUT`) — **operator: 8h** | FE clocks + BE on `/refresh` |
| Absolute session | no | **12h** (`SESSION_ABSOLUTE_TIMEOUT`) | FE clocks + BE on `/refresh` |

No Redis session store. No JWT denylist. Logout = DELETE the `refresh_tokens`
row. Access JWTs stay valid until `exp` — *except* that the gateway's
`credentials_changed_at` revocation (Plan 03/04) still kills them within ~5s on
deactivation/role change; that mechanism is unchanged and stronger than this
policy requires.

## Decisions

1. **Access TTL 1h** (was 15m). Safe because gateway revocation exists; quarters
   refresh traffic.
2. **Activity = authenticated REST via `apiFetch` only.** Mouse/keyboard and
   SignalR/MQTT push do NOT extend the idle clock. Instead, the **operator role
   gets a longer idle window** (8h default) because operators watch the live
   console without generating REST calls. Override per role with
   `SESSION_IDLE_TIMEOUT_<ROLE>` (role name upper-cased, non-alphanumerics → `_`).

## Backend (auth-service)

- `refresh_tokens.last_used_at` — idle clock: set at login, bumped on every
  successful rotation. `refresh_tokens.session_started_at` — absolute clock:
  set at login, never touched. Migration: `database/scripts/41_auth_session_clocks.sql`
  (manual apply on existing volumes, as usual).
- `/refresh` computes ages **on the DB clock** (`NOW() - COALESCE(...)`) so
  node/postgres skew cannot affect policy. Absolute is checked before idle.
- Violation ⇒ `DELETE` row ⇒ `401` with `code: SESSION_MAX_DURATION` or
  `code: SESSION_IDLE_TIMEOUT` in the JSON body.
- Login/refresh responses carry `sessionPolicy: { idleMs, absoluteMs }` for the
  caller's role — the frontend mirrors this instead of duplicating env values.
- Server idle = "time since last successful `/refresh`", **not** time since the
  last API call. Ordinary authenticated traffic never touches the DB row. The
  frontend's proactive refresh (~60s before access expiry) is what keeps an
  active session's server clock moving.

## Frontend (src/frontend-ob)

| Piece | File |
|---|---|
| Clocks + policy (localStorage, reload-safe) | `src/auth/sessionClock.ts` |
| Activity mark on every authed REST call | `src/api/apiFetch.ts` |
| Watchdog (60s: absolute → idle → `endSession`) | `App.tsx` |
| Proactive refresh (exp − 60s, refuses when clocks expired) | `store/authStore.ts` |
| Reactive 401 code → reason mapping | `api/authApi.ts` (`sessionEndCodeOf`) |
| Reason dialog (shown over /login too) | `components/shared/SessionTimeoutDialog.tsx` |

`VITE_SESSION_IDLE_MS` / `VITE_SESSION_ABSOLUTE_MS` exist only as pre-login
fallbacks; the server's `sessionPolicy` is authoritative once received.

## Verified (lab drill, 40s idle / 120s absolute)

login returns the role policy → rotation bumps `last_used_at` only → 50s of
silence ⇒ `401 SESSION_IDLE_TIMEOUT` + row deleted → an actively-refreshing
session still dies at the absolute cap with `401 SESSION_MAX_DURATION`.
