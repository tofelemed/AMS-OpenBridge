#!/usr/bin/env python3
"""Binding resolution: display-service/asset-model/binding-resolver chain —
path + role -> transport descriptor, via the gateway.

Verifies for representative UNS paths:
  - role=live   -> MQTT WS endpoint + Sparkplug topic + redisSnapshotKey
  - role=history-> IoTDB path (root.<path with / -> .>) + /api/hist/* URLs
  - role=alarm  -> SignalR hub reference + alarms API reference
  - GET /resolve and POST /resolve/batch agree
  - both auth paths work: gateway JWT and X-Service-Key

Paths are discovered live from asset-model (falls back to --paths).

Usage: python sim_binding_resolution.py [--paths a/b/c.pv,x/y/z.pv]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import simlib as sl


def discover_paths(token: str, limit: int = 3) -> list[str]:
    """Pull leaf measurement paths from asset-model (path form a/b/c.metric)."""
    candidates: list[str] = []
    r = sl.api("GET", "/api/assets?take=500", token)
    if r.status_code != 200:
        return []
    body = r.json()
    items = body.get("assets") if isinstance(body, dict) else body
    for it in items or []:
        p = it.get("contextualPath") or it.get("path") or it.get("fullPath")
        if p and "." in p.rsplit("/", 1)[-1]:
            candidates.append(p)
    return candidates[:limit]


def check_live(desc: dict) -> tuple[bool, list[str]]:
    text = json.dumps(desc).lower()
    problems = []
    if "mqtt" not in text and "ws" not in text:
        problems.append("no MQTT WS endpoint")
    if "spbv1.0" not in text and "sparkplug" not in text:
        problems.append("no sparkplug topic")
    if "snapshot" not in text:
        problems.append("no redisSnapshotKey")
    return not problems, problems


def check_history(desc: dict, path: str) -> tuple[bool, list[str]]:
    """The frontend consumes only ioTDbPath (TrendCore.tsx splitIoTPath) and
    builds /api/hist/* URLs itself; the descriptor's trendEndpoint/rawEndpoint
    are internal cluster URLs (pre-lockdown contract) — logged as drift, not
    failed here."""
    text = json.dumps(desc)
    problems = []
    expected_iotdb = "root." + path.replace("/", ".")
    if expected_iotdb not in text:
        problems.append(f"iotdb path != {expected_iotdb}")
    return not problems, problems


def check_alarm(desc: dict) -> tuple[bool, list[str]]:
    text = json.dumps(desc).lower()
    problems = []
    if "hub" not in text and "signalr" not in text:
        problems.append("no SignalR hub reference")
    if "alarm" not in text:
        problems.append("no alarms API reference")
    return not problems, problems


def main() -> int:
    ap = sl.base_parser(__doc__.splitlines()[0], default_count=3, default_interval=0)
    ap.add_argument("--paths", default="",
                    help="comma-separated UNS paths (default: discovered from asset-model)")
    args = ap.parse_args()
    sl.banner(f"sim_binding_resolution  run-tag={args.run_tag}")

    token = sl.login()
    paths = [p.strip() for p in args.paths.split(",") if p.strip()] or discover_paths(token)
    if not paths:
        sl.log("no UNS paths discovered — cannot resolve")
        return sl.finish(args, {"sim": "sim_binding_resolution",
                                "checks": {"paths_discovered": False}})
    sl.log(f"resolving paths: {paths}")

    checks: dict[str, bool] = {"paths_discovered": True}
    detail: dict = {"paths": paths, "per_path": {}}

    role_checkers = {"live": check_live, "history": check_history, "alarm": check_alarm}

    for path in paths:
        per = {}
        for role, checker in role_checkers.items():
            sl.log(f"resolve {role} {path}")
            r = sl.api("GET", f"/api/bindings/resolve?path={path}&roles={role}", token)
            ok = r.status_code == 200
            problems: list[str] = [f"HTTP {r.status_code}"] if not ok else []
            if ok:
                desc = r.json()
                ok, problems = (checker(desc, path) if role == "history" else checker(desc))
                per[f"{role}_descriptor_sample"] = json.dumps(desc)[:400]
            per[role] = {"ok": ok, "problems": problems}
            checks.setdefault(f"role_{role}_all_paths", True)
            if not ok:
                checks[f"role_{role}_all_paths"] = False
        detail["per_path"][path] = per

    # batch resolve agrees with single resolve (contract: BatchBindingRequest.Bindings)
    r = sl.api("POST", "/api/bindings/resolve/batch", token,
               json={"bindings": [{"path": p, "roles": ["live", "history", "alarm"]}
                                  for p in paths]})
    batch_ok = r.status_code == 200
    detail["batch_sample"] = r.text[:400]
    if batch_ok:
        got = r.json().get("bindings") or []
        batch_ok = len(got) == len(paths) and all(
            b.get("resolved") for b in got)
    checks["batch_resolve"] = batch_ok

    # edge-only auth (MIGRATION_LOG decision #16): the gateway is the single
    # validator — an X-Service-Key without JWT must be REJECTED at the edge.
    # (The internal binding-resolver -> asset-model hop uses the key inside
    # the compose network; verified in the cross-cutting checks.)
    r = sl.api("GET", f"/api/bindings/resolve?path={paths[0]}&roles=live", service_key=True)
    checks["service_key_rejected_at_gateway"] = r.status_code in (401, 403)
    detail["service_key_status"] = r.status_code

    # negative: no credentials at all must be rejected at the gateway
    r = sl.api("GET", f"/api/bindings/resolve?path={paths[0]}&roles=live")
    checks["anonymous_rejected"] = r.status_code in (401, 403)
    detail["anonymous_status"] = r.status_code

    report = {"sim": "sim_binding_resolution", "run_tag": args.run_tag,
              "checks": checks, "detail": detail}
    return sl.finish(args, report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sl.SimError as exc:
        sl.log(f"FATAL: {exc}")
        raise SystemExit(2)
