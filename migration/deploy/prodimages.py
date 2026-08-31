# Shared Compose / image names / prod fingerprint for the air-gap pipeline.
# Imported by build-prod-images.py and save-offline-bundle.py. Do not run this file.
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

DEPLOY_DIR = Path(__file__).resolve().parent
MIGRATION_ROOT = DEPLOY_DIR.parent
REPO_ROOT = MIGRATION_ROOT.parent
COMPOSE_DIR = REPO_ROOT / "infra" / "docker"
ENV_FILE = MIGRATION_ROOT / ".env"
BUILD_OUT = DEPLOY_DIR / "build-out"

# Must match docker-compose.marun.yml `name:` and the VM .env.
PROJECT = os.environ.get("COMPOSE_PROJECT_NAME", "ams-cpa")

BUNDLE_PREFIX = "ams-cpa"

# Built one-at-a-time on the internet box. Frontend last (npm ci is slowest).
# flink-taskmanager shares image ams-flink:1.0-SNAPSHOT — do not build it separately.
BUILD_SERVICES = [
    "auth-service",
    "gateway",
    "asset-model",
    "binding-resolver",
    "cplm-api",
    "historian-bff",
    "ingestion-service",
    "audit-service",
    "sparkplug-edge-node",
    "flink-jobmanager",
    "ams-frontend",
]

# Registry pulls (Marun reuses Instrumental Postgres/Kafka — do not pull those).
PULL_SERVICES = [
    "redis",
    "redis-contract",
    "iotdb",
    "emqx",
    "emqx-init",
    "minio",
    "minio-init",
    "iotdb-init",
]

# compose `image:` overrides (not {project}-{service}).
EXPLICIT_IMAGE = {
    "flink-jobmanager": "ams-flink:1.0-SNAPSHOT",
    "flink-taskmanager": "ams-flink:1.0-SNAPSHOT",
    "flink-job-submit": "ams-flink:1.0-SNAPSHOT",
    "flink-job-submit-iotdb": "ams-flink:1.0-SNAPSHOT",
    "flink-job-submit-live-state": "ams-flink:1.0-SNAPSHOT",
    "flink-job-submit-cplm": "ams-flink:1.0-SNAPSHOT",
    "flink-job-supervisor": "ams-flink:1.0-SNAPSHOT",
}

# How to prove the image is the production Dockerfile, not a same-named dev tag.
FINGERPRINT = {
    "auth-service": "node-dist",
    "ams-frontend": "nginx",
    "gateway": "dotnet",
    "asset-model": "dotnet",
    "binding-resolver": "dotnet",
    "cplm-api": "dotnet",
    "historian-bff": "dotnet",
    "ingestion-service": "dotnet",
    "audit-service": "dotnet",
    "ams-api": "dotnet",
    "sparkplug-edge-node": "java-jar",
    "flink-jobmanager": "flink",
}

# Do not docker-save a second copy of Instrumental's data plane.
SKIP_SAVE_SUBSTRINGS = (
    "timescale/timescaledb",
    "confluentinc/cp-kafka",
    "confluentinc/cp-zookeeper",
    "dpage/pgadmin4",
    "provectuslabs/kafka-ui",
    "eclipse-mosquitto",
    "python:3.11-alpine",
    "dbeaver/cloudbeaver",
    "ams-cloudbeaver",
)

FLINK_JAR = REPO_ROOT / "src" / "flink" / "target" / "ams-flink-1.0-SNAPSHOT.jar"
FLINK_JAR_IN_IMAGE = "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar"


def compose_argv(*extra: str) -> list[str]:
    argv = [
        "docker",
        "compose",
        "--project-name",
        PROJECT,
        "--env-file",
        str(ENV_FILE),
        "-f",
        str(COMPOSE_DIR / "docker-compose.yml"),
        "-f",
        str(DEPLOY_DIR / "docker-compose.marun.yml"),
        "--project-directory",
        str(COMPOSE_DIR),
        "--profile",
        "cpa",
    ]
    if os.environ.get("START_AMS_API") == "yes":
        argv.extend(["--profile", "cpa-ams-api"])
    argv.extend(extra)
    return argv


def image_name(service: str) -> str:
    return EXPLICIT_IMAGE.get(service, f"{PROJECT}-{service}")


def _inspect(image: str) -> dict | None:
    r = subprocess.run(
        ["docker", "image", "inspect", image],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        return None
    data = json.loads(r.stdout)
    return data[0] if data else None


def _blob(info: dict) -> str:
    cfg = info.get("Config") or {}
    parts: list[str] = []
    for key in ("Entrypoint", "Cmd"):
        val = cfg.get(key) or []
        if isinstance(val, list):
            parts.extend(str(x) for x in val)
        elif val:
            parts.append(str(val))
    parts.append(str(cfg.get("User") or ""))
    parts.extend(str(x) for x in (cfg.get("Env") or []))
    labels = cfg.get("Labels") or {}
    parts.extend(str(v) for v in labels.values())
    return " ".join(parts)


def _has_file(image: str, path: str) -> bool:
    r = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--entrypoint",
            "/bin/sh",
            image,
            "-c",
            f"test -f '{path}'",
        ],
        capture_output=True,
        text=True,
    )
    return r.returncode == 0


def image_kind(service: str) -> str:
    """Return PROD, DEV, or ABSENT."""
    image = image_name(service)
    info = _inspect(image)
    if info is None:
        return "ABSENT"
    blob = _blob(info).lower()
    if any(tok in blob for tok in ("npm run dev", "vite", "dotnet watch", "ts-node")):
        return "DEV"
    kind = FINGERPRINT.get(service)
    if kind == "nginx":
        return "PROD" if "nginx" in blob else "DEV"
    if kind == "node-dist":
        if _has_file(image, "/app/dist/server.js"):
            return "PROD"
        return "DEV"
    if kind == "dotnet":
        if "dotnet" in blob and ".dll" in blob and "watch" not in blob:
            return "PROD"
        return "DEV"
    if kind == "java-jar":
        return "PROD" if "app.jar" in blob else "DEV"
    if kind == "flink":
        if "ams_flink_jar" in blob or "com.ams.flink.jar-version" in blob:
            if _has_file(image, FLINK_JAR_IN_IMAGE):
                return "PROD"
        return "DEV"
    return "PROD" if info else "ABSENT"


def verify_app_images(services: list[str] | None = None) -> list[tuple[str, str, str]]:
    rows = []
    for svc in services or BUILD_SERVICES:
        kind = image_kind(svc)
        rows.append((svc, image_name(svc), kind))
    return rows


def all_prod(rows: list[tuple[str, str, str]]) -> bool:
    return all(kind == "PROD" for _, _, kind in rows)


def should_skip_save(image: str) -> bool:
    lower = image.lower()
    return any(s in lower for s in SKIP_SAVE_SUBSTRINGS)


def compose_images() -> list[str]:
    r = subprocess.run(
        compose_argv("config", "--images"),
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        sys.stderr.write(r.stderr or r.stdout or "compose config --images failed\n")
        sys.exit(1)
    seen: set[str] = set()
    out: list[str] = []
    for line in r.stdout.splitlines():
        img = line.strip()
        if not img or img in seen or should_skip_save(img):
            continue
        seen.add(img)
        out.append(img)
    return out


def require_env_file() -> None:
    if not ENV_FILE.is_file():
        sys.stderr.write(f"missing {ENV_FILE} (copy migration/.env.example)\n")
        sys.exit(1)
