#!/usr/bin/env python3
"""Republish every registered loop's evidence/engineering broadcast (CHG-088).

After a cplm-api release that changes what the cplm.loop.engineering record carries
(CHG-088: vpApplicability), the Flink engine only sees the new field once each loop is
republished. This calls POST /api/v1/cpm/loops/bulk-republish-evidence in chunks:
20 per call, because the endpoint first upserts the loops' signal assets in asset-model
and 100 per call timed out there on a loaded host (lab 2026-10-10). Idempotent - safe
to run again; a failed chunk is reported and can simply be re-run.

  python3 republish-all-loops.py              # dry run: count the loops, call nothing
  python3 republish-all-loops.py --apply      # republish them

Env: GW (default http://localhost:8081), ADMIN_USER (admin), ADMIN_PW (required).
The user needs cpm.manage (Admin or SuperAdmin).
"""
import json, os, sys, urllib.request, urllib.error

GW      = os.environ.get("GW", "http://localhost:8081").rstrip("/")
USER    = os.environ.get("ADMIN_USER", "admin")
PW      = os.environ.get("ADMIN_PW", "")
APPLY   = "--apply" in sys.argv
CHUNK   = 20


def call(method, path, body=None, token=None, timeout=120):
    req = urllib.request.Request(GW + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]
    except Exception as e:  # timeout / connection reset: report, keep going
        return 0, str(e)[:200]


if not PW:
    sys.exit("set ADMIN_PW first:  export ADMIN_PW='...'")

st, body = call("POST", "/api/auth/login", {"username": USER, "password": PW})
if st != 200:
    sys.exit(f"login failed: {st} {body}")
token = next((body[k] for k in ("accessToken", "token", "access_token")
              if isinstance(body, dict) and body.get(k)), None)
if not token:
    sys.exit("login ok but no token field: " + str(body)[:200])

st, body = call("GET", "/api/v1/cpm/loops", token=token)
if st != 200:
    sys.exit(f"GET /api/v1/cpm/loops failed: {st} {body}")
loops = body.get("loops", body) if isinstance(body, dict) else body
ids = [l["loopId"] for l in loops if isinstance(l, dict) and l.get("loopId")]
print(f"registered loops: {len(ids)}")
if not APPLY:
    print("dry run - nothing republished; run again with --apply")
    sys.exit(0)

done, failed = 0, []
for i in range(0, len(ids), CHUNK):
    chunk = ids[i:i + CHUNK]
    st, res = call("POST", "/api/v1/cpm/loops/bulk-republish-evidence", {"loopIds": chunk}, token)
    ok = st == 200 and isinstance(res, dict)
    n = res.get("republished", 0) if ok else 0
    done += n
    bad = [it["loopId"] for it in (res.get("items") or []) if not it.get("ok")] if ok else chunk
    failed += bad
    print(f"chunk {i // CHUNK + 1}: HTTP {st}, republished {n}/{len(chunk)}" + (f", failed {bad}" if bad else ""))

print(f"republished {done}/{len(ids)} loops" + (f"; FAILED {len(failed)}: re-run --apply (idempotent)" if failed else " - OK"))
sys.exit(1 if failed else 0)
