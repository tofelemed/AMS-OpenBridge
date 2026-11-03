"""Tests for the release-specific VM-STEPS blocks (migration/deploy/release_blocks.py), from CHG-102 on.

    python -m pytest migration/deploy -q

test_build_release.py is at its size budget; build-release.py has a hyphen in its name, so it is loaded by path.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_release", HERE / "build-release.py")
br = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(br)


# ── CHG-102: hot-window partitions (cpm-17) ─────────────────────────────────
def chg102_steps(flags: set[str]) -> str:
    steps = br.vm_steps("v0.0.0-test", "abc1234", [("cplm-api", "ams-cpa-cplm-api", "PROD")], False, ["cplm-api"], False, False)
    return br.release_blocks.insert(steps, "v0.0.0-test", flags)


def test_chg102_scripts_ship_and_the_directive_is_a_pre_swap_block():
    for rel in ("scripts/cpm-17-hot-window-partitions.sql", "scripts/cpm-17-hot-window-partitions.rollback.sql"):
        assert rel in br.OPS_FILES
        assert (HERE.parent.parent / rel).is_file()
    assert "chg102-cpm17" in br.release_blocks.DIRECTIVES and "chg102-cpm17" in br.release_blocks.PRE_SWAP
    # the rollback needs the cron file and the DELETE script it installs: both stay in the repo for one release
    assert (HERE.parent.parent / "migration/cron.d/cpa-prune-short-features").is_file()
    assert (HERE.parent.parent / "migration/prune-short-features.sh").is_file()


def test_chg102_block_appears_only_with_the_directive():
    assert "cpm-17-hot-window-partitions.sql" not in chg102_steps(set())
    assert "4e. CHG-102" in chg102_steps({"chg102-cpm17"})


def test_chg102_steps_stop_cplm_api_retire_the_cron_and_migrate_before_the_load_and_the_swap():
    s = chg102_steps({"chg102-cpm17", "chg099-cpm15"})
    extract = s.index("tar -xzf /tmp/v0.0.0-test/src-abc1234.tar.gz")
    cpm15 = s.index("ops/cpm-15-evidence-reconstruction-beside.sql")
    blk = s[s.index("# 4e. CHG-102"):s.index("\n# 4. load")]
    cron = s.index("/etc/cron.d/cpa-prune-short-features")
    stop = s.index("docker stop traverse-cplm-api")
    cpm17 = s.index("< /tmp/v0.0.0-test/ops/cpm-17-hot-window-partitions.sql")
    load = s.index("\n# 4. load")
    deploy = s.index("deploy.sh --prod")
    assert extract < cpm15 < cron < stop < cpm17 < load < deploy
    assert "sudo rm -f /etc/cron.d/cpa-prune-short-features" in blk
    assert "docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 <" in blk
    # the old image must not run on the hourly shape: nothing in the block starts it again (step 6 recreates it)
    assert not any(l.startswith("docker start") for l in blk.splitlines())
    assert "SHORT_FEATURES=1d/6h" in blk and "LONG_FEATURES=1d/-h" in blk
    assert "cpm-17-hot-window-partitions.rollback.sql" in blk and "sudo cp migration/cron.d/cpa-prune-short-features /etc/cron.d/" in blk


def test_chg102_sql_follows_the_cpm10b_conventions():
    sql = (HERE.parent.parent / "scripts/cpm-17-hot-window-partitions.sql").read_text(encoding="utf-8")
    assert "CHG-102" in sql and "STOPPED" in sql and "timescaledb_information.hypertables" in sql
    assert "docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-17-hot-window-partitions.sql" in sql
    assert "ON CONFLICT (record_class) DO UPDATE" in sql and "\\c " not in sql   # the test fixture runs it through Npgsql
    rb = (HERE.parent.parent / "scripts/cpm-17-hot-window-partitions.rollback.sql").read_text(encoding="utf-8")
    assert "DROP COLUMN IF EXISTS hours" in rb and "\\c " not in rb


# ── CHG-102 Phase 6: daily fleet KPIs (cpm-18) ──────────────────────────────
def test_chg102_cpm18_scripts_ship_and_the_directive_is_a_pre_swap_block():
    for rel in ("scripts/cpm-18-kpi-daily.sql", "scripts/cpm-18-kpi-daily.rollback.sql"):
        assert rel in br.OPS_FILES
        assert (HERE.parent.parent / rel).is_file()
    assert "chg102-cpm18" in br.release_blocks.DIRECTIVES and "chg102-cpm18" in br.release_blocks.PRE_SWAP


def test_chg102_cpm18_block_runs_online_after_cpm17_and_before_the_load_and_the_swap():
    assert "cpm-18-kpi-daily.sql" not in chg102_steps(set())
    s = chg102_steps({"chg102-cpm17", "chg102-cpm18"})
    blk = s[s.index("# 4f. CHG-102"):s.index("\n# 4. load")]
    assert s.index("# 4e. CHG-102") < s.index("# 4f. CHG-102") < s.index("\n# 4. load") < s.index("deploy.sh --prod")
    assert "docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/v0.0.0-test/ops/cpm-18-kpi-daily.sql" in blk
    # online: the block neither stops nor starts cplm-api
    assert not any(l.startswith(("docker stop", "docker start")) for l in blk.splitlines())
    assert "KPI_DAILY=1095d" in blk and "cpm-18-kpi-daily.rollback.sql" in blk


def test_chg102_cpm18_sql_is_idempotent_and_mirrored():
    root = HERE.parent.parent
    sql = (root / "scripts/cpm-18-kpi-daily.sql").read_text(encoding="utf-8")
    assert "CHG-102" in sql and "ONLINE" in sql and "BEFORE the cplm-api image swap" in sql
    assert "docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-18-kpi-daily.sql" in sql
    assert "CREATE TABLE IF NOT EXISTS analytics.cplm_kpi_daily (" in sql and "('KPI_DAILY', 1095)" in sql
    assert "OWNER TO ams_user" in sql and "\\c " not in sql   # the test fixture runs it through Npgsql
    rb = (root / "scripts/cpm-18-kpi-daily.rollback.sql").read_text(encoding="utf-8")
    assert "DROP TABLE IF EXISTS analytics.cplm_kpi_daily;" in rb and "\\c " not in rb
    for mirror in ("database/scripts/66_cplm_kpi_daily.sql", "migration/schema/03-traverse_cplm.sql"):
        m = (root / mirror).read_text(encoding="utf-8")
        assert "CREATE TABLE IF NOT EXISTS analytics.cplm_kpi_daily_run" in m and "('KPI_DAILY', 1095)" in m, mirror
