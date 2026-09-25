"""Tests for the release builder's plant-facing outputs (v2.5 pre-prod gaps G1, G2, G5, G6).

    python -m pytest migration/deploy -q

The module under test has a hyphen in its name, so it is loaded by path.
"""
from __future__ import annotations

import importlib.util
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_release", HERE / "build-release.py")
br = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(br)

ROWS = [("cplm-api", "ams-cpa-cplm-api", "PROD"), ("flink-jobmanager", "ams-flink:1.0-SNAPSHOT", "PROD")]
SERVICES = ["traverse-ingestion-service", "cplm-api", "historian-bff", "flink-jobmanager",
            "ams-frontend", "traverse-auth-service", "gateway"]


def v25_steps() -> str:
    return br.vm_steps("v2.5", "abc1234", ROWS, True, SERVICES, False, True)


def line_with(text: str, needle: str) -> str:
    return next(line for line in text.splitlines() if needle in line)


def test_v25_steps_sync_the_source_tree_before_any_schema_or_topic_step():
    steps = v25_steps()
    sync_line = line_with(steps, "src-abc1234.tar.gz")
    assert "tar" in sync_line and "/opt/AMS-open" in sync_line
    sync = steps.index(sync_line)
    assert sync < steps.index("cpm-07-v25-schema.sql")
    assert sync < steps.index("04-create-kafka-topics.sh")
    assert sync < steps.index("deploy.sh --prod")


def test_v25_steps_normalize_ownership_after_the_schema_files_and_before_the_topics():
    steps = v25_steps()
    own = steps.index("02-apply-schemas.sh")
    assert steps.index("cpm-09-event-shelving.sql") < own < steps.index("04-create-kafka-topics.sh")
    assert "tableowner" in steps


def test_v25_steps_state_the_real_topic_numbers():
    steps = v25_steps()
    assert "now 36" not in steps
    assert "8 new topics" in steps
    assert "# 15" in line_with(steps, "grep -c 'traverse.cpa'")


def test_v25_steps_export_the_deploy_environment_before_deploy_sh():
    steps = v25_steps()
    exports = line_with(steps, "ALLOW_FLINK_SUBMIT=yes")
    assert "START_AMS_API=yes" in exports
    assert steps.index(exports) < steps.index("deploy.sh --prod")


def test_v25_steps_declare_the_quality_protocol_only_after_the_new_images_run():
    steps = v25_steps()
    assert steps.index("deploy.sh --prod") < steps.index("set-quality-protocol.py --apply")


def test_v25_steps_set_the_evidence_retention_after_ownership_and_before_the_topics():
    steps = v25_steps()
    retention = steps.index("UPDATE analytics.retention_policy SET days = 7")
    assert steps.index("02-apply-schemas.sh") < retention < steps.index("04-create-kafka-topics.sh")


def test_v25_steps_load_the_images_after_the_schema_and_the_topics():
    steps = v25_steps()
    assert steps.index("04-create-kafka-topics.sh") < steps.index("docker load") < steps.index("deploy.sh --prod")


def test_v25_steps_export_topic_creation_so_the_validator_requires_the_topics():
    steps = v25_steps()
    exports = line_with(steps, "ALLOW_FLINK_SUBMIT=yes")
    assert "ALLOW_CREATE_PREFIXED_TOPICS=yes" in exports
    assert "all four" not in steps.lower()


def test_v25_steps_check_the_checkout_before_the_overlay_and_record_the_release_commit():
    steps = v25_steps()
    status = steps.index("git -C /opt/AMS-open status --porcelain")
    assert status < steps.index("src-abc1234.tar.gz")
    assert "RELEASE-COMMIT" in steps


def test_source_archive_keeps_lf_line_endings_whatever_the_build_box_autocrlf(tmp_path):
    archive = br.make_source_archive(tmp_path, "abc1234", dry_run=False)
    with tarfile.open(archive) as tar:
        for name in ("migration/kafka/topics.txt", "scripts/cpm-07-v25-schema.sql", "infra/docker/flink-log4j-console.properties"):
            data = tar.extractfile(name).read()
            assert b"\r" not in data, f"{name} carries CR bytes - the archive must ship the repo's LF blobs"


def test_source_archive_contains_the_deploy_scripts_but_not_the_env(tmp_path):
    archive = br.make_source_archive(tmp_path, "abc1234", dry_run=False)
    assert archive == tmp_path / "src-abc1234.tar.gz"
    with tarfile.open(archive) as tar:
        names = set(tar.getnames())
    assert "migration/04b-submit-flink-jobs.sh" in names
    assert "migration/deploy/docker-compose.marun.yml" in names
    assert "migration/kafka/topics.txt" in names
    assert "migration/.env" not in names


def test_source_archive_dry_run_writes_nothing(tmp_path):
    archive = br.make_source_archive(tmp_path, "abc1234", dry_run=True)
    assert archive == tmp_path / "src-abc1234.tar.gz"
    assert not archive.exists()
