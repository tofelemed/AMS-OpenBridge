# CPA Prod Deploy Runbook — build box → Marun VM (air-gapped)

One page, in order, copy-paste. Scope: CPA-only cut (20 services, `--profile cpa`),
reusing Instrumental's Postgres + Kafka. Background: [OFFLINE_DEPLOYMENT_GUIDE.md](OFFLINE_DEPLOYMENT_GUIDE.md),
[migration.md](migration.md), audit: [docs/pre-prod/cpa-offline-audit.md](../docs/pre-prod/cpa-offline-audit.md).

---

## 0. Prerequisites (once)

**Build box (this Windows machine):** Docker Desktop running; internet to npm registry,
**github.com** (bcrypt binary), nuget.org, Maven Central, Docker Hub, mcr.microsoft.com.

**VM (`lean@192.168.190.91`):** ≥ 25 GB free on `/` (prune + LVM extend first);
ports 8081, 8090, 18083, 8082, 9249, 9250 free; Instrumental stack up; ops sign-off
pending for step 6.

---

## 1. Build + verify + bundle (build box, PowerShell)

```powershell
cd D:\HMI_Project_Usama\AMS-open
git status --short          # MUST be empty — the bundle ships HEAD, not the working tree

$env:DOCKER_DEFAULT_PLATFORM = "linux/amd64"     # VM is amd64
$env:COMPOSE_PROJECT_NAME    = "ams-cpa"         # image names derive from this
if (-not (Test-Path migration\.env)) { Copy-Item migration\.env.example migration\.env }  # CHANGE_ME is fine here

# Flink JAR must exist: src\flink\target\ams-flink-1.0-SNAPSHOT.jar
# (only if Java sources changed since:  .\scripts\build-flink-jar.ps1)

python migration/deploy/build-prod-images.py                 # builds 11 app images + pulls 6 infra images
python migration/deploy/build-prod-images.py --verify-only   # EVERY row must read PROD — stop otherwise
python migration/deploy/save-offline-bundle.py --out D:\transfer\ams-cpa
```

Progress: `migration/deploy/build-out/status.tsv` + `build-out/logs/<service>.log`.
Bundle contents: `ams-cpa-images.tar.gz` (all 16 images, one tar), `ams-cpa-source.tar.gz`,
`ams-flink-1.0-SNAPSHOT.jar`, `env.copyme`, `SHA256SUMS.txt`.

---

## 2. Transfer bundle → VM

Direct:
```powershell
scp -r D:\transfer\ams-cpa lean@192.168.190.91:/tmp/offline-bundle
```
Through a gateway/jump host: `scp -o ProxyJump=<user>@<gateway> -r D:\transfer\ams-cpa lean@192.168.190.91:/tmp/offline-bundle`
(or copy to the gateway, then `scp` again). USB/removable media works the same — land it at `/tmp/offline-bundle`.

---

## 3. Verify + install on the VM

```bash
cd /tmp/offline-bundle
sha256sum -c SHA256SUMS.txt                  # every line "OK" — STOP on any mismatch

sudo mkdir -p /opt/AMS-open && sudo chown "$USER" /opt/AMS-open
tar -xzf ams-cpa-source.tar.gz -C /opt/AMS-open
gunzip -c ams-cpa-images.tar.gz | docker load     # loads all 16 images

cd /opt/AMS-open
cp /tmp/offline-bundle/env.copyme migration/.env
chmod 600 migration/.env
bash migration/deploy/prepare-vm.sh /tmp/offline-bundle   # restores the Flink JAR bind-mount copy

nano migration/.env    # fill EVERY CHANGE_ME (real secrets); leave ALLOW_* commented
```

`.env` values to confirm: `POSTGRES_HOST=instrumental-postgres`, `FRONTEND_HOST_PORT=8090`,
`COMPOSE_PROJECT_NAME=ams-cpa`.

---

## 4. Databases + seed (idempotent; touches nothing of Instrumental's)

```bash
cd /opt/AMS-open
bash migration/deploy/deploy.sh     # 00 → 01 → 02 → 03 → 05
```

00 read-only prereq check → 01 creates the 5 `traverse_*` DBs + `ams_user` (never DROP)
→ 02 applies schemas → 03 seeds HDPE hierarchy + full RBAC + admin (bcrypt) → 05 validates.
Vanilla PG — no Timescale (resolved 2026-09-01).

---

## 5. Start the services

```bash
bash migration/deploy/deploy.sh --prod 2>&1 | tee migration/deploy/logs/deploy-$(date +%F_%H%M).log
```

`--prod` = `compose up --profile cpa --no-build`: a missing/misnamed image **fails loudly**;
nothing on the VM ever builds or pulls (the scripts refuse if tried).

---

## 6. Ops-gated: Kafka topics + Flink jobs (shared broker — sign-off first)

```bash
# in migration/.env, uncomment BOTH:
#   ALLOW_CREATE_PREFIXED_TOPICS=yes
#   ALLOW_FLINK_SUBMIT=yes
bash migration/deploy/deploy.sh --prod    # now also runs 04 (topics) and 04b (4 Flink jobs) + strict 05
```

04 creates only `traverse.*` topics, `--if-not-exists`, RF=3 minISR=2. 04b submits the four
CPA jobs after the JobManager is healthy.

---

## 7. Smoke test

```bash
curl -fsS http://localhost:8081/gw/health                          # gateway healthy
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8090/  # 200 — UI
docker exec ams-flink-jobmanager flink list -m localhost:8081      # 4 jobs RUNNING (after step 6)
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'ams-|traverse-' | sort
docker exec instrumental-kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --list | grep '^traverse\.'
```

Browser: `http://192.168.190.91:8090` → login `admin` / `BOOTSTRAP_ADMIN_PASSWORD` → lands on `/cpm`.
Air-gap proof: no container log mentions `EAI_AGAIN`, `pull access denied`, `npm ci`, or telemetry hosts.

---

## 8. Never on this VM

- `docker compose down` / `down -v` against anything Instrumental
- `docker system prune` / `docker system prune -a` / `docker volume prune`
- `scripts/kafka-reset-lab-topics.ps1` (deletes topics)
- building images or `docker pull` (deploy.sh / pull-images.sh refuse on plant — keep it that way)
- `DROP DATABASE`, or touching `auth_service` / `instrument_*` / `instrumental` databases

**Re-deploy later:** new bundle → repeat 2–3 (checksum, load, extract) → `deploy.sh --prod`.
Steps 4/6 are idempotent and skip what already exists.
