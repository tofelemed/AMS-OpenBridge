#!/usr/bin/env python3
"""One docker save of CPA images for an air-gapped Marun VM. Run on the build box after verify."""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prodimages import (
    BUNDLE_PREFIX,
    ENV_FILE,
    FLINK_JAR,
    MIGRATION_ROOT,
    PROJECT,
    REPO_ROOT,
    all_prod,
    compose_images,
    require_env_file,
    verify_app_images,
)


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def gzip_file(src: Path, dest: Path) -> None:
    import gzip

    log(f"gzip {src.name} → {dest.name}")
    with src.open("rb") as f_in, gzip.open(dest, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)


def write_sums(bundle: Path, files: list[Path]) -> None:
    sums = bundle / "SHA256SUMS.txt"
    with sums.open("w", encoding="utf-8", newline="\n") as fh:
        for p in files:
            if p.is_file():
                fh.write(f"{sha256_file(p)}  {p.name}\n")
    log(f"wrote {sums.name} (LF)")


def git_archive(dest: Path) -> None:
    log("git archive HEAD")
    r = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "archive", "--format=tar.gz", "HEAD", "-o", str(dest)],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        sys.stderr.write(r.stderr or "git archive failed\n")
        sys.exit(1)


def copy_env(dest: Path) -> None:
    shutil.copy2(ENV_FILE, dest)
    log(f"copied {ENV_FILE.name} → {dest.name} (secrets — chmod 600 on the VM)")


def copy_ca(bundle: Path) -> Path | None:
    candidates = [
        MIGRATION_ROOT / "mqtt-ca.crt",
        REPO_ROOT / "infra" / "docker" / "emqx" / "certs" / "ca.crt",
    ]
    for src in candidates:
        if src.is_file():
            dest = bundle / "mqtt-ca.crt"
            shutil.copy2(src, dest)
            log(f"copied CA {src}")
            return dest
    log("no MQTT CA found (optional)")
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Save one offline docker bundle (CPA / Marun).")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "offline-bundle")
    parser.add_argument("--images-only", action="store_true")
    parser.add_argument("--no-gzip", action="store_true")
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="DANGEROUS — do not use for plant. Allows saving DEV/ABSENT images.",
    )
    args = parser.parse_args()

    require_env_file()
    os.environ.setdefault("COMPOSE_PROJECT_NAME", PROJECT)

    rows = verify_app_images()
    for svc, image, kind in rows:
        print(f"{kind:6}  {svc:24}  {image}")
    if not all_prod(rows) and not args.no_verify:
        sys.stderr.write(
            "refusing to save: every app image must fingerprint PROD.\n"
            "  python migration/deploy/build-prod-images.py --verify-only\n"
            "--no-verify exists and must not be used for plant.\n"
        )
        return 1
    if args.no_verify:
        sys.stderr.write("WARNING: --no-verify — not a plant bundle\n")

    images = compose_images()
    if not images:
        sys.stderr.write("compose config --images returned nothing\n")
        return 1
    log(f"{len(images)} images (Instrumental postgres/kafka filtered out):")
    for img in images:
        print(f"  {img}")

    missing = []
    for img in images:
        r = subprocess.run(["docker", "image", "inspect", img], capture_output=True)
        if r.returncode != 0:
            missing.append(img)
    if missing:
        sys.stderr.write("images not loaded locally:\n  " + "\n  ".join(missing) + "\n")
        return 1

    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    tar = out / f"{BUNDLE_PREFIX}-images.tar"
    gz = out / f"{BUNDLE_PREFIX}-images.tar.gz"
    log(f"docker save → {tar.name} ({len(images)} images, one archive)")
    rc = subprocess.call(["docker", "save", "-o", str(tar), *images])
    if rc != 0:
        return rc

    saved: list[Path] = []
    if args.no_gzip:
        saved.append(tar)
    else:
        gzip_file(tar, gz)
        tar.unlink()
        saved.append(gz)

    if not args.images_only:
        src = out / f"{BUNDLE_PREFIX}-source.tar.gz"
        git_archive(src)
        saved.append(src)
        env_copy = out / "env.copyme"
        copy_env(env_copy)
        saved.append(env_copy)
        ca = copy_ca(out)
        if ca:
            saved.append(ca)
        if FLINK_JAR.is_file():
            jar_dest = out / "ams-flink-1.0-SNAPSHOT.jar"
            shutil.copy2(FLINK_JAR, jar_dest)
            saved.append(jar_dest)
            log("copied Flink JAR for cplm-api recompute mount (target/ is not in git)")
        else:
            sys.stderr.write("WARNING: Flink JAR missing — A8 recompute mount will be empty on the VM\n")

    write_sums(out, saved)
    log(f"bundle ready: {out}")
    log("VM: sha256sum -c SHA256SUMS.txt && gunzip -c "
        f"{BUNDLE_PREFIX}-images.tar.gz | docker load")
    return 0


if __name__ == "__main__":
    sys.exit(main())
