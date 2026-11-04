#!/usr/bin/env python3
"""CHG-102 end-to-end check on a running stack (lab), phase by phase. Read-only unless --prove-archive-read.

    python scripts/test-chg102-e2e.py --boundary 2026-11-04T08:00:00Z --jar-sha <sha256 of the deployed jar> \
        --zone +04:00 [--loop FIC10302] [--prove-archive-read]

Checks (PASS / FAIL / SKIP per line, exit 1 on any FAIL):
  M   migrations cpm-18 .. cpm-20b present (cpm-17 is plant-only: the lab tables are hypertables)
  F   Flink: every CPLM job RUNNING exactly once (incl. the On-Demand Evaluation job); rows written since the
      swap carry the deployed jar's sha256
  P3  tiered reads: /gates?projection=summary and /kpis answer, not degraded
  P6  KPI history: /fleet/kpis/trend?days=90 has points and plantDay = --zone
  P5a boundary evidence for --boundary: BOUNDARY manifests for 12h (and 24h when the boundary is local 00:00) for every
      loop with a LIVE verdict at that window end
  P5b the archive holds one set per (loop, kind) of that boundary, none missing; the archive API lists it; with
      --prove-archive-read one set's live rows are deleted and the same bytes (sha256) are served from the archive
  P5c EVALUATE of --loop's 12h window ending at --boundary: FINISHED, its own verdict with ?analysisRun, cached on repeat,
      the LIVE rows untouched; evidence identical to the live boundary set is reported
  P8  backup-iotdb.sh --list answers
Credentials: LAB_SUPERADMIN_* and POSTGRES / IOTDB values from infra/docker/.env. Postgres via `docker exec ams-postgres`.
"""
import argparse, datetime as dt, json, os, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GW = "http://127.0.0.1:8081"
RESULTS = []


def env():
    vals = {}
    for line in open(os.path.join(ROOT, "infra", "docker", ".env"), encoding="utf-8"):
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.rstrip("\n").split("=", 1)
            vals[k.strip()] = v.split("   #")[0].strip()
    return vals


def report(code, ok, text):
    tag = "PASS" if ok is True else ("SKIP" if ok is None else "FAIL")
    RESULTS.append((code, tag, text))
    print(f"{tag:4}  {code:4} {text}", flush=True)


def sql(q):
    out = subprocess.run(["docker", "exec", "ams-postgres", "psql", "-U", "ams_user", "-d", "traverse_cplm", "-Atc", q],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:300])
    return out.stdout.strip()


class Api:
    def __init__(self, user, password):
        st, body, _ = self.call("POST", "/api/auth/login", {"username": user, "password": password}, auth=False)
        if st != 200:
            raise SystemExit(f"login failed: {st}")
        self.token = body["token"]

    def call(self, method, path, body=None, auth=True, raw=False):
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = "Bearer " + self.token
        req = urllib.request.Request(GW + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
                return r.status, (data if raw else json.loads(data or b"null")), dict(r.headers)
        except urllib.error.HTTPError as e:
            data = e.read()
            try:
                return e.code, json.loads(data), dict(e.headers)
            except Exception:
                return e.code, data[:300], dict(e.headers)


def check_migrations():
    t = sql("select to_regclass('analytics.cplm_kpi_daily') is not null, to_regclass('analytics.evidence_archive_run') is not null,"
            " to_regclass('analytics.evidence_archive_kept') is not null,"
            " exists (select 1 from pg_constraint where conname = 'analysis_run_purpose_check' and pg_get_constraintdef(oid) like '%EVALUATE%')")
    flags = t.split("|")
    names = ["cpm-18 kpi_daily", "cpm-19 archive", "cpm-20b kept", "cpm-20 EVALUATE"]
    missing = [n for n, f in zip(names, flags) if f != "t"]
    report("M", not missing, "migrations present" if not missing else f"missing: {', '.join(missing)}")


EXPECTED_JOBS = ["CPLM Short Feature Engine", "CPLM Long Diagnostics Engine", "CPLM Gate Fusion Engine", "CPLM Condition Engine",
                 "CPLM Instrument Context Engine", "CPLM Response Engine", "CPLM On-Demand Evaluation"]


def check_flink(jar_sha, since):
    jobs = json.load(urllib.request.urlopen("http://127.0.0.1:8082/jobs/overview", timeout=30))["jobs"]
    running = [j["name"] for j in jobs if j["state"] == "RUNNING"]
    dup = sorted({n for n in running if running.count(n) > 1})
    absent = [e for e in EXPECTED_JOBS if not any(e in n for n in running)]
    report("F", not dup and not absent, f"{len(running)} jobs RUNNING" + (f"; duplicates {dup}" if dup else "") +
           (f"; missing {absent}" if absent else ""))
    if not jar_sha:
        report("F", None, "jar check skipped (no --jar-sha)")
        return
    for table in ("cplm_long_feature_results", "cplm_gate_results"):
        got = sql(f"select coalesce(string_agg(distinct coalesce(jar_sha256, 'null'), ','), 'no rows') from analytics.{table}"
                  f" where purpose = 'LIVE' and created_at > '{since}'")
        report("F", got == jar_sha, f"{table} rows since the swap carry jar {got[:16]} (expected {jar_sha[:16]})")


def check_tiered(api, loop):
    st, body, _ = api.call("GET", f"/api/v1/cpm/loops/{loop}/gates?windowKind=12h&projection=summary&limit=5")
    report("P3", st == 200 and not body.get("degraded"), f"gates summary {st}, {body.get('count') if isinstance(body, dict) else '?'} rows, degraded={body.get('degraded') if isinstance(body, dict) else '?'}")
    st, body, _ = api.call("GET", f"/api/v1/cpm/loops/{loop}/kpis?resolution=12h&limit=5")
    report("P3", st == 200 and not (isinstance(body, dict) and body.get("degraded")), f"kpis 12h {st}")


def check_kpi_history(api, zone):
    st, body, _ = api.call("GET", "/api/v1/cpm/fleet/kpis/trend?days=90")
    pts = body.get("points", []) if isinstance(body, dict) else []
    pz = (body.get("plantDay") or {}).get("zone") if isinstance(body, dict) else None
    report("P6", st == 200 and len(pts) > 0, f"KPI trend 90 d: {st}, {len(pts)} point(s)")
    # a fixed offset is reported as "UTC+04:00" (PlantClock.Describe); --zone may be given either way
    report("P6", (pz in (zone, "UTC" + zone)) if zone else None, f"plantDay zone {pz} (expected {zone})")


def check_boundary(boundary_ms, zone_kinds):
    live = int(sql(f"select count(distinct loop_id) from analytics.cplm_gate_results where purpose = 'LIVE' and window_kind = '12h'"
                   f" and window_end = to_timestamp({boundary_ms} / 1000.0)") or 0)
    for kind in zone_kinds:
        # a loop is covered when its boundary evidence is live OR already archived (the live rows age out after 6 h, and
        # --prove-archive-read deletes one set's live rows on purpose)
        n = int(sql(f"select count(*) from (select provenance->>'loop_id' from analytics.evidence_manifest where provenance->>'emission_reason' = 'BOUNDARY'"
                    f" and provenance->>'boundary_kind' = '{kind}' and (provenance->>'window_end_ms')::bigint = {boundary_ms}"
                    f" union select loop_id from analytics.evidence_archive_run where window_kind = '{kind}'"
                    f" and window_end = to_timestamp({boundary_ms} / 1000.0)) s") or 0)
        a = int(sql(f"select count(distinct loop_id) from analytics.evidence_archive_run where window_kind = '{kind}'"
                    f" and window_end = to_timestamp({boundary_ms} / 1000.0)") or 0)
        report("P5a", n > 0 and (kind != "12h" or n >= live), f"{kind} BOUNDARY evidence (live or archived): {n} loop(s) (LIVE 12h verdicts at the boundary: {live})")
        report("P5b", a > 0 and a >= n, f"{kind} archived sets: {a} loop(s)")
    miss = sql(f"select coalesce(sum(missing_count), 0)||'/'||coalesce(sum(artifact_count), 0) from analytics.evidence_archive_run"
               f" where window_end = to_timestamp({boundary_ms} / 1000.0)")
    report("P5b", miss.split("/")[0] == "0" and miss.split("/")[1] != "0", f"archive missing/artifacts at the boundary: {miss}")


def check_archive_api(api, loop, boundary_ms, prove):
    st, body, _ = api.call("GET", f"/api/v1/cpm/loops/{loop}/evidence/archive")
    sets = body.get("sets", body.get("items", [])) if isinstance(body, dict) else (body if isinstance(body, list) else [])
    report("P5b", st == 200 and len(sets) > 0, f"archive API for {loop}: {st}, {len(sets)} set(s)")
    row = sql(f"select array_to_string(method_run_ids, ','), array_to_string(evidence_ids, ',') from analytics.evidence_archive_run"
              f" where loop_id = '{loop}' and window_kind = '12h' and window_end = to_timestamp({boundary_ms} / 1000.0) limit 1")
    if not row:
        report("P5b", False, f"no archived 12h set for {loop} at the boundary")
        return
    runs, evs = row.split("|")
    run = runs.split(",")[0]
    st, live, h1 = api.call("GET", f"/api/v1/cpm/method-runs/{run}/evidence/bundle", raw=True)
    if not prove:
        report("P5b", None, "archive read-back skipped (--prove-archive-read deletes one set's live rows)")
        return
    import hashlib
    sha_live = hashlib.sha256(live).hexdigest() if st == 200 else None
    ids = ",".join(f"'{e}'" for e in evs.split(",") if e)
    sql(f"delete from analytics.evidence_manifest where evidence_id in ({ids})")
    st2, arch, h2 = api.call("GET", f"/api/v1/cpm/method-runs/{run}/evidence/bundle", raw=True)
    sha_arch = hashlib.sha256(arch).hexdigest() if st2 == 200 else None
    st3, man, _ = api.call("GET", f"/api/v1/cpm/method-runs/{run}/evidence")
    src = man.get("source") if isinstance(man, dict) else None
    report("P5b", sha_live is not None and sha_live == sha_arch and src == "ARCHIVE",
           f"live rows deleted -> bundle from {src}: sha {str(sha_arch)[:12]} vs live {str(sha_live)[:12]}, ETag {h1.get('ETag')} / {h2.get('ETag')}")


def check_evaluate(api, loop, boundary_ms):
    before = sql(f"select count(*) from analytics.cplm_gate_results where loop_id = '{loop}' and purpose = 'LIVE'")
    t0 = time.time()
    st, run, _ = api.call("POST", "/api/v1/cpm/analysis-runs", {"purpose": "EVALUATE", "loopId": loop, "windowKind": "12h", "endMs": boundary_ms})
    if st not in (200, 202):
        report("P5c", False, f"POST EVALUATE {st} {run}")
        return
    rid, r = run["analysisRunId"], run
    while time.time() - t0 < 180:
        st, r, _ = api.call("GET", f"/api/v1/cpm/analysis-runs/{rid}")
        if r.get("state") == "FAILED" or (r.get("state") == "FINISHED" and (r.get("gateResults") or 0) > 0):
            break
        time.sleep(1)
    secs = time.time() - t0
    report("P5c", r.get("state") == "FINISHED", f"EVALUATE {loop} 12h -> {r.get('state')} in {secs:.1f} s (job {r.get('elapsedMs')} ms,"
           f" {r.get('samples')} samples, {r.get('artifacts')} artifacts){' error ' + str(r.get('error')) if r.get('error') else ''}")
    verdict = r.get("verdictMethodRunId")
    if verdict:
        st, mr, _ = api.call("GET", f"/api/v1/cpm/method-runs/{verdict}?analysisRun={rid}")
        report("P5c", st == 200 and mr.get("identity", {}).get("purpose") == "EVALUATE", f"?analysisRun opens the evaluation's own verdict ({mr.get('identity', {}).get('purpose') if st == 200 else st})")
        st, mr, _ = api.call("GET", f"/api/v1/cpm/method-runs/{verdict}")
        report("P5c", st == 200, f"without it: {mr.get('identity', {}).get('purpose') if st == 200 else st} row (LIVE when the live engine holds the window)")
    time.sleep(10)
    st, r2, _ = api.call("GET", f"/api/v1/cpm/analysis-runs/{rid}")
    report("P5c", True, f"evidence: {r2.get('evidenceComplete')} stored beside, {r2.get('evidenceIdentical')} byte-identical to the live run (info)")
    st, again, _ = api.call("POST", "/api/v1/cpm/analysis-runs", {"purpose": "EVALUATE", "loopId": loop, "windowKind": "12h", "endMs": boundary_ms})
    report("P5c", st == 200 and again.get("analysisRunId") == rid and again.get("cached"), f"repeat request: {st}, same run, cached={again.get('cached')}")
    after = sql(f"select count(*) from analytics.cplm_gate_results where loop_id = '{loop}' and purpose = 'LIVE'")
    evals = sql(f"select count(*) from analytics.cplm_gate_results where loop_id = '{loop}' and purpose = 'EVALUATE' and analysis_run_id = '{rid}'")
    report("P5c", evals == "1" and int(after) >= int(before), f"isolation: 1 EVALUATE row ({evals}); LIVE rows {before} -> {after} (never fewer)")


def check_backup():
    e = dict(os.environ, IOTDB_PASSWORD=env().get("IOTDB_PASSWORD", ""), MSYS_NO_PATHCONV="1")
    import shutil   # on Windows a bare "bash" can resolve to WSL's launcher, not Git Bash: use the PATH's own
    out = subprocess.run([shutil.which("bash") or "bash", os.path.join(ROOT, "migration", "backup-iotdb.sh"), "--list"],
                         capture_output=True, text=True, env=e)
    lines = [l for l in out.stdout.splitlines() if "device(s)" in l]
    report("P8", out.returncode == 0 and len(lines) > 0, f"backup-iotdb.sh --list: {len(lines)} database(s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--boundary", required=True, help="UTC ISO time of a plant-day boundary already archived (e.g. 2026-11-04T08:00:00Z)")
    ap.add_argument("--zone", default=None, help="expected plantDay zone label, e.g. +04:00 or Asia/Tehran")
    ap.add_argument("--jar-sha", default=None)
    ap.add_argument("--since", default=None, help="swap time (UTC ISO) for the jar check; default = 1 h before --boundary")
    ap.add_argument("--loop", default="FIC10302")
    ap.add_argument("--kinds", default="12h", help="boundary kinds to expect at --boundary (12h; 12h,24h at local 00:00)")
    ap.add_argument("--prove-archive-read", action="store_true")
    a = ap.parse_args()
    b = dt.datetime.fromisoformat(a.boundary.replace("Z", "+00:00"))
    bms = int(b.timestamp() * 1000)
    since = a.since or (b - dt.timedelta(hours=1)).isoformat()
    e = env()
    api = Api(e["LAB_SUPERADMIN_USERNAME"], e["LAB_SUPERADMIN_PASSWORD"])
    for name, fn in [("M", check_migrations), ("F", lambda: check_flink(a.jar_sha, since)), ("P3", lambda: check_tiered(api, a.loop)),
                     ("P6", lambda: check_kpi_history(api, a.zone)), ("P5a", lambda: check_boundary(bms, a.kinds.split(","))),
                     ("P5b", lambda: check_archive_api(api, a.loop, bms, a.prove_archive_read)),
                     ("P5c", lambda: check_evaluate(api, a.loop, bms)), ("P8", check_backup)]:
        try:
            fn()
        except Exception as ex:
            report(name, False, f"check crashed: {ex}")
    fails = [r for r in RESULTS if r[1] == "FAIL"]
    print(f"\n{len(RESULTS) - len(fails)} of {len(RESULTS)} checks not failed; {len(fails)} FAIL")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
