#!/usr/bin/env python3
"""Set loop_ingest.mode_value_map on every MQTT_LOOP_SAMPLES data source.

Read-modify-write: every other key in profile_config (the whole mqtt block,
including ca_cert_pem) is carried across untouched. PUT replaces profile_config
wholesale, so the full object must be sent -- that is the entire point of this
script and the reason the change cannot be hand-typed.

  python3 set-mode-map.py                 # dry run: show what would change
  python3 set-mode-map.py --apply         # write it

Env: GW (default http://localhost:8081), ADMIN_USER (admin), ADMIN_PW (required).
"""
import json, os, sys, urllib.request, urllib.error

GW      = os.environ.get("GW", "http://localhost:8081").rstrip("/")
USER    = os.environ.get("ADMIN_USER", "admin")
PW      = os.environ.get("ADMIN_PW", "")
APPLY   = "--apply" in sys.argv
MODEMAP = {"1": "AUT", "2": "MAN", "3": "CAS", "4": "IMAN"}


def call(method, path, body=None, token=None):
    req = urllib.request.Request(GW + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]


if not PW:
    sys.exit("set ADMIN_PW first:  export ADMIN_PW='...'")

st, body = call("POST", "/api/auth/login", {"username": USER, "password": PW})
if st != 200:
    sys.exit(f"login failed: {st} {body}")
token = next((body[k] for k in ("accessToken", "token", "access_token")
              if isinstance(body, dict) and body.get(k)), None)
if not token:
    sys.exit("login ok but no token field: " + str(body)[:200])
print(f"token ok (len {len(token)})")

st, body = call("GET", "/api/ingestion/data-sources", token=token)
if st != 200:
    sys.exit(f"list failed: {st} {body}")
rows = body if isinstance(body, list) else (body.get("sources") or body.get("items") or [])
loop_sources = [r for r in rows if r.get("profileType") == "MQTT_LOOP_SAMPLES"]
print(f"{len(rows)} data source(s), {len(loop_sources)} MQTT_LOOP_SAMPLES\n")
if not loop_sources:
    sys.exit("nothing to do")

for r in loop_sources:
    cid, name = r["configId"], r.get("name")
    pc = r.get("profileConfig") or {}
    li = dict(pc.get("loop_ingest") or {})
    print(f"--- {name}  [{cid}]  active={r.get('isActive')}")
    print(f"    profile_config keys : {sorted(pc.keys())}")
    print(f"    loop_ingest keys    : {sorted(li.keys()) or '(no loop_ingest block at all)'}")
    print(f"    mode_value_map NOW  : {li.get('mode_value_map', '(absent)')}")
    print(f"    mode_value_map NEW  : {MODEMAP}")
    if li.get("mode_value_map") == MODEMAP:
        print("    -> already correct, skipping\n")
        continue
    if not APPLY:
        print("    -> DRY RUN, nothing sent\n")
        continue
    li["mode_value_map"] = MODEMAP
    new_pc = dict(pc)
    new_pc["loop_ingest"] = li          # every other key preserved verbatim
    st, resp = call("PUT", f"/api/ingestion/data-sources/{cid}",
                    {"profileConfig": new_pc}, token=token)
    print(f"    -> PUT {st}" + ("" if st == 200 else f"  {resp}") + "\n")

print("done." if APPLY else "dry run complete -- re-run with --apply to write.")
