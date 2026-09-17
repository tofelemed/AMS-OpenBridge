#!/usr/bin/env python3
"""Declare loop_ingest.quality_protocol on every MQTT_LOOP_SAMPLES data source (release v2.5, CHG-026 / R04).

Since v2.5 the ingestion service decodes quality per PROTOCOL (OPC_DA word, OPC_UA status code,
SPARKPLUG code, STRING_ENUM GOOD|UNCERTAIN|BAD, NONE) and never defaults an unknown value to GOOD.
An undeclared protocol resolves to STRING_ENUM - what the OT gateway publishes today - but the
declaration must be explicit on the plant so a change of gateway is a visible configuration change,
not a silent reinterpretation. Read-modify-write like set-mode-map.py: every other key of
profile_config (the whole mqtt block, ca_cert_pem, param_roles, mode_value_map) is carried across
untouched, because PUT replaces profile_config wholesale.

  python3 set-quality-protocol.py                          # dry run: show what would change
  python3 set-quality-protocol.py --apply                  # write STRING_ENUM
  python3 set-quality-protocol.py --protocol OPC_DA --apply

Env: GW (default http://localhost:8081), ADMIN_USER (admin), ADMIN_PW (required).
"""
import json, os, sys, urllib.request, urllib.error

GW    = os.environ.get("GW", "http://localhost:8081").rstrip("/")
USER  = os.environ.get("ADMIN_USER", "admin")
PW    = os.environ.get("ADMIN_PW", "")
APPLY = "--apply" in sys.argv
PROTOCOLS = ("OPC_DA", "OPC_UA", "SPARKPLUG", "STRING_ENUM", "NONE")
PROTOCOL = "STRING_ENUM"
if "--protocol" in sys.argv:
    PROTOCOL = sys.argv[sys.argv.index("--protocol") + 1].upper()
if PROTOCOL not in PROTOCOLS:
    sys.exit(f"--protocol must be one of {', '.join(PROTOCOLS)}")


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
print(f"{len(rows)} data source(s), {len(loop_sources)} MQTT_LOOP_SAMPLES; target quality_protocol = {PROTOCOL}\n")
if not loop_sources:
    sys.exit("nothing to do")

changed = 0
for r in loop_sources:
    cid, name = r["configId"], r.get("name")
    pc = r.get("profileConfig") or {}
    li = dict(pc.get("loop_ingest") or {})
    now = li.get("quality_protocol")
    print(f"--- {name}  [{cid}]  active={r.get('isActive')}")
    print(f"    quality_protocol NOW : {now if now else '(absent -> resolves to STRING_ENUM)'}")
    print(f"    quality_protocol NEW : {PROTOCOL}")
    if now == PROTOCOL:
        print("    -> already declared, skipping\n")
        continue
    if not APPLY:
        print("    -> DRY RUN, nothing sent\n")
        continue
    li["quality_protocol"] = PROTOCOL
    new_pc = dict(pc)
    new_pc["loop_ingest"] = li          # every other key preserved verbatim
    st, resp = call("PUT", f"/api/ingestion/data-sources/{cid}", {"profileConfig": new_pc}, token=token)
    print(f"    -> PUT {st}" + ("" if st == 200 else f"  {resp}") + "\n")
    if st == 200:
        changed += 1

print(f"done: {changed} source(s) updated." if APPLY else "dry run complete -- re-run with --apply to write.")
