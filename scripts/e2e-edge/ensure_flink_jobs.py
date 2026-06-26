#!/usr/bin/env python3
"""E2E wrapper — ensure core Flink jobs are RUNNING."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from common import StepResult, fail, log, ok, print_banner, wait_until


def _load_flink_module():
    path = ROOT.parent / "ensure_flink_jobs.py"
    spec = importlib.util.spec_from_file_location("ams_ensure_flink_jobs", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def run() -> list[StepResult]:
    print_banner("Ensure Flink Jobs")
    results: list[StepResult] = []
    flink = _load_flink_module()

    try:
        flink.wait_for_jobmanager()
        flink.sync_jar_to_container()
        running = flink.running_job_names()
    except Exception as exc:
        results.append(fail("Flink REST", str(exc)))
        return results

    missing = [s for s in flink.CORE_JOBS if s.name not in running]
    if not missing:
        results.append(ok("Flink jobs", f"all {len(flink.CORE_JOBS)} required jobs RUNNING"))
        return results

    log_msg = ", ".join(s.name for s in missing)
    log(f"Missing Flink jobs: {log_msg}")

    for spec in missing:
        try:
            flink.submit_job(spec)
        except Exception as exc:
            results.append(fail(f"Submit {spec.name}", str(exc)))
            return results

    needed = {s.name for s in missing}

    def all_running() -> bool:
        try:
            return needed.issubset(flink.running_job_names())
        except Exception:
            return False

    if wait_until("Flink jobs RUNNING", all_running, flink.WAIT_FLINK_SEC):
        results.append(ok("Flink jobs", "submitted and RUNNING"))
    else:
        try:
            still = needed - flink.running_job_names()
        except Exception as exc:
            still = {str(exc)}
        results.append(
            fail(
                "Flink jobs",
                f"still missing after {flink.WAIT_FLINK_SEC}s: {', '.join(sorted(still))}",
            )
        )

    return results


if __name__ == "__main__":
    from common import exit_code

    raise SystemExit(exit_code(run()))
