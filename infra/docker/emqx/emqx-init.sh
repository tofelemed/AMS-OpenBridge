#!/bin/sh
# One-shot EMQX provisioning (Plan 04 item 6): create/refresh the Sparkplug edge
# node's ams_edge credential in the built-in-database authenticator, so the edge
# node authenticates against something real (it used to "authenticate" against an
# anonymous broker). Idempotent: POST then fall back to PUT on 409.
set -eu

EMQX_API="${EMQX_API:-http://emqx:18083/api/v5}"
AUTHENTICATOR="password_based%3Abuilt_in_database"

echo "[emqx-init] waiting for EMQX API at ${EMQX_API} ..."
i=0
until curl -sf "${EMQX_API}/status" >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -gt 60 ] && { echo "[emqx-init] EMQX API never came up"; exit 1; }
  sleep 2
done

echo "[emqx-init] logging in to the management API"
TOKEN=$(curl -sf -X POST "${EMQX_API}/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${EMQX_DASHBOARD_USER}\",\"password\":\"${EMQX_DASHBOARD_PASSWORD}\"}" \
  | sed -n 's/.*"token" *: *"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "[emqx-init] dashboard login failed"; exit 1; }

echo "[emqx-init] ensuring edge user '${EMQX_EDGE_USER}' exists in built_in_database"
CODE=$(curl -s -o /tmp/resp -w '%{http_code}' -X POST \
  "${EMQX_API}/authentication/${AUTHENTICATOR}/users" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"${EMQX_EDGE_USER}\",\"password\":\"${EMQX_EDGE_PASSWORD}\"}")

if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  echo "[emqx-init] edge user created"
elif [ "$CODE" = "409" ]; then
  echo "[emqx-init] edge user exists — refreshing password"
  curl -sf -X PUT \
    "${EMQX_API}/authentication/${AUTHENTICATOR}/users/${EMQX_EDGE_USER}" \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    -d "{\"password\":\"${EMQX_EDGE_PASSWORD}\"}" >/dev/null
  echo "[emqx-init] edge user password refreshed"
else
  echo "[emqx-init] unexpected response ${CODE}: $(cat /tmp/resp)"
  exit 1
fi

echo "[emqx-init] done"
