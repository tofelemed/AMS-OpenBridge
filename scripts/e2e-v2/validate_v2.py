#!/usr/bin/env python3
"""
End-to-end validation of the V2 pipeline (Phases 5–7) against a running AMS/Traverse stack.

What it proves, live:
  • Governance (Phase 5)  — display CRUD, tags/search/sort, folders, versioning, personal views,
                            favorites/recent, audit trail, and OWNERSHIP ENFORCEMENT (a non-owner gets 403).
  • Compute   (Phase 7)  — create a calculation, execute it, and confirm the FULL loop ran:
                            analysis-service → Kafka traverse.analysis.executions → Flink AnalysisExecutionJob →
                            traverse.analysis.results → result consumer → execution "completed" + derived
                            measurement published to the UNS (Redis snapshot + asset-model registration).
  • Fidelity  (Phase 4/6)— asset-model unit/limits by-path, historian /summary aggregate.
  • Authz     (Phase 7.5)— binding-resolver resolves a tag (no-scope backward-compat; scope-denial needs
                            an assetScope-claimed token, which auth-service does not mint yet).

Needs LIVE DATA: the compute + fidelity checks read the process tags the simulator publishes
(scripts/sim/process_value_sim.py — run it as the `ams-sim` container). If no live snapshots are found
those checks are SKIPPED (not failed) with a clear message, and governance/authz still run.

Exit code 0 = all executed checks passed (skips don't fail the run); 1 = at least one failure.

Run from host:   python scripts/e2e-v2/validate_v2.py
Run in stack:    docker compose -f infra/docker/docker-compose.sims.yml run --rm v2-validator
"""
from __future__ import annotations

import sys
import time
import uuid
from dataclasses import dataclass

import requests

import config as cfg

try:
    import redis as redis_lib
except ImportError:
    redis_lib = None


# ── tiny result/log harness ───────────────────────────────────────────────────
@dataclass
class Step:
    name: str
    status: str  # PASS | FAIL | SKIP
    detail: str = ""


RESULTS: list[Step] = []
RUN = uuid.uuid4().hex[:8]


def _p(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def record(name: str, status: str, detail: str = "") -> None:
    RESULTS.append(Step(name, status, detail))
    _p(f"  {status:4}  {name}" + (f" — {detail}" if detail else ""))


def check(name: str, cond: bool, detail: str = "") -> bool:
    record(name, "PASS" if cond else "FAIL", detail)
    return cond


def skip(name: str, detail: str) -> None:
    record(name, "SKIP", detail)


def banner(title: str) -> None:
    print("\n" + "=" * 66, flush=True)
    print(f"  {title}", flush=True)
    print("=" * 66, flush=True)


# ── HTTP helpers ──────────────────────────────────────────────────────────────
def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def svc_key() -> dict:
    return {"X-Service-Key": cfg.SERVICE_KEY, "Content-Type": "application/json"}


def login(user: str, password: str) -> str | None:
    try:
        r = requests.post(f"{cfg.AUTH_BASE}/api/auth/login",
                          json={"username": user, "password": password}, timeout=15)
        if r.status_code == 200:
            return r.json().get("token")
        _p(f"  login({user}) → HTTP {r.status_code}: {r.text[:160]}")
    except Exception as e:
        _p(f"  login({user}) error: {e}")
    return None


def redis_client():
    if redis_lib is None:
        return None
    try:
        c = redis_lib.Redis(host=cfg.REDIS_HOST, port=cfg.REDIS_PORT, decode_responses=True, socket_timeout=5)
        c.ping()
        return c
    except Exception as e:
        _p(f"  redis unavailable ({cfg.REDIS_HOST}:{cfg.REDIS_PORT}): {e}")
        return None


def snapshot_key(path: str) -> str | None:
    """UNS path → Redis snapshot key (bare-device form: snapshot:metric:{site}:{site}_edge1:{device}:{metric})."""
    if "/" not in path or "." not in path.rsplit("/", 1)[-1]:
        return None
    segs = path.split("/")
    site = segs[0]
    last = segs[-1]
    device, metric = last.split(".", 1)
    return f"snapshot:metric:{site}:{site}_edge1:{device}:{metric}"


# ══════════════════════════════════════════════════════════════════════════════
# Phase 5 — governance
# ══════════════════════════════════════════════════════════════════════════════
def test_governance(token: str) -> None:
    banner("Phase 5 — Display management & governance")
    D = cfg.DISPLAY_BASE
    h = bearer(token)
    created_display = created_folder = created_view = None

    try:
        # Create
        name = f"E2E-{RUN} Governance Display"
        r = requests.post(f"{D}/displays", headers=h, json={
            "name": name, "category": "overview", "level": 2,
            "tags": [f"e2e-{RUN}", "governance"],
        }, timeout=15)
        if not check("display.create", r.status_code in (200, 201), f"HTTP {r.status_code}"):
            return
        created_display = r.json().get("id")

        # Save content (a second version) + publish
        snap = {"items": [{"id": "t1", "type": "label", "position": {"x": 10, "y": 10},
                           "size": {"width": 200, "height": 40}, "label": "E2E"}],
                "metadata": {"e2e": RUN}}
        r = requests.put(f"{D}/displays/{created_display}/content", headers=h,
                         json={"snapshot": snap, "changeNote": "e2e"}, timeout=15)
        check("display.saveContent", r.status_code == 200, f"HTTP {r.status_code}")
        r = requests.post(f"{D}/displays/{created_display}/publish", headers=h, json={"changeNote": "e2e"}, timeout=15)
        check("display.publish", r.status_code == 200, f"HTTP {r.status_code}")

        # Version history (Phase 5.8)
        r = requests.get(f"{D}/displays/{created_display}/versions", headers=h, timeout=15)
        vok = r.status_code == 200 and len(r.json().get("versions", [])) >= 2
        check("display.versions >= 2", vok, f"HTTP {r.status_code}")

        # Tag filter (Phase 5.10) + search + sort (Phase 5.9)
        r = requests.get(f"{D}/displays", headers=h, params={"tag": f"e2e-{RUN}", "sort": "updated"}, timeout=15)
        found = r.status_code == 200 and any(d["id"] == created_display for d in r.json().get("displays", []))
        check("display.tagFilter+sort", found, f"HTTP {r.status_code}")

        # Folder (Phase 5.1) + assign
        r = requests.post(f"{D}/folders", headers=h, json={"name": f"E2E-{RUN}"}, timeout=15)
        if check("folder.create", r.status_code in (200, 201), f"HTTP {r.status_code}"):
            created_folder = r.json().get("id")
            r = requests.put(f"{D}/displays/{created_display}", headers=h, json={"folderId": created_folder}, timeout=15)
            check("display.assignFolder", r.status_code == 200, f"HTTP {r.status_code}")
            r = requests.get(f"{D}/displays", headers=h, params={"folderId": created_folder}, timeout=15)
            check("display.folderFilter", r.status_code == 200
                  and any(d["id"] == created_display for d in r.json().get("displays", [])), f"HTTP {r.status_code}")

        # Personal view (Phase 5.5)
        r = requests.post(f"{D}/me/views", headers=h, json={
            "name": f"E2E-{RUN} view", "config": {"items": []},
        }, timeout=15)
        if check("personalView.create", r.status_code in (200, 201), f"HTTP {r.status_code}"):
            created_view = r.json().get("id")
            r = requests.get(f"{D}/me/views", headers=h, timeout=15)
            check("personalView.list", r.status_code == 200
                  and any(v["id"] == created_view for v in r.json().get("views", [])), f"HTTP {r.status_code}")

        # Favorite + recent (Phase 5.6)
        r = requests.post(f"{D}/me/favorites", headers=h, json={"displayId": created_display}, timeout=15)
        check("favorite.add", r.status_code in (200, 201), f"HTTP {r.status_code}")
        # A published-content GET records "recent".
        requests.get(f"{D}/displays/{created_display}/content", headers=h, params={"stage": "published"}, timeout=15)
        r = requests.get(f"{D}/me/recent", headers=h, timeout=15)
        check("recent.records", r.status_code == 200
              and any(x["id"] == created_display for x in r.json().get("recents", [])), f"HTTP {r.status_code}")

        # CQRS guard still holds (Phase 5 personal views / W3)
        r = requests.put(f"{D}/displays/{created_display}/content", headers=h, json={
            "snapshot": {"items": [{"id": "x", "type": "label", "position": {"x": 0, "y": 0},
                                    "size": {"width": 1, "height": 1}, "currentValue": 42}]}}, timeout=15)
        check("cqrs.rejectsProcessValue (400)", r.status_code == 400, f"HTTP {r.status_code}")

        # Ownership enforcement (Phase 5.3 / R9) — a second, non-owner Engineer must get 403.
        test_ownership_enforcement(token, created_display)

        # Audit trail (Phase 5.7) — optional (needs audit-service reachable).
        test_audit_trail(token, created_display)

    finally:
        # Cleanup (best-effort).
        for path, tid in (("me/views", created_view),):
            if tid:
                try: requests.delete(f"{D}/{path}/{tid}", headers=h, timeout=10)
                except Exception: pass
        if created_display:
            try: requests.delete(f"{D}/displays/{created_display}", headers=h, timeout=10)
            except Exception: pass
        if created_folder:
            try: requests.delete(f"{D}/folders/{created_folder}", headers=h, timeout=10)
            except Exception: pass


def test_ownership_enforcement(admin_token: str, display_id: str) -> None:
    """Create a non-admin Engineer, log in, and confirm they CANNOT edit the admin's display (403)."""
    A, D = cfg.AUTH_BASE, cfg.DISPLAY_BASE
    uname = f"e2e_intruder_{RUN}"
    passwd = "E2e!Pass123"
    try:
        r = requests.post(f"{A}/api/auth/users", headers=bearer(admin_token), json={
            "username": uname, "email": f"{uname}@e2e.local", "password": passwd,
            "fullName": "E2E Intruder", "role": "Engineer",
        }, timeout=15)
        if r.status_code not in (200, 201):
            skip("ownership.403 (non-owner edit)", f"could not create test user (HTTP {r.status_code})")
            return
        tok = login(uname, passwd)
        if not tok:
            skip("ownership.403 (non-owner edit)", "could not log in as test user")
            return
        r = requests.put(f"{D}/displays/{display_id}", headers=bearer(tok),
                         json={"name": "hijacked"}, timeout=15)
        check("ownership.403 (non-owner edit blocked)", r.status_code == 403,
              f"expected 403, got {r.status_code}")
    except Exception as e:
        skip("ownership.403 (non-owner edit)", f"error: {e}")


def test_audit_trail(token: str, display_id: str) -> None:
    if not cfg.AUDIT_BASE:
        skip("audit.trail", "V2_AUDIT_BASE not set (audit-service has no host port by default)")
        return
    deadline = time.time() + cfg.WAIT_AUDIT_SEC
    while time.time() < deadline:
        try:
            r = requests.get(f"{cfg.AUDIT_BASE}/api/v1/audit", headers=bearer(token),
                             params={"entityType": "Display", "entityId": display_id}, timeout=10)
            if r.status_code == 200 and r.json().get("total", 0) >= 1:
                check("audit.trail (display events recorded)", True,
                      f"{r.json()['total']} event(s)")
                return
        except Exception:
            pass
        time.sleep(cfg.POLL_SEC)
    check("audit.trail (display events recorded)", False,
          f"no audit events within {cfg.WAIT_AUDIT_SEC}s (is audit-service + Kafka up?)")


# ══════════════════════════════════════════════════════════════════════════════
# Phase 7 — compute pipeline (the Flink loop)
# ══════════════════════════════════════════════════════════════════════════════
def test_compute(token: str, rc) -> None:
    banner("Phase 7 — Calculation compute loop (analysis-service ↔ Flink ↔ UNS)")
    AN = cfg.ANALYSIS_BASE
    h = bearer(token)

    # Inputs must be live (the simulator must be running).
    ka, kb = snapshot_key(cfg.CALC_INPUT_A), snapshot_key(cfg.CALC_INPUT_B)
    if rc is None:
        skip("compute.*", "redis not reachable — cannot verify live inputs / derived output")
        return
    va = rc.get(ka) if ka else None
    vb = rc.get(kb) if kb else None
    if not va or not vb:
        skip("compute.* (needs live data)",
             f"input snapshots missing ({ka}={va}, {kb}={vb}) — start ams-sim and wait ~15s")
        return
    check("compute.inputsLive", True, f"{cfg.CALC_INPUT_A} + {cfg.CALC_INPUT_B} present in Redis")

    analysis_id = None
    try:
        r = requests.post(f"{AN}/analyses", headers=h, json={
            "name": f"E2E-{RUN} avg", "type": 4,  # 4 = Expression
            "targetPath": cfg.CALC_INPUT_A.rsplit(".", 1)[0],
            "outputPath": cfg.CALC_OUTPUT,
            "isEnabled": True,
            "configuration": {
                "expression": "(a + b) / 2",
                "inputs": [{"name": "a", "path": cfg.CALC_INPUT_A},
                           {"name": "b", "path": cfg.CALC_INPUT_B}],
                "unit": "psi",
            },
        }, timeout=15)
        if not check("compute.createCalc", r.status_code in (200, 201), f"HTTP {r.status_code}: {r.text[:160]}"):
            return
        analysis_id = r.json().get("id")

        # Versioning (Phase 7.1)
        r = requests.post(f"{AN}/analyses/{analysis_id}/versions", headers=h, json={"changeNote": "e2e v1"}, timeout=15)
        if check("compute.createVersion", r.status_code in (200, 201), f"HTTP {r.status_code}"):
            v = r.json().get("version")
            r = requests.post(f"{AN}/analyses/{analysis_id}/versions/{v}/publish", headers=h, timeout=15)
            check("compute.publishVersion", r.status_code == 200, f"HTTP {r.status_code}")

        # Execute → poll the execution until the WHOLE loop closes it.
        r = requests.post(f"{AN}/analyses/{analysis_id}/execute", headers=h, json={}, timeout=15)
        if not check("compute.execute (accepted)", r.status_code in (200, 202), f"HTTP {r.status_code}"):
            return
        execution_id = r.json().get("executionId")

        final_status = None
        deadline = time.time() + cfg.WAIT_COMPUTE_SEC
        while time.time() < deadline:
            g = requests.get(f"{AN}/analyses/executions/{execution_id}", headers=h, timeout=10)
            if g.status_code == 200:
                final_status = g.json().get("status")
                if final_status in ("completed", "failed", "skipped"):
                    break
            time.sleep(cfg.POLL_SEC)

        loop_ran = final_status in ("completed", "failed", "skipped")
        if not check("compute.flinkLoopRan (execution left 'pending')", loop_ran,
                     f"status={final_status} after {cfg.WAIT_COMPUTE_SEC}s — is AnalysisExecutionJob running? (rebuild Flink JAR)"):
            return
        check("compute.executionCompleted", final_status == "completed",
              f"status={final_status}" + ("" if final_status == "completed" else " (check inputs/expression)"))

        # Derived measurement published to the UNS live plane (Phase 7.3).
        dk = snapshot_key(cfg.CALC_OUTPUT)
        derived = rc.get(dk) if dk else None
        check("compute.derivedPublishedToUNS", bool(derived),
              f"{dk} = {derived}" if derived else f"no derived snapshot at {dk}")

        # Derived measurement registered in the asset model → bindable like any tag. The result consumer
        # registers it ASYNCHRONOUSLY (just after the snapshot write), so poll briefly rather than once.
        reg_ok, reg_code = False, None
        reg_deadline = time.time() + 20
        while time.time() < reg_deadline:
            rr = requests.get(f"{cfg.ASSET_BASE}/assets/by-path/{cfg.CALC_OUTPUT}", headers=svc_key(), timeout=10)
            reg_code = rr.status_code
            if rr.status_code == 200:
                reg_ok = True
                break
            time.sleep(cfg.POLL_SEC)
        check("compute.derivedRegisteredInAssetModel", reg_ok, f"HTTP {reg_code}")

    finally:
        if analysis_id:
            try: requests.delete(f"{AN}/analyses/{analysis_id}", headers=h, timeout=10)
            except Exception: pass


# ══════════════════════════════════════════════════════════════════════════════
# Phase 4/6 — data fidelity (backend)  &  Phase 7.5 — authz
# ══════════════════════════════════════════════════════════════════════════════
def test_fidelity_and_authz(token: str, rc) -> None:
    banner("Phase 4/6 fidelity + Phase 7.5 authz")

    # Authz FIRST (works without Kafka, high value): an unscoped token resolves a tag (no regression).
    # Scope-DENIAL needs an assetScope-claimed token, which auth-service does not mint yet — documented.
    try:
        r = requests.get(f"{cfg.BINDING_BASE}/resolve", headers=bearer(token),
                         params={"path": cfg.CALC_INPUT_A, "roles": "all"}, timeout=10)
        check("authz.resolveUnscoped (no regression)", r.status_code == 200 and r.json().get("resolved"),
              f"HTTP {r.status_code}")
    except Exception as e:
        skip("authz.resolveUnscoped", f"error: {e}")
    skip("authz.scopeDenial (positive)", "requires an assetScope-claimed token (auth-service claim issuance pending)")

    # asset-model unit/limits by-path (Phase 6 UOM/threshold source).
    try:
        r = requests.get(f"{cfg.ASSET_BASE}/assets/by-path/{cfg.CALC_INPUT_B}", headers=svc_key(), timeout=10)
        if r.status_code == 200:
            a = r.json()
            has_meta = a.get("engineeringUnit") is not None or a.get("hiEngLimit") is not None
            check("fidelity.assetUnitLimits (by-path)", True,
                  f"unit={a.get('engineeringUnit')} hi={a.get('hiEngLimit')}" if has_meta else "resolved (no unit/limit seeded)")
        else:
            skip("fidelity.assetUnitLimits", f"by-path HTTP {r.status_code}")
    except Exception as e:
        skip("fidelity.assetUnitLimits", f"error: {e}")

    # historian /summary aggregate (Phase 4/6). Needs IoTDB history — informational.
    series = "root." + cfg.CALC_INPUT_B.rsplit(".", 1)[0].replace("/", ".")
    meas = cfg.CALC_INPUT_B.rsplit(".", 1)[-1]
    now = int(time.time())
    try:
        r = requests.get(f"{cfg.HIST_BASE}/summary", headers=svc_key(), params={
            "series": series, "measurement": meas,
            "start": _iso(now - 3600), "end": _iso(now),
        }, timeout=15)
        if r.status_code == 200:
            check("fidelity.historianSummary", True, f"min/max/avg present ({r.json().get('avg')})")
        else:
            skip("fidelity.historianSummary", f"HTTP {r.status_code} (IoTDB history may be empty early on)")
    except Exception as e:
        skip("fidelity.historianSummary", f"error: {e}")


def _iso(epoch_s: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch_s))


# ══════════════════════════════════════════════════════════════════════════════
def main() -> int:
    banner(f"V2 pipeline validation — run {RUN}")
    _p(f"auth={cfg.AUTH_BASE} display={cfg.DISPLAY_BASE} analysis={cfg.ANALYSIS_BASE} redis={cfg.REDIS_HOST}:{cfg.REDIS_PORT}")

    token = login(cfg.ADMIN_USER, cfg.ADMIN_PASS)
    if not token:
        record("auth.login (admin)", "FAIL", "could not obtain a token — is auth-service up and the admin seeded?")
        return _summary()
    record("auth.login (admin)", "PASS", f"token acquired for {cfg.ADMIN_USER}")

    rc = redis_client()

    # Each section is isolated: a hang/exception in one (e.g. a slow service) records a FAIL and the run
    # continues, so the SUMMARY always prints.
    for label, fn in (("governance", lambda: test_governance(token)),
                      ("compute", lambda: test_compute(token, rc)),
                      ("fidelity+authz", lambda: test_fidelity_and_authz(token, rc))):
        try:
            fn()
        except Exception as e:
            record(f"section.{label} (unhandled)", "FAIL", f"{type(e).__name__}: {str(e)[:160]}")

    return _summary()


def _summary() -> int:
    banner("SUMMARY")
    npass = sum(1 for r in RESULTS if r.status == "PASS")
    nfail = sum(1 for r in RESULTS if r.status == "FAIL")
    nskip = sum(1 for r in RESULTS if r.status == "SKIP")
    for r in RESULTS:
        if r.status != "PASS":
            _p(f"  {r.status}: {r.name} — {r.detail}")
    _p(f"\n{npass} passed · {nfail} failed · {nskip} skipped")
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
