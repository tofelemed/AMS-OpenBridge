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
    "scripts/cpm-04-fleet-latest-indexes.sql",     # CHG-023     - fleet indexes, run BEFORE the cplm-api image swap
    "scripts/cpm-05-gate-results-retention-check.sql",  # CHG-023 - read-only facts for the retention decision (P1-4)
    "scripts/cpm-06-fleet-perf-probe.sql",         # CHG-023     - BEFORE/AFTER proof of the fleet read path
    "scripts/cpm-07-v25-schema.sql",               # v2.5        - 53..58 merged: identity, evidence, response, health, loop model, config (BEFORE the swap)
    "scripts/cpm-07b-v25-result-key.sql",          # v2.5        - the result unique keys gain bundle_hash (cplm-api STOPPED, after cpm-07)
    "scripts/cpm-08-v25-permissions.sql",          # v2.5        - traverse_auth: the new cpm.* permissions + role grants
    "scripts/cpm-09-event-shelving.sql",           # CHG-032     - episode shelving lifecycle + action history (BEFORE the cplm-api swap)
    "scripts/cpm-10a-episode-evidence.sql",        # CHG-033     - episode capture ledger + EPISODE class (online, BEFORE the cplm-api swap)
    "scripts/cpm-10b-result-partitions.sql",       # CHG-033     - the three result tables as daily partitions (cplm-api STOPPED, after the 24 h measurement)
    "scripts/set-quality-protocol.py",             # v2.5        - declare quality_protocol on every MQTT_LOOP_SAMPLES source
    "migration/kafka/topics.txt",                  # v2.5        - the 8 new topics (reference copy; 04 reads the extracted tree's)
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
    unknown_flags = flags - {"data-load", "v25-upgrade", "v26-retention"}
    if unknown_flags:
        sys.exit(f"{path.name}: unknown directive(s) {sorted(unknown_flags)} - only !data-load, !v25-upgrade and !v26-retention are defined")
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


def make_source_archive(out: Path, commit: str, dry_run: bool) -> Path:
    """`git archive HEAD` as src-<commit>.tar.gz beside the images (v2.5 pre-prod gap G1).

    The VM runs 04-create-kafka-topics.sh, 04b-submit-flink-jobs.sh and deploy.sh from
    /opt/AMS-open, and compose reads infra/docker/docker-compose.yml plus the marun overlay
    from there. A release that only ships images leaves those copies at the previous
    release: v2.5's topic list, the seven-job submitter and CPLM_GATE_CONFIG_KEY on the
    Flink containers all live in files, not images. The archive is 1,700 tracked files
    (~10 MB); migration/.env is untracked and therefore never inside it.
    """
    dest = out / f"src-{commit}.tar.gz"
    log(f"git archive HEAD -> {dest.name}")
    if dry_run:
        return dest
    # -c core.autocrlf=false: this build box checks out with autocrlf=true, and `git archive` applies the same
    # conversion to every file without an explicit eol attribute (topics.txt, the ops SQL, the log4j properties
    # all came out CRLF). The plant must get the repo's LF blobs - rule 1, the repo is the truth.
    r = subprocess.run(["git", "-C", str(REPO_ROOT), "-c", "core.autocrlf=false", "archive", "--format=tar", "HEAD"],
                       capture_output=True)
    if r.returncode != 0 or not r.stdout:
        sys.exit(f"git archive failed: {r.stderr.decode(errors='replace').strip()}")
    with gzip.open(dest, "wb", compresslevel=6) as fh:
        fh.write(r.stdout)
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
        "consumer groups traverse-cpa-cplm-results (+-frames, -evidence, -response, -conditions, -health,\n"
        "#                                -config-acks) have ONE member each (GET /api/v1/cpm/health lists them);\n"
        "#                                GET /api/v1/cpm/capabilities -> engine.observed[0].jarSha256 == the new jar,\n"
        "#                                methods: 17 INSTALLED; GET /api/v1/cpm/gate-catalogue -> count 17",
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
        "#                                Do NOT grep the logs for 'wrote N samples' - ams-api merges the\n"
        "#                                x-kafka anchor, so the plant's SERVICE_LOG_LEVEL=Error suppresses\n"
        "#                                that LogInformation and the grep reads 0 on a healthy service.\n"
        "#                                Prove liveness from Kafka instead (small, non-growing LAG):\n"
        "#                                  docker exec instrumental-kafka-1 kafka-consumer-groups \\\n"
        "#                                    --bootstrap-server kafka-1:9092 \\\n"
        "#                                    --group traverse-cpa-iotdb-raw-loop --describe\n"
        "#                                CHG-020 makes growing lag the CORRECT signal that IoTDB is\n"
        "#                                refusing writes - samples are held in Kafka, not discarded.\n"
        "#                                The stall log does survive Error level, and should be empty:\n"
        "#                                  docker logs --since 15m ams-api 2>&1 | grep -i 'rejecting every write'",
}


def vm_steps(release: str, commit: str, rows: list[tuple[str, str, str]],
             has_flink: bool, services: list[str], data_load: bool, v25: bool = False, v26: bool = False) -> str:
    images = []
    for _, image, _ in rows:
        if image not in images:
            images.append(image)
    loads = "\n".join(
        f"gunzip -c /tmp/{release}/{img.replace('/', '_').replace(':', '_')}.tar.gz | docker load" for img in images
    )
    # ams-api is profile-gated. Every deploy.sh call in this file must carry the env or
    # compose silently leaves the old container running - and it is the only writer of
    # the loop historian, so the no-op is invisible until a trend goes missing. The plant
    # runs ams-api since Phase 10, so a v2.5 upgrade carries it whether or not the image
    # ships. 04b runs from deploy.sh only under ALLOW_FLINK_SUBMIT=yes (pre-prod gap G6).
    exports: list[str] = []
    if "ams-api" in services or v25:
        exports.append("START_AMS_API=yes")
    if has_flink:
        exports.append("ALLOW_FLINK_SUBMIT=yes")
    if v25:
        # 04 is --if-not-exists, so re-running it is free; with the flag deploy.sh's final 05-validate runs
        # --require-kafka and the new topics are a hard check at the moment of proof, not a warning.
        exports.append("ALLOW_CREATE_PREFIXED_TOPICS=yes")
    ams_api_env = ""
    if exports:
        ams_api_env = (f"export {' '.join(exports)}   # REQUIRED: ams-api is behind profiles:[cpa-ams-api] "
                       "(compose skips it otherwise); 04b submits jobs only under ALLOW_FLINK_SUBMIT\n")
    job_count = "SEVEN" if (v25 or v26) else "FOUR"
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
#    submit_if_missing, so with the old JobManager still up it prints [OK] for every job
#    while they keep executing the OLD jar. Removing both containers is mandatory.
cp /tmp/{release}/{FLINK_JAR.name} /opt/AMS-open/src/flink/target/{FLINK_JAR.name}
docker rm -f ams-flink-taskmanager ams-flink-jobmanager
{ams_api_env}bash migration/deploy/deploy.sh --prod 2>&1 | tail -8          # 04b resubmits all {job_count} jobs
docker exec ams-flink-jobmanager flink list -m localhost:8081  # {"7 x RUNNING (4 + Condition, Instrument Context, Response)" if (v25 or v26) else "4 x RUNNING"}, start times = now
#
#    Do NOT run `compose up flink-job-submit-cplm` here: that service is profiled
#    lab-alarm and is absent from the cpa profile. On Marun 04b is the only submit path.
#    COST: no HA and no `-s <savepoint>` means the jobs return with FRESH window state.
#    Short windows rebuild within the hour; 12h/24h verdicts need up to a full day.
"""
        if v25:
            flink += """#    v2.5: the JM/TM containers are recreated by deploy.sh from the compose that now carries
#    CPLM_GATE_CONFIG_KEY (= TRAVERSE_SERVICE_KEY). Prove it BEFORE trusting any deployment:
docker exec ams-flink-taskmanager sh -c 'test -n "$CPLM_GATE_CONFIG_KEY" && echo key-present || echo KEY-MISSING'
#    KEY-MISSING = every gate-config bundle is NACKed UNSIGNED (the jobs run the factory layer; nothing breaks,
#    but no configuration can ever be activated). 04b submits the SIX CPLM jobs + Live RBE; each CPLM job
#    announces its CAPABILITY on traverse.cpa.context.gate-config.acks.v1 at start:
#      GET /api/v1/cpm/capabilities -> config.state ANNOUNCED, config.workers 6, config.jarSha256s == [the new jar]
"""
        if v26:
            flink += f"""#    v2.6.1: the Short job takes CPLM_SHORT_PARALLELISM from .env (patch 2) and its own evidence switch (default none);
#    the switches were written in step 4a, BEFORE this resubmission:
docker exec ams-flink-jobmanager curl -s localhost:8081/overview | grep -o '"slots-available":[0-9]*'   # 6: 16 slots, seven jobs, the Short job on 4
grep ams-flink /tmp/{release}/SHA256SUMS.txt | cut -c1-16                                              # the jar every worker must announce (GET /api/v1/cpm/capabilities: config.jarSha256s)
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
    v25_block = ""
    v25_config_block = ""
    if v25:
        v25_block = f"""
# 4a. v2.5 source tree - BEFORE any script or compose step below runs from /opt/AMS-open (pre-prod gap G1):
#    the topic list (04), the seven-job submitter (04b), the validator (05) and both compose files (base +
#    marun overlay, which carry CPLM_GATE_CONFIG_KEY on JM/TM) are files, not images. migration/.env is
#    untracked, so it is not in the archive and survives the extraction. The checkout must be clean first:
#    a locally patched file would be overwritten silently (MARUN-CONTEXT rule 1 - patch the repo, not the VM).
git -C /opt/AMS-open status --porcelain 2>/dev/null || echo "NOT A GIT CHECKOUT - local edits cannot be detected; confirm nobody has patched files on the VM (MARUN-CONTEXT rule 1) before extracting"   # git repo: must print nothing
cp /opt/AMS-open/migration/.env /tmp/{release}/env-backup-$(date +%Y%m%d%H%M)   # belt and braces
tar -xzf /tmp/{release}/src-{commit}.tar.gz -C /opt/AMS-open
echo {commit} > /opt/AMS-open/RELEASE-COMMIT                            # provenance: the tree now IS this commit
grep -c CPLM_GATE_CONFIG_KEY migration/deploy/docker-compose.marun.yml   # 2 (JM + TM)
grep -c submit_if_missing migration/04b-submit-flink-jobs.sh             # >= 8 (7 jobs + the function)
# 4b. v2.5 schema + permissions - ALL BEFORE the image swap (additive, re-runnable):
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-07-v25-schema.sql
#    cpm-07b swaps the result unique keys (old key -> key + bundle_hash). The OLD consumer needs the old key and the
#    NEW one the new key, so it runs with cplm-api STOPPED (plain index builds: seconds at plant size); the new image
#    starts in step 6 within the same minute. Results queue in Kafka meanwhile - nothing is lost.
docker stop traverse-cplm-api
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-07b-v25-result-key.sql
docker exec -i instrumental-postgres psql -U postgres -d traverse_auth -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-08-v25-permissions.sql
#    CHG-032 shelving lifecycle (additive; converts legacy ack_state = SHELVED rows; re-runnable):
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-09-event-shelving.sql
#    the files above ran as postgres, so the new tables are postgres-owned - the go-live 42501 bug: cplm-api's
#    self-heal DDL (ALTER TABLE / CREATE INDEX IF NOT EXISTS) fails on them and its consumers never join (gap G2).
#    02 sentinel-skips every DDL file and runs normalize_ownership on all five databases:
bash migration/02-apply-schemas.sh
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select count(*) from pg_tables where schemaname in ('analytics','cpm') and tableowner<>'ams_user'"   # 0
#    prove the schema landed before touching an image:
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select count(*) from information_schema.tables where table_schema in ('analytics','cpm') and table_name in ('analysis_run','evidence_manifest','response_event','gate_config_bundle','config_worker_capability','instrument_health_observation','condition_event','investigation_reference')"  # 8
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select count(*) from analytics.cplm_event_frames where ack_state='SHELVED'"   # 0 after the cpm-09 conversion
# 4b2. evidence retention - measured at 161 loops: 336k-361k manifests and 0.6-0.7 GB of chunk bytes PER DAY. The
#    shipped STANDARD class is 90 d (~60 GB of Postgres on this 87 GB shared disk). 7 d keeps a week of drill-down;
#    the sweeper expires daily (chunks gone, row kept 7 more days so a reader is told EVIDENCE_EXPIRED) then purges.
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "UPDATE analytics.retention_policy SET days = 7 WHERE record_class = 'STANDARD'"
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select record_class, days from analytics.retention_policy"   # STANDARD|7 and PINNED|
# 4c. the 8 new topics, BEFORE the jobs start (idempotent --if-not-exists; samples / gate-results topics untouched):
ALLOW_CREATE_PREFIXED_TOPICS=yes bash migration/04-create-kafka-topics.sh
docker exec instrumental-kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --list | grep -c 'traverse.cpa'   # 15 (+ any traverse.cpa.cplm.replay.* left by recompute runs)
#    the topics that already existed keep their OLD retention (04 only creates): apply the minimum-retention list
#    (samples 12 h, feature / evidence streams 6 h, record-bearing topics 3 d, live metrics 1 h; compacted untouched)
bash migration/04c-apply-topic-retention.sh --dry-run                    # read the commands first
ALLOW_CREATE_PREFIXED_TOPICS=yes bash migration/04c-apply-topic-retention.sh
docker exec instrumental-kafka-1 kafka-configs --bootstrap-server kafka-1:9092 --describe --entity-type topics --entity-name traverse.cpa.loop.samples.v1 | grep -o 'retention.ms=[0-9]*'   # 43200000
"""
        v25_config_block = f"""
# 6b. v2.5 configuration, AFTER the new ingestion image is up (it validates the field; the old one only stored it):
#    declare the quality protocol on every loop data source (read-modify-write, keeps the TLS cert and the MODE map)
export ADMIN_PW='...'
python3 /tmp/{release}/ops/set-quality-protocol.py            # dry run
python3 /tmp/{release}/ops/set-quality-protocol.py --apply
"""
    v26_block = ""
    v26_post_block = ""
    if v26:
        # the .env switches: BEFORE step 5 when the Flink image ships (step 5 resubmits every job with the new 04b),
        # otherwise in 6c together with the cancel / resubmit of the three emitters
        v26_env = f"""#    migration/.env - set NOW, before step 5 (04b reads them at submit time): the long tier and fusion emit again, the
#    Short job's own switch stays unset (= none), the Short job runs on four slots (patch 2):
grep -q '^CPLM_EVIDENCE_EMIT=' migration/.env && sed -i 's/^CPLM_EVIDENCE_EMIT=.*/CPLM_EVIDENCE_EMIT=episodes/' migration/.env || echo 'CPLM_EVIDENCE_EMIT=episodes' >> migration/.env
grep -q '^CPLM_SHORT_PARALLELISM=' migration/.env || echo 'CPLM_SHORT_PARALLELISM=4' >> migration/.env
grep -E '^CPLM_(EVIDENCE_EMIT|SHORT_PARALLELISM|SHORT_EVIDENCE_EMIT)=' migration/.env   # exactly CPLM_EVIDENCE_EMIT=episodes and CPLM_SHORT_PARALLELISM=4
"""
        v26_resubmit = """#    the jobs were resubmitted by step 5 with the new 04b and the .env switches from 4a: nothing to cancel here
""" if has_flink else """#    migration/.env: CPLM_EVIDENCE_EMIT=episodes (the interim none goes); leave CPLM_SHORT_EVIDENCE_EMIT unset (= none).
#    Only the three emitters take the new arguments: cancel them by id, then 04b resubmits what is missing.
docker exec ams-flink-jobmanager flink list -m localhost:8081 | grep -E 'Short Feature|Long Diagnostics|Gate Fusion'   # note the 3 ids
docker exec ams-flink-jobmanager flink cancel -m localhost:8081 <id>    # x3
ALLOW_FLINK_SUBMIT=yes bash migration/04b-submit-flink-jobs.sh
"""
        v26_block = f"""
# 4a. v2.6 source tree - BEFORE anything below runs from /opt/AMS-open: the Short job's evidence switch (04b),
#    the cron drop-in and stub-04b.sh are files, not images (review finding 1: without this overlay the plant
#    resubmits the OLD 04b with short-tier evidence ON). migration/.env is untracked and survives the extraction.
git -C /opt/AMS-open status --porcelain 2>/dev/null || echo "NOT A GIT CHECKOUT - confirm nobody has patched files on the VM (MARUN-CONTEXT rule 1) before extracting"
cp /opt/AMS-open/migration/.env /tmp/{release}/env-backup-$(date +%Y%m%d%H%M)   # belt and braces
tar -xzf /tmp/{release}/src-{commit}.tar.gz -C /opt/AMS-open
echo {commit} > /opt/AMS-open/RELEASE-COMMIT                            # provenance: the tree now IS this commit
grep -c CPLM_SHORT_EVIDENCE_EMIT migration/04b-submit-flink-jobs.sh      # >= 1: the new 04b
grep -c '^[^#].*prune-short-features' migration/cron.d/cpa-capacity      # 0: the new drop-in has no prune line
{v26_env if has_flink else ""}# 4d. CHG-033 schema - online, additive, BEFORE the image swap (the capture ledger, capture_count, EPISODE = 90 d):
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-10a-episode-evidence.sql
bash migration/02-apply-schemas.sh                                       # ownership -> ams_user (the go-live 42501 trap)
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select count(*) from pg_tables where schemaname in ('analytics','cpm') and tableowner<>'ams_user'"   # 0
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select record_class||'|'||coalesce(days::text,'') from analytics.retention_policy order by 1"   # EPISODE|90 among them
"""
        v26_post_block = f"""
# 6c. CHG-033 - evidence back on with the short tier off, then measure, THEN partition:
#    within 15 min the log shows the sweep's own line; the classes are visible at once:
docker logs --since 20m traverse-cplm-api 2>&1 | grep -m1 'Evidence retention:'
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "select retention_class, count(*), pg_size_pretty(sum(total_bytes)) from analytics.evidence_manifest group by 1"
{v26_resubmit}#    proof after 15 min - G5 and up only, no G0-G4:
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "select gate_id, count(*) from analytics.evidence_manifest where created_at > now() - interval '15 min' group by 1 order by 1"
#    MEASURE hourly for 24 h (the class query above; the five tables; df -h /). Kill switch: CPLM_EVIDENCE_EMIT=none + the
#    cancel/resubmit again. Headroom rule: the projected plateau must stay >= 10 GB below the free space - otherwise
#    lower GATE_RESULTS (and/or SHORT_FEATURES) BEFORE partitioning. The row does not exist until cpm-10b, so it is
#    created here when missing and cpm-10b's ON CONFLICT DO NOTHING then keeps this value (only if the rule says so):
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "INSERT INTO analytics.retention_policy (record_class, days) VALUES ('GATE_RESULTS', 14) ON CONFLICT (record_class) DO UPDATE SET days = EXCLUDED.days"
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "select relname, pg_size_pretty(pg_total_relation_size('analytics.'||relname)) from pg_class where relname in ('cplm_short_feature_results','cplm_long_feature_results','cplm_gate_results','evidence_manifest','evidence_chunk') order by 1"
# 6d. CHG-033 - the three result tables become daily partitions (cplm-api STOPPED; >= 20 GB free; minutes):
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm < /tmp/{release}/ops/cpm-06-fleet-perf-probe.sql | tail -5   # BEFORE
docker stop traverse-cplm-api
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-10b-result-partitions.sql
docker start traverse-cplm-api
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm < /tmp/{release}/ops/cpm-06-fleet-perf-probe.sql | tail -5   # AFTER, same order of magnitude
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select relname||' '||relkind::text from pg_class where relname in ('cplm_short_feature_results','cplm_long_feature_results','cplm_gate_results')"   # 3 x p
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select count(*) from analytics.cplm_short_feature_results_default"   # 0
docker logs --since 5m traverse-cplm-api 2>&1 | grep -E 'Partitions|schema ensured' | tail -3
#    the interim cron line goes (retention is the partitions now); cap-iotdb-logs.sh stays:
sudo cp migration/cron.d/cpa-capacity /etc/cron.d/cpa-capacity && grep -c '^[^#].*prune-short-features' /etc/cron.d/cpa-capacity   # 0 (the comment line does not count)
#    next day: the oldest partition is gone and df moved.
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
    post = dict(POST_CHECKS)
    if v26:
        post["flink-jobmanager"] = """7 x RUNNING and every start time moved (step 5); slots-available 6 (the Short job on 4);
#                                every worker announces the bundle's jar (capabilities)"""
    if v25:
        post["flink-jobmanager"] = ("7 x RUNNING (Short, Long, Fusion, Condition, Instrument Context, Response, Live RBE) and every\n"
                                    "#                                start time moved (step 5); TaskManager env carries CPLM_GATE_CONFIG_KEY")
    checks = "\n".join(
        f"#    {svc:<27} {post[svc]}" for svc in services if svc in post
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
# 3. disk headroom - this host has filled four times; a load with no room corrupts more
#    than it deploys. Want >= 20 GB free before starting.
df -h /
{v25_block}{v26_block}
# 4. load
{loads}
{flink}
# 6. sync repo files that changed (compose/env/scripts) - rule 1: the repo is the truth
#    then recreate only what changed:
{ams_api_env}bash migration/deploy/deploy.sh --prod 2>&1 | tail -8{rename_trap}
{v25_config_block}{v26_post_block}{data_block}
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
    files.append(make_source_archive(out, commit, args.dry_run))

    steps = vm_steps(args.release, commit, rows, has_flink, services, "data-load" in flags, "v25-upgrade" in flags,
                     "v26-retention" in flags)
    if not args.dry_run:
        (out / "VM-STEPS.md").write_text(steps, encoding="utf-8", newline="\n")
        write_sums(out, files)
        log(f"done -> {out}")
    print("\n" + steps)
    return 0


if __name__ == "__main__":
    sys.exit(main())
