#!/usr/bin/env python3
"""
CPLM extraction safety net (extraction plan Phase 0.2/0.3).

Captures canonical JSON from every CPLM read endpoint into a golden directory,
then diffs any later run (same base URL or a different one) against that golden.
Byte-identical golden output is the exit gate for extraction phases 1, 3 and 6.

Also runs the contract assertions the repo's unit-test projects can't (they have
no HTTP host; script-driven E2E is the established pattern here):
  - gate matrix shape: 17 gates incl. G2r, metrics{}, narrative{}, version stamps
  - permission enforcement: no token -> 401 on reads, cpm.manage guarded on writes

Usage:
  python scripts/cplm-response-diff.py capture [--base http://localhost:3000]
  python scripts/cplm-response-diff.py diff    [--base http://localhost:3000]
  python scripts/cplm-response-diff.py assert  [--base http://localhost:3000]

Default base is the nginx frontend (:3000) â€” the path a browser actually takes,
so the proxy route counts as part of the contract. Use --base http://localhost:8081
to hit cplm-api directly and isolate the service from the proxy. CPLM no longer
lives on :8000 (moved out of ams-api by the extraction, Phase 6).

Golden dir: tests/cplm-golden/ (committed).
"""
import argparse
import json
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "tests" / "cplm-golden"
AUTH_URL = "http://localhost:8081/api/auth/login"
ADMIN = {"username": "admin", "password": "ChangeMe123!"}

# Keys whose values change run-to-run; masked before writing/diffing.
# Kept per-endpoint so a mask can't hide a real regression elsewhere.
VOLATILE = {
    "pipeline-status": {"unexpectedJobs"},
    "pipeline-metrics": {"collectedAt", "uptimeSec", "startTime", "jid",
                         "lastCompletedAgeSec", "lastDurationMs", "lastSizeBytes",
                         "completed", "failed"},
}


def http(url: str, token: str | None = None, method: str = "GET", body: bytes | None = None):
    req = urllib.request.Request(url, data=body, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def login() -> str:
    status, body = http(AUTH_URL, method="POST", body=json.dumps(ADMIN).encode())
    if status != 200:
        sys.exit(f"FATAL: admin login failed ({status})")
    return json.loads(body)["token"]


def mask(obj, masked_keys):
    if isinstance(obj, dict):
        return {k: ("<masked>" if k in masked_keys else mask(v, masked_keys))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [mask(x, masked_keys) for x in obj]
    return obj


def canonical(obj, name: str) -> str:
    masked = mask(obj, VOLATILE.get(name, set()))
    # Sort the pipeline job arrays: Flink's overview order is not deterministic.
    if name in ("pipeline-status", "pipeline-metrics") and isinstance(masked, dict):
        if isinstance(masked.get("jobs"), list):
            masked["jobs"] = sorted(masked["jobs"], key=lambda j: str(j.get("name", "")))
    return json.dumps(masked, sort_keys=True, indent=1, ensure_ascii=False)


def endpoints(base: str, token: str):
    """Yield (name, url). Per-loop endpoints expand over the real registry."""
    fixed = [
        ("loops", "/api/v1/cpm/loops"),
        ("registry-contract", "/api/v1/cpm/registry-contract"),
        ("events", "/api/v1/cpm/events?openOnly=false&limit=50"),
        ("resolutions", "/api/v1/cpm/resolutions"),
        ("fleet-summary", "/api/v1/cpm/fleet/summary"),
        ("fleet-rankings", "/api/v1/cpm/fleet/rankings"),
        ("fleet-heatmap", "/api/v1/cpm/fleet/heatmap"),
        ("calculations", "/api/v1/cpm/calculations"),
        ("pipeline-status", "/api/v1/cpm/pipeline-status"),
        ("pipeline-metrics", "/api/v1/cpm/pipeline-metrics"),
    ]
    for name, path in fixed:
        yield name, base + path

    status, body = http(base + "/api/v1/cpm/loops", token)
    if status != 200:
        sys.exit(f"FATAL: GET /loops returned {status}; cannot enumerate per-loop endpoints")
    for loop in json.loads(body)["loops"]:
        lid = loop["loopId"]
        for name, path in [
            (f"loop-{lid}", f"/api/v1/cpm/loops/{lid}"),
            (f"readiness-{lid}", f"/api/v1/cpm/loops/{lid}/readiness"),
            (f"gates-latest-{lid}", f"/api/v1/cpm/loops/{lid}/gates/latest?windowKind=24h"),
            (f"gates-history-{lid}", f"/api/v1/cpm/loops/{lid}/gates?windowKind=24h&limit=20"),
            (f"kpis-1m-{lid}", f"/api/v1/cpm/loops/{lid}/kpis?resolution=1m&limit=20"),
            (f"kpis-24h-{lid}", f"/api/v1/cpm/loops/{lid}/kpis?resolution=24h&limit=20"),
        ]:
            yield name, base + path


def fetch_all(base: str, token: str) -> dict[str, str]:
    # Parallel: some endpoints (readiness, fleet scans) take seconds each;
    # sequential runs looked like a hang at ~5 minutes per pass.
    todo = list(endpoints(base, token))

    def one(item):
        name, url = item
        status, body = http(url, token)
        if status != 200:
            print(f"  WARN {name}: HTTP {status}")
            return name, f"HTTP {status}\n"
        return name, canonical(json.loads(body), name)

    with ThreadPoolExecutor(max_workers=8) as pool:
        return dict(pool.map(one, todo))


def cmd_capture(base: str):
    token = login()
    GOLDEN.mkdir(parents=True, exist_ok=True)
    results = fetch_all(base, token)
    for name, text in results.items():
        (GOLDEN / f"{name}.json").write_text(text, encoding="utf-8", newline="\n")
    print(f"captured {len(results)} endpoints -> {GOLDEN}")


def cmd_diff(base: str) -> int:
    token = login()
    results = fetch_all(base, token)
    failures = 0
    for name, text in results.items():
        golden_file = GOLDEN / f"{name}.json"
        if not golden_file.exists():
            print(f"  NEW  {name} (no golden)")
            failures += 1
            continue
        golden = golden_file.read_text(encoding="utf-8")
        if golden != text:
            failures += 1
            print(f"  DIFF {name}")
            g_lines, n_lines = golden.splitlines(), text.splitlines()
            shown = 0
            for i in range(max(len(g_lines), len(n_lines))):
                g = g_lines[i] if i < len(g_lines) else "<absent>"
                n = n_lines[i] if i < len(n_lines) else "<absent>"
                if g != n:
                    print(f"       line {i+1}: golden={g.strip()[:100]!r} now={n.strip()[:100]!r}")
                    shown += 1
                    if shown >= 5:
                        print("       ...")
                        break
    missing = {p.stem for p in GOLDEN.glob("*.json")} - set(results)
    for name in sorted(missing):
        print(f"  GONE {name} (golden exists, endpoint absent)")
        failures += 1
    print("DIFF CLEAN" if failures == 0 else f"{failures} endpoint(s) differ")
    return 0 if failures == 0 else 1


def cmd_assert(base: str) -> int:
    token = login()
    errors = []

    def check(cond, msg):
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            errors.append(msg)

    # -- Gate matrix contract on every registered loop with a verdict.
    _, body = http(base + "/api/v1/cpm/loops", token)
    loops = json.loads(body)["loops"]
    check(len(loops) > 0, "at least one registered loop")
    for loop in loops:
        lid = loop["loopId"]
        status, body = http(base + f"/api/v1/cpm/loops/{lid}/gates/latest?windowKind=24h", token)
        if status == 404:
            print(f"  skip {lid}: no stored verdict")
            continue
        m = json.loads(body)
        keys = [g["key"] for g in m["gates"]]
        check(len(keys) == 17 and "G2r" in keys, f"{lid}: 17 gates incl. G2r")
        check(isinstance(m.get("metrics"), dict) and len(m["metrics"]) > 0,
              f"{lid}: metrics{{}} present and non-empty")
        check(set(m.get("narrative", {}).keys()) == {"selectedFamily", "statusReason", "recommendation"},
              f"{lid}: narrative{{}} has the three fields")
        check(m["metadata"].get("calculationVersion") is not None,
              f"{lid}: calculationVersion stamped")

    # -- Permission enforcement.
    status, _ = http(base + "/api/v1/cpm/loops")  # no token
    check(status == 401, f"unauthenticated read -> 401 (got {status})")
    status, _ = http(base + "/api/v1/cpm/loops/NO_SUCH_LOOP/recompute", None, method="POST", body=b"{}")
    check(status == 401, f"unauthenticated recompute -> 401 (got {status})")
    # cpm.manage guarded write with a valid admin token but a bogus loop: must be
    # 404 (authz passed, loop missing) â€” proves the policy resolves instead of 500.
    status, _ = http(base + "/api/v1/cpm/loops/NO_SUCH_LOOP/recompute", token, method="POST", body=b"{}")
    check(status == 404, f"authorized recompute on missing loop -> 404 (got {status})")

    print("ASSERTIONS PASS" if not errors else f"{len(errors)} assertion(s) FAILED")
    return 0 if not errors else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["capture", "diff", "assert"])
    ap.add_argument("--base", default="http://localhost:3000")
    args = ap.parse_args()
    if args.mode == "capture":
        cmd_capture(args.base)
        sys.exit(0)
    sys.exit(cmd_diff(args.base) if args.mode == "diff" else cmd_assert(args.base))


if __name__ == "__main__":
    main()
