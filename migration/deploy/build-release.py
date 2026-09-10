#!/usr/bin/env python3
"""Build, verify and save ONE release's images for the air-gapped plant VM.

The per-service update path in UPDATE-RUNBOOK.md sec.1 is a list of commands a human
retypes per service; a release is five of them plus the Flink JAR, which is where
the two CHG-008 traps live (the JAR that must be built with -Dmaven.test.skip=true,
and the CPLM jobs that must be cancelled and resubmitted). This script is that
list, once, driven by a manifest in migration/deploy/releases/<name>.txt.

    python migration/deploy/build-release.py --release v3            # build + verify + save
    python migration/deploy/build-release.py --release v3 --dry-run  # print the plan only
    python migration/deploy/build-release.py --release v3 --only traverse-ingestion-service

Build box only. It refuses to run where Instrumental's postgres is visible (the VM),
and it refuses a dirty tree, because bundles ship `git archive HEAD` and uncommitted
work silently does not exist on the plant (UPDATE-RUNBOOK rule 2).

Everything heavy is delegated to the proven tools: build-prod-images.py for images,
scripts/build-flink-jar.ps1 (maven-in-docker) for the JAR. Archives are written by
Python's gzip, never through a PowerShell pipeline (rule 5).
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prodimages import (  # noqa: E402
    BUILD_SERVICES,
    DEPLOY_DIR,
    ENV_FILE,
    FLINK_JAR,
    PROJECT,
    REPO_ROOT,
    image_name,
    require_env_file,
    verify_app_images,
)

RELEASES_DIR = DEPLOY_DIR / "releases"
FLINK_SERVICES = {"flink-jobmanager", "flink-taskmanager"}


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


# Windows consoles default to cp1252; a stray non-ASCII byte must not abort a release.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")


def die(msg: str, rc: int = 1) -> int:
    sys.stderr.write(f"ERROR: {msg}\n")
    return rc


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


# ── manifest ────────────────────────────────────────────────────────────────
def read_manifest(release: str) -> list[str]:
    path = RELEASES_DIR / f"{release}.txt"
    if not path.is_file():
        known = sorted(p.stem for p in RELEASES_DIR.glob("*.txt"))
        sys.exit(f"no manifest {path} (known releases: {', '.join(known) or 'none'})")
    services: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line and line not in services:
            services.append(line)
    unknown = [s for s in services if s not in BUILD_SERVICES and s != "ams-api"]
    if unknown:
        sys.exit(f"{path.name}: unknown compose service(s) {unknown} - must be in prodimages.BUILD_SERVICES")
    return services


# ── guards ──────────────────────────────────────────────────────────────────
def on_plant_vm() -> bool:
    r = subprocess.run(["docker", "ps", "-a", "--format", "{{.Names}}"], capture_output=True, text=True)
    return "instrumental-postgres" in (r.stdout or "")


def git(*args: str) -> str:
    r = subprocess.run(["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


# ── steps ───────────────────────────────────────────────────────────────────
def build_flink_jar(dry_run: bool) -> None:
    """maven-in-docker, -Dmaven.test.skip=true (CHG-008 sec.2: -DskipTests still compiles
    the broken test and kills the build after `clean` removed the old jar)."""
    if os.name == "nt":
        argv = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", str(REPO_ROOT / "scripts" / "build-flink-jar.ps1")]
    else:
        argv = ["docker", "run", "--rm", "-v", f"{REPO_ROOT / 'src' / 'flink'}:/build", "-w", "/build",
                "maven:3.9-eclipse-temurin-11", "mvn", "-q", "package", "-Dmaven.test.skip=true"]
    log("flink jar: " + " ".join(argv))
    if dry_run:
        return
    if subprocess.call(argv) != 0 or not FLINK_JAR.is_file():
        sys.exit("Flink JAR build failed")


def build_service(svc: str, dry_run: bool) -> None:
    argv = [sys.executable, str(DEPLOY_DIR / "build-prod-images.py"), "--only", svc, "--skip-pull"]
    log("build: " + " ".join(argv))
    if dry_run:
        return
    if subprocess.call(argv) != 0:
        sys.exit(f"build failed for {svc}")


def verify(services: list[str]) -> list[tuple[str, str, str]]:
    rows = verify_app_images(services)
    bad = [svc for svc, _, kind in rows if kind != "PROD"]
    for svc, image, kind in rows:
        print(f"  {kind:6}  {svc:28}  {image}")
    if bad:
        sys.exit(f"refusing to save: not PROD -> {bad} (python migration/deploy/build-prod-images.py --verify-only)")
    return rows


def save_images(rows: list[tuple[str, str, str]], out: Path, dry_run: bool) -> list[Path]:
    """One gzipped archive per image (UPDATE-RUNBOOK sec.1 shape, so the VM-side
    `gunzip -c | docker load` is unchanged). Same image under two services is saved once."""
    saved: list[Path] = []
    seen: set[str] = set()
    for svc, image, _ in rows:
        if image in seen:
            continue
        seen.add(image)
        slug = image.replace("/", "_").replace(":", "_")
        tar = out / f"{slug}.tar"
        gz = out / f"{slug}.tar.gz"
        log(f"docker save {image} -> {gz.name}")
        if dry_run:
            saved.append(gz)
            continue
        if subprocess.call(["docker", "save", "-o", str(tar), image]) != 0:
            sys.exit(f"docker save failed for {image}")
        with tar.open("rb") as f_in, gzip.open(gz, "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        tar.unlink()
        saved.append(gz)
    return saved


def copy_jar(out: Path, dry_run: bool) -> Path:
    # cplm-api bind-mounts the jar for recompute and target/ is not in git, so it
    # travels beside the image (UPDATE-RUNBOOK sec.2 "three artifacts move together").
    dest = out / FLINK_JAR.name
    log(f"copy {FLINK_JAR.name} -> {dest.name}")
    if not dry_run:
        shutil.copy2(FLINK_JAR, dest)
    return dest


def write_sums(out: Path, files: list[Path]) -> None:
    sums = out / "SHA256SUMS.txt"
    with sums.open("w", encoding="utf-8", newline="\n") as fh:
        for p in files:
            if p.is_file():
                fh.write(f"{sha256_file(p)}  {p.name}\n")
    log(f"wrote {sums.name}")


def vm_steps(release: str, commit: str, rows: list[tuple[str, str, str]], has_flink: bool) -> str:
    images = []
    for _, image, _ in rows:
        if image not in images:
            images.append(image)
    loads = "\n".join(
        f"gunzip -c /tmp/{release}/{img.replace('/', '_').replace(':', '_')}.tar.gz | docker load" for img in images
    )
    flink = ""
    if has_flink:
        flink = f"""
# 4. Flink - three artifacts move together, and a RESTART DEPLOYS NOTHING (CHG-008 sec.1):
#    the HA JobManager resumes the previously submitted JobGraph and its jar blob.
cp /tmp/{release}/{FLINK_JAR.name} /opt/AMS-open/src/flink/target/{FLINK_JAR.name}
docker rm -f ams-flink-taskmanager ams-flink-jobmanager
bash migration/deploy/deploy.sh --prod 2>&1 | tail -8         # 04b resubmits every job
#    Then CANCEL + RESUBMIT the three CPLM jobs and confirm each start time moved:
#      curl -s http://localhost:8082/jobs | python3 -m json.tool          # ids
#      curl -X PATCH "http://localhost:8082/jobs/<id>?mode=cancel"       # each CPLM job
#      docker compose ... up flink-job-submit-cplm                       # resubmit
"""
    return f"""# {release} - VM steps (generated by build-release.py, commit {commit})
# Read changes_tracker.md "Deployment checklist" first: the MODE-map config fix goes
# BEFORE any binary, and it needs no deploy.

cd /opt/AMS-open
# 1. integrity - STOP on any mismatch
sha256sum -c /tmp/{release}/SHA256SUMS.txt
# 2. rollback point
docker images --no-trunc --format '{{{{.ID}}}} {{{{.Repository}}}}:{{{{.Tag}}}}' > /tmp/pre-{release}-images.txt
# 3. load
{loads}
{flink}
# 5. sync repo files that changed (compose/env/scripts/fixtures) - rule 1: the repo is the truth
#    then recreate only what changed:
bash migration/deploy/deploy.sh --prod 2>&1 | tail -8
#    compose rename trap: if 'traverse-ingestion-service' name-conflicts,
#    docker rm -f traverse-ingestion-service first (~30 s pause, QoS-1 session covers it)

# 6. post-update checks (UPDATE-RUNBOOK sec.1 table) - for {release} specifically:
#    traverse-ingestion-service  logs: 'effective param_roles ... VP->vp'; /api/ingestion/stats paramRoles.VP == vp
#    cplm-api                    consumer groups traverse-cpa-cplm-results (+-frames) have ONE member each
#    historian-bff               GET /api/hist/raw/cursor ... maxCount=10000 -> 200, count 9999, hasMore true
#    flink                       each CPLM job's start-time moved; 4 x RUNNING in the deploy tail
#    ams-frontend                200 on /, users Ctrl+F5
#    then: docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < scripts/diagnose-gate-failures.sql
"""


# ── main ────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--release", required=True, help="manifest name under migration/deploy/releases/")
    parser.add_argument("--only", action="append", metavar="SERVICE",
                        help="restrict to these manifest services (repeatable)")
    parser.add_argument("--out", type=Path, help="output dir (default release-out/<release>-<date>)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan; build/save nothing")
    parser.add_argument("--skip-build", action="store_true", help="verify + save existing images only")
    parser.add_argument("--skip-jar", action="store_true", help="do not rebuild the Flink JAR")
    parser.add_argument("--allow-dirty", action="store_true", help="DANGEROUS: skip the clean-tree check")
    args = parser.parse_args()

    services = read_manifest(args.release)
    if args.only:
        missing = [s for s in args.only if s not in services]
        if missing:
            return die(f"--only {missing} not in manifest {args.release}: {services}")
        services = [s for s in services if s in args.only]

    if on_plant_vm():
        return die("Instrumental's postgres is visible - this is the plant VM. Never build here (rule 3).")
    require_env_file()
    dirty = git("status", "--porcelain")
    if dirty and not args.allow_dirty:
        return die("working tree is dirty - commit first (bundles ship `git archive HEAD`, rule 2):\n" + dirty)
    commit = git("rev-parse", "--short", "HEAD")
    os.environ.setdefault("COMPOSE_PROJECT_NAME", PROJECT)
    os.environ.setdefault("DOCKER_DEFAULT_PLATFORM", "linux/amd64")
    os.environ.setdefault("START_AMS_API", "yes")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    out = (args.out or REPO_ROOT / "release-out" / f"{args.release}-{stamp}").resolve()
    has_flink = any(s in FLINK_SERVICES for s in services)

    log(f"release {args.release} @ {commit}  project={PROJECT}  env={ENV_FILE}")
    log(f"services: {', '.join(services)}")
    log(f"images:   {', '.join(dict.fromkeys(image_name(s) for s in services))}")
    log(f"out:      {out}" + ("  (dry run)" if args.dry_run else ""))
    if dirty:
        log("WARNING: --allow-dirty - this is NOT a plant release")

    if not args.skip_build:
        if has_flink and not args.skip_jar:
            build_flink_jar(args.dry_run)
        for svc in services:
            build_service(svc, args.dry_run)

    log("verify (every image must fingerprint PROD)")
    if args.dry_run:
        rows = [(s, image_name(s), "?") for s in services]
        for svc, image, kind in rows:
            print(f"  {kind:6}  {svc:28}  {image}")
    else:
        rows = verify(services)
        out.mkdir(parents=True, exist_ok=True)

    files = save_images(rows, out, args.dry_run)
    if has_flink:
        files.append(copy_jar(out, args.dry_run))

    steps = vm_steps(args.release, commit, rows, has_flink)
    if not args.dry_run:
        (out / "VM-STEPS.md").write_text(steps, encoding="utf-8", newline="\n")
        write_sums(out, files)
        log(f"done -> {out}")
    print("\n" + steps)
    return 0


if __name__ == "__main__":
    sys.exit(main())
