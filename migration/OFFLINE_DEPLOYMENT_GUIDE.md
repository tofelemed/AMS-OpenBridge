# Offline deployment — AMS CPA on Marun

Marun is air-gapped. Nothing on the plant VM may hit npm, NuGet, Maven Central, Docker Hub, Google Fonts, or Grafana’s plugin store. Images are built on an internet-connected box, verified as **prod**, exported with **one** `docker save`, carried to the VM, `docker load`ed, and started with `--no-build`.

Instrumental Postgres/Kafka stay on that host. This bundle is **this app only** (plus Flink + our Redis/EMQX/IoTDB/MinIO). Do not `docker save` a second `postgres` / `cp-kafka` unless ops explicitly wants a spare copy.

Scripts (same shape as Instrumental `microservices/migration/deploy/`):

| Script | When | What |
|---|---|---|
| `migration/deploy/prodimages.py` | imported | Project name `ams-cpa`, image list, prod vs dev fingerprint |
| `migration/deploy/build-prod-images.py` | build machine | compose `--profile cpa` build one service at a time, logs, retries |
| `migration/deploy/save-offline-bundle.py` | build machine, after verify | One `docker save`, gzip, git archive, `.env`, Flink JAR, SHA256SUMS.txt |

Do **not** run the Python build/save scripts on the plant VM.

---

## 1. Internet-call inventory (runtime vs build)

Build-time fetches are allowed **only** on the internet box. The VM must never reach these.

| Leak | When | Offline status |
|---|---|---|
| `npm ci` / `npm run build` (frontend, auth-service) | Image **build** | OK if images are pre-built. VM: `--no-build`. |
| `dotnet restore` / NuGet | Image **build** | Same. Runtime images are `aspnet` + published DLLs. |
| `mvn package` / Maven Central | Flink JAR **build**; sparkplug **build** | JAR is baked into `ams-flink:1.0-SNAPSHOT`. VM must not `mvn`. Sparkplug is a JRE + `app.jar`. |
| `apk add` / `apt-get` in Dockerfiles | Image **build** | Same. |
| CloudBeaver `curl` to `repo1.maven.org` | Image **build** (`patch-iotdb.sh`) | Lab-only (`lab-infra`). Not in the CPA bundle. |
| `FROM flink:1.18.1-java11` | Image **build** | Pulled on the build box; saved as `ams-flink:1.0-SNAPSHOT`. |
| Google Fonts / `fonts.googleapis.com` | Browser **runtime** | **Fixed.** `src/frontend-ob` self-hosts Noto via `@fontsource-variable` (`src/styles/fonts.css`). `index.html` has no CDN `<link>`. OpenBridge package CSS does not `@import` Google Fonts. |
| Vite `npm run dev` | Host **dev** | Never run on the plant. Prod image is `nginx` + `dist/`. |
| Grafana plugin store / news / analytics | Container **start** | Grafana is **off** this cut (`lab-obs`). Env is still set so a later `up` does not call grafana.com: `GF_INSTALL_PLUGINS=""`, `GF_ANALYTICS_*=false`, `GF_NEWS_NEWS_FEED_ENABLED=false`, `GF_PLUGINS_PUBLIC_KEY_RETRIEVAL_DISABLED=true`, `GF_CHECK_FOR_UPDATES=false`. |
| Compose `up` without the image | VM | `--no-build` so a missing image **fails** instead of `npm ci`. |
| `cplm-api` bind-mount of `src/flink/target/*.jar` | Runtime (A8 recompute) | `target/` is **not** in git. `save-offline-bundle.py` copies the JAR into the bundle; `prepare-vm.sh <bundle>` copies it back. Standing Flink jobs use the JAR **inside** `ams-flink`. |
| ECharts maps / ag-grid CDN / Mapbox | Runtime | Not used. |
| Alarm feed `192.168.1.51` | `ams-api` if started | This cut does not start `ams-api`. Alarm ingest stays off. |

Healthchecks and Flink submit scripts `curl` **localhost / compose DNS only**.

---

## 2. Pin `COMPOSE_PROJECT_NAME`

Images without an explicit `image:` are named `<project>-<service>` (e.g. `ams-cpa-auth-service`). If the VM directory name differs, Compose will not find loaded images and will try to build.

```text
COMPOSE_PROJECT_NAME=ams-cpa
```

Same value on the build PC and on the VM. The Marun overlay also has `name: ams-cpa`. Flink is explicit: `ams-flink:1.0-SNAPSHOT`.

---

## 3. Prove images are prod (not a same-named dev tag)

There is no `Dockerfile.dev` in this repo, but a leftover `npm run dev` / `dotnet watch` image with the same name would still look “present”.

`prodimages.py` `image_kind()`:

| Service | PROD fingerprint |
|---|---|
| `auth-service` | `/app/dist/server.js` exists (entrypoint runs `node dist/server.js`) |
| `ams-frontend` | `CMD` contains `nginx` |
| .NET services | `ENTRYPOINT` is `dotnet <name>.dll` (not `watch`) |
| `sparkplug-edge-node` | `app.jar` |
| `flink-jobmanager` | `AMS_FLINK_JAR` + JAR file in the image |

```text
python migration/deploy/build-prod-images.py --verify-only
```

Refuse to save a bundle if any service is `DEV` or `ABSENT`. `--no-verify` on `save-offline-bundle.py` must **not** be used for plant.

---

## 4. Build prod images (internet box)

Working directory: repo root. `migration/.env` must exist. `COMPOSE_PARALLEL_LIMIT=1`. VM architecture is **linux/amd64**.

```powershell
cd D:\HMI_Project_Usama\AMS-open
$env:DOCKER_DEFAULT_PLATFORM = "linux/amd64"
$env:COMPOSE_PROJECT_NAME = "ams-cpa"

python migration/deploy/build-prod-images.py
python migration/deploy/build-prod-images.py --verify-only
```

Optional: `--only ams-frontend`, `--skip-existing`.

What it runs:

```text
docker compose --project-name ams-cpa
  -f infra/docker/docker-compose.yml
  -f migration/deploy/docker-compose.marun.yml
  --profile cpa
  build --progress plain <service>
```

Order: backends first, `flink-jobmanager` (bakes the JAR), `ams-frontend` last.

Progress: `migration/deploy/build-out/status.tsv` and `build-out/logs/<service>.log`.

Pulls **only** Redis, IoTDB, EMQX, MinIO (and init helpers). Does **not** pull Instrumental Postgres/Kafka.

After the first build:

```text
docker image inspect ams-cpa-gateway --format "{{.Os}}/{{.Architecture}}"
```

Expect `linux/amd64`.

---

## 5. Save the offline bundle

```text
python migration/deploy/save-offline-bundle.py
python migration/deploy/save-offline-bundle.py --out D:\transfer\ams-cpa
```

- `compose config --images` → list (built + pulled), minus Instrumental postgres/kafka
- Refuses unless every **app** image fingerprints PROD
- One `docker save` → gzip → `ams-cpa-images.tar.gz`
- `git archive HEAD` → `ams-cpa-source.tar.gz`
- Copies `migration/.env` → `env.copyme`
- Copies Flink JAR (git does not contain `target/`)
- `SHA256SUMS.txt` with LF newlines (`sha256sum -c` on Linux)

`--images-only` skips source/env/JAR. `--no-gzip` is faster and ~3× larger. `--no-verify` must not be used for plant.

```text
offline-bundle/
├── ams-cpa-images.tar.gz
├── ams-cpa-source.tar.gz
├── ams-flink-1.0-SNAPSHOT.jar
├── env.copyme
├── mqtt-ca.crt          # if present
└── SHA256SUMS.txt
```

---

## 6. Air-gapped VM

```text
cd /tmp/offline-bundle
sha256sum -c SHA256SUMS.txt

sudo mkdir -p /opt/AMS-open
tar -xzf ams-cpa-source.tar.gz -C /opt/AMS-open

gunzip -c ams-cpa-images.tar.gz | docker load

cd /opt/AMS-open
cp /tmp/offline-bundle/env.copyme migration/.env
chmod 600 migration/.env
bash migration/deploy/prepare-vm.sh /tmp/offline-bundle

bash migration/deploy/deploy.sh --prod --no-build 2>&1 | tee migration/deploy/logs/deploy-$(date +%Y%m%d_%H%M%S).log
```

`--prod` implies `--compose --no-build`. A missing or misnamed image fails immediately. Never let Compose reach a registry or npm on this host.

Then run 01–05 (and 04b when `ALLOW_*` is signed off). Do **not** `docker compose down` Instrumental.

---

## 7. Smoke (no outbound internet)

After `docker load` (or the same images with the NIC unplugged):

```text
# from /opt/AMS-open, with migration/.env
bash migration/deploy/deploy.sh --prod --no-build --skip-migration
```

- UI on `${FRONTEND_HOST_PORT:-8088}` and gateway `/gw/health` work
- First paint does **not** request `fonts.googleapis.com`
- No container log line about `npm ci` / `EAI_AGAIN` / `pull access denied`
- Grafana is not started this cut; if it is later, it must start without waiting on grafana.com

If that fails, fix compose/Dockerfiles on the **build** box, rebuild, and save a new bundle. Do not ship.

---

## 8. Checklist

- [ ] Internet-call inventory done; Grafana/CDN/npm cannot run at container start
- [ ] Prod frontend (`nginx` + `dist`) — no runtime font/CDN fetch
- [ ] `COMPOSE_PROJECT_NAME=ams-cpa` identical on build PC and VM
- [ ] `build-prod-images.py --verify-only` all PROD
- [ ] `save-offline-bundle.py` one `docker save`; checksums LF; Flink JAR in the bundle
- [ ] VM: `sha256sum -c` → `docker load` → `deploy.sh --prod --no-build`
- [ ] Smoke with no outbound network
- [ ] Shared Marun: do not save a second Kafka/Postgres unless required
