#!/usr/bin/env python3
"""Build CPA production images on an internet-connected box. Do not run on the plant VM."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prodimages import (
    harden_stdio,
    BUILD_OUT,
    BUILD_SERVICES,
    ENV_FILE,
    FLINK_JAR,
    PROJECT,
    PULL_SERVICES,
    REPO_ROOT,
    compose_argv,
    image_kind,
    image_name,
    require_env_file,
    verify_app_images,
)


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)

harden_stdio()


def run(argv: list[str], log_file: Path | None = None, retries: int = 1) -> int:
    last = 1
    for attempt in range(1, retries + 1):
        log(f"$ {' '.join(argv)}" + (f"  (try {attempt}/{retries})" if retries > 1 else ""))
        if log_file:
            log_file.parent.mkdir(parents=True, exist_ok=True)
            with log_file.open("ab") as fh:
                fh.write(f"\n--- try {attempt} {datetime.now(timezone.utc).isoformat()} ---\n".encode())
                proc = subprocess.Popen(argv, stdout=fh, stderr=subprocess.STDOUT)
                last = proc.wait()
        else:
            last = subprocess.call(argv)
        if last == 0:
            return 0
        time.sleep(min(15 * attempt, 60))
    return last


def ensure_flink_jar() -> None:
    if FLINK_JAR.is_file():
        log(f"flink jar present: {FLINK_JAR}")
        return
    log("flink jar missing — mvn package (needs Maven Central)")
    rc = run(
        # -Dmaven.test.skip=true, not -DskipTests: the latter still compiles the tests and the
        # pre-existing CplmLoopDynamicsAwareTest compile failure kills the build (CHG-008 §2).
        ["mvn", "-f", str(REPO_ROOT / "src" / "flink" / "pom.xml"), "-q", "package", "-Dmaven.test.skip=true"],
        retries=2,
    )
    if rc != 0 or not FLINK_JAR.is_file():
        sys.stderr.write(
            "Flink JAR was not built. On the internet box run:\n"
            "  mvn -f src/flink/pom.xml package -Dmaven.test.skip=true\n"
            "The VM must never mvn package.\n"
        )
        sys.exit(1)


def write_status(rows: list[tuple[str, str, str, str]]) -> None:
    BUILD_OUT.mkdir(parents=True, exist_ok=True)
    path = BUILD_OUT / "status.tsv"
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write("service\timage\tresult\tdetail\n")
        for row in rows:
            fh.write("\t".join(row) + "\n")
    log(f"status → {path}")


def verify_only() -> int:
    rows = verify_app_images()
    status_rows = []
    bad = 0
    for svc, image, kind in rows:
        print(f"{kind:6}  {svc:24}  {image}")
        status_rows.append((svc, image, kind, "verify-only"))
        if kind != "PROD":
            bad += 1
    write_status(status_rows)
    if bad:
        sys.stderr.write(f"{bad} image(s) DEV or ABSENT — refuse to save a plant bundle\n")
        return 1
    log("all app images PROD")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build AMS CPA prod images (internet box).")
    parser.add_argument("--only", metavar="SERVICE", help="build one compose service")
    parser.add_argument("--skip-existing", action="store_true", help="skip services whose image already exists")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--skip-pull", action="store_true")
    args = parser.parse_args()

    require_env_file()
    os.environ.setdefault("COMPOSE_PROJECT_NAME", PROJECT)
    os.environ.setdefault("COMPOSE_PARALLEL_LIMIT", "1")
    os.environ.setdefault("DOCKER_DEFAULT_PLATFORM", "linux/amd64")

    if args.verify_only:
        return verify_only()

    if not ENV_FILE.is_file():
        sys.stderr.write(f"missing {ENV_FILE}\n")
        return 1

    ensure_flink_jar()
    BUILD_OUT.mkdir(parents=True, exist_ok=True)
    (BUILD_OUT / "logs").mkdir(exist_ok=True)

    if not args.skip_pull:
        log("pulling registry images (not Instrumental postgres/kafka)")
        rc = run(compose_argv("pull", "--ignore-buildable", *PULL_SERVICES), retries=2)
        if rc != 0:
            # older compose has no --ignore-buildable
            rc = run(compose_argv("pull", *PULL_SERVICES), retries=2)
        if rc != 0:
            sys.stderr.write("compose pull failed\n")
            return rc

    services = [args.only] if args.only else list(BUILD_SERVICES)
    unknown = [s for s in services if s not in BUILD_SERVICES and s != "ams-api"]
    if unknown:
        sys.stderr.write(f"unknown service(s): {unknown}\n")
        return 1

    status_rows: list[tuple[str, str, str, str]] = []
    for svc in services:
        img = image_name(svc)
        if args.skip_existing and image_kind(svc) != "ABSENT":
            log(f"skip existing {img}")
            status_rows.append((svc, img, "SKIP", "already present"))
            continue
        log_path = BUILD_OUT / "logs" / f"{svc}.log"
        t0 = time.time()
        rc = run(
            compose_argv("build", "--progress", "plain", svc),
            log_file=log_path,
            retries=args.retries,
        )
        elapsed = f"{int(time.time() - t0)}s"
        if rc != 0:
            status_rows.append((svc, img, "FAIL", f"rc={rc} {elapsed} {log_path.name}"))
            write_status(status_rows)
            sys.stderr.write(f"build failed: {svc}  see {log_path}\n")
            return rc
        kind = image_kind(svc)
        status_rows.append((svc, img, kind, elapsed))
        if kind != "PROD":
            write_status(status_rows)
            sys.stderr.write(f"{svc} built but fingerprint is {kind} (expected PROD)\n")
            return 1
        log(f"ok {svc} ({elapsed}) → {img}")

    write_status(status_rows)
    inspect = subprocess.check_output(
        ["docker", "image", "inspect", image_name("gateway"), "--format", "{{.Os}}/{{.Architecture}}"],
        text=True,
    ).strip()
    log(f"gateway platform {inspect}  (VM is linux/amd64)")
    if inspect != "linux/amd64":
        sys.stderr.write("refusing: images are not linux/amd64\n")
        return 1
    log("builds finished — run: python migration/deploy/save-offline-bundle.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
