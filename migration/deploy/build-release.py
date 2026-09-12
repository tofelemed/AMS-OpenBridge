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
    harden_stdio,
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

# Plant-side files that live in no image. Without them a release deploys but cannot
# finish its own checklist: the MODE-map restore is step 1 (the one that actually
# unblocks the fleet) and the two CPM scripts are steps 9-10. They travel under ops/.
# Nothing can be fetched from the air-gapped VM later, so a missing one is fatal here.
OPS_FILES = [
    "scripts/set-mode-map.py",                     # checklist 1  - restore mode_value_map
    "scripts/diagnose-gate-failures.sql",          # checklist 2  - and the post-deploy proof
    "scripts/cpm-01-onboard-missing-loops.sql",    # checklist 9  - 14 loops + 56 tag rows
    "scripts/cpm-02-load-engineering-ranges.sql",  # checklist 10 - 171 engineering ranges
]


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


harden_stdio()


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
def read_manifest(release: str) -> tuple[list[str], set[str]]:
    """Services, plus any `!flag` directives. Returns (services, flags).

    The only flag so far is `!data-load`, which asks for the MODE-map restore and the
    CPM onboarding/ranges scripts in VM-STEPS.md. It is opt-in because those are
    one-time fleet actions, not per-release ones: emitting them unconditionally told
    the operator of an ams-api-only bundle to re-run the v3 data load and republish
    171 loops, none of which that release touches.
    """
    path = RELEASES_DIR / f"{release}.txt"
    if not path.is_file():
        known = sorted(p.stem for p in RELEASES_DIR.glob("*.txt"))
        sys.exit(f"no manifest {path} (known releases: {', '.join(known) or 'none'})")
    services: list[str] = []
    flags: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("!"):
            flags.add(line[1:].strip())
            continue
        if line not in services:
            services.append(line)
    unknown = [s for s in services if s not in BUILD_SERVICES and s != "ams-api"]
    if unknown:
        sys.exit(f"{path.name}: unknown compose service(s) {unknown} - must be in prodimages.BUILD_SERVICES")
    unknown_flags = flags - {"data-load"}
    if unknown_flags:
        sys.exit(f"{path.name}: unknown directive(s) {sorted(unknown_flags)} - only !data-load is defined")
    return services, flags


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


def copy_ops_files(out: Path, dry_run: bool) -> list[Path]:
    """SQL and operator scripts the deployment checklist needs on the VM."""
    copied: list[Path] = []
    for rel in OPS_FILES:
        src = REPO_ROOT / rel
        if not src.is_file():
            sys.exit(f"ops file missing from the repo: {rel}")
        dest = out / "ops" / src.name
        log(f"copy {rel} -> ops/{src.name}")
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
        copied.append(dest)
    return copied


def write_sums(out: Path, files: list[Path]) -> None:
    # Paths are RELATIVE TO THE RELEASE DIR, not bare names: `sha256sum -c` resolves
    # each path against the CWD, so ops/<file> only verifies when the operator runs it
    # from inside the release directory -- which is what VM-STEPS step 1 now does.
    sums = out / "SHA256SUMS.txt"
    with sums.open("w", encoding="utf-8", newline="\n") as fh:
        for p in files:
            if p.is_file():
                fh.write(f"{sha256_file(p)}  {p.relative_to(out).as_posix()}\n")
    log(f"wrote {sums.name}")


#: post-update check per compose service, emitted only for services the release ships.
POST_CHECKS: dict[str, str] = {
    "traverse-ingestion-service":
        'GET /api/ingestion/stats -> paramRoles.VP == "vp"\n'
        "#                                (NOT the startup log - plant runs SERVICE_LOG_LEVEL=Error)",
    "cplm-api":
        "consumer groups traverse-cpa-cplm-results (+-frames) have ONE member each",
    "historian-bff":
        "GET /api/hist/raw/cursor ... maxCount=10000 -> 200, count 9999, hasMore true",
    "flink-jobmanager":
        "4 x RUNNING and every start time moved (step 5)",
    "ams-frontend":
        "200 on /, users Ctrl+F5",
    "ams-api":
        "container RECREATED, not just re-imaged - ams-api sits behind\n"
        "#                                profiles: [cpa-ams-api] and deploy.sh adds it only when\n"
        "#                                START_AMS_API=yes, so without that env compose loads the new\n"
        "#                                image and leaves the OLD container running, reporting success:\n"
        "#                                  docker inspect -f '{{.Created}} {{.Image}}' ams-api\n"
        "#                                then confirm the historian is still writing:\n"
        "#                                  docker logs --since 5m ams-api | grep -c 'wrote .* samples'",
}


def vm_steps(release: str, commit: str, rows: list[tuple[str, str, str]],
             has_flink: bool, services: list[str], data_load: bool) -> str:
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
# 5. Flink - the image, the JAR FILE and a job RESUBMISSION move together.
#
#    Marun has NO ZooKeeper HA: the marun overlay replaces FLINK_PROPERTIES with
#    RocksDB + MinIO checkpoints only. So CHG-008 sec.1's trap ("the HA JobManager
#    resumes the previous JobGraph and its jar blob") is a LAB behaviour and does not
#    apply here - removing the JobManager really does destroy every job.
#    The trap that DOES apply is the mirror image: 04b-submit-flink-jobs.sh uses
#    submit_if_missing, so with the old JobManager still up it prints [OK] for all four
#    jobs while they keep executing the OLD jar. Removing both containers is mandatory.
cp /tmp/{release}/{FLINK_JAR.name} /opt/AMS-open/src/flink/target/{FLINK_JAR.name}
docker rm -f ams-flink-taskmanager ams-flink-jobmanager
bash migration/deploy/deploy.sh --prod 2>&1 | tail -8          # 04b resubmits all FOUR jobs
docker exec ams-flink-jobmanager flink list -m localhost:8081  # 4 x RUNNING, start times = now
#
#    Do NOT run `compose up flink-job-submit-cplm` here: that service is profiled
#    lab-alarm and is absent from the cpa profile. On Marun 04b is the only submit path.
#    COST: no HA and no `-s <savepoint>` means the jobs return with FRESH window state.
#    Short windows rebuild within the hour; 12h/24h verdicts need up to a full day.
"""
    ops_block = "\n".join(f"#      ops/{Path(o).name}" for o in OPS_FILES)
    header = f"""# {release} - VM steps (generated by build-release.py, commit {commit})
#
# Ships: {', '.join(services)}
# Read changes_tracker.md "Deployment checklist" first.
#
# Step numbers are fixed across releases so cross-references keep working; a gap means
# that step does not apply here (5 = Flink, 7 = CPM data load), not that it is missing."""
    mode_map = ""
    if data_load:
        header += """
#
# Step 0 below needs no deploy at all and is the one that unblocks the fleet - do it,
# confirm it, and only then decide whether the binaries are urgent."""
        mode_map = f"""
# 0. Restore the MODE map on every MQTT_LOOP_SAMPLES data source (checklist 1-2).
#    Read-modify-write via the API: the wizard cannot set it, and a hand-written
#    profileConfig would drop the TLS ca_cert_pem (CHG-012).
export ADMIN_PW='...'
python3 /tmp/{release}/ops/set-mode-map.py            # dry run - shows what is stored now
python3 /tmp/{release}/ops/set-mode-map.py --apply
#    Confirm within ~2 min - tuples must carry AUT/MAN/CAS, not raw 1/2:
docker exec instrumental-kafka-1 kafka-console-consumer --bootstrap-server kafka-1:9092 --topic traverse.cpa.loop.samples.v1 --max-messages 5 --timeout-ms 30000 2>/dev/null | grep -o '"mode":"[A-Z]*"' | sort | uniq -c
#    Until the new frontend is deployed nobody may edit these sources in the wizard:
#    a save re-deletes loop_ingest, including the map you just restored (CHG-012).
"""
    data_block = ""
    if data_load:
        data_block = f"""
# 7. CPM data load (checklist 9-11) - pgAdmin against traverse_cplm, IN THIS ORDER:
{ops_block}
#    cpm-01 first (14 loops + 56 tag rows), then cpm-02 (171 ranges). Run cpm-02 once
#    with COMMIT changed to ROLLBACK and read the Messages tab: confirm TIC10704 (OP
#    3..5) and TIC30304 (OP 100..155) against the DCS - a wrong OP range blocks the
#    diagnosis outright, which is worse than leaving it undeclared.
#    THEN republish, or both scripts are invisible to the engine and the UNS:
#      POST /api/v1/cpm/loops/{{loopId}}/republish-evidence   for every touched loop
#    Pace it: the gateway allows 120 mutations/min GLOBALLY, so sleep 0.5 between
#    calls, log '<id> <code>', and mop up non-200s (the endpoint is idempotent).
#    Tokens expire in 1 h - check ${{#TOKEN}} before starting.
"""
    checks = "\n".join(
        f"#    {svc:<27} {POST_CHECKS[svc]}" for svc in services if svc in POST_CHECKS
    )
    rename_trap = ""
    if "traverse-ingestion-service" in services:
        rename_trap = ("\n#    compose rename trap: if 'traverse-ingestion-service' name-conflicts,\n"
                       "#    docker rm -f traverse-ingestion-service first "
                       "(~30 s pause, QoS-1 session covers it)")
    return f"""{header}
{mode_map}
# 1. integrity - run it FROM the release dir; sha256sum resolves paths against the CWD
cd /tmp/{release} && sha256sum -c SHA256SUMS.txt && cd /opt/AMS-open
# 2. rollback point
docker images --no-trunc --format '{{{{.ID}}}} {{{{.Repository}}}}:{{{{.Tag}}}}' > /tmp/pre-{release}-images.txt
# 3. disk headroom - this host has filled three times; a load with no room corrupts more
#    than it deploys. Want several GB free before starting.
df -h /
# 4. load
{loads}
{flink}
# 6. sync repo files that changed (compose/env/scripts) - rule 1: the repo is the truth
#    then recreate only what changed:
bash migration/deploy/deploy.sh --prod 2>&1 | tail -8{rename_trap}
{data_block}
# 8. post-update checks (UPDATE-RUNBOOK sec.1 table) - for {release} specifically:
{checks}
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

    services, flags = read_manifest(args.release)
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
    files.extend(copy_ops_files(out, args.dry_run))

    steps = vm_steps(args.release, commit, rows, has_flink, services, "data-load" in flags)
    if not args.dry_run:
        (out / "VM-STEPS.md").write_text(steps, encoding="utf-8", newline="\n")
        write_sums(out, files)
        log(f"done -> {out}")
    print("\n" + steps)
    return 0


if __name__ == "__main__":
    sys.exit(main())
