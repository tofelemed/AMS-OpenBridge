# Deploy scripts (Phase 9)

Linux VM, after `git clone` / copy of this repo:

```text
bash migration/deploy/prepare-vm.sh
cp migration/.env.example migration/.env   # fill CHANGE_ME values
bash migration/deploy/deploy.sh            # 00 → 01 → 02 → 03 → 05
```

`--compose` is opt-in. It starts **this app’s** CPA overlay only (`--profile cpa`). It does not start Instrumental Postgres or Kafka.

```text
bash migration/deploy/deploy.sh --compose
```

Logs: `migration/deploy/logs/deploy-YYYYMMDD_HHMMSS.log`.

## What runs

| Step | When |
|---|---|
| `run-migration.sh` | default: 00–03, 05 |
| `04-create-kafka-topics.sh` | only if `ALLOW_CREATE_PREFIXED_TOPICS=yes` in `.env` |
| compose `--profile cpa` | only with `--compose` |
| `04b-submit-flink-jobs.sh` | only if `ALLOW_FLINK_SUBMIT=yes` — **after** JobManager is up when using `--compose` |

Those two `ALLOW_*` flags are **ops confirms** on the shared broker. Code already uses `traverse.cpa.*` / `traverse.alarm.*`. Do not set them until Marun Kafka/Flink is signed off. Never run `scripts/kafka-reset-lab-topics.ps1` here.

`ams-api` is off unless `START_AMS_API=yes` (needs an `ams` database this cut does not create).

## Overlay

`docker-compose.marun.yml` + `infra/docker/docker-compose.yml`. Compose **v2.24+** (`!override`). Project name `ams-cpa`.

- Joins external `instrumental-network`
- Kafka bootstrap `kafka-1:9092,kafka-2:9092,kafka-3:9092`
- Postgres `Host=instrumental-postgres` (override with `POSTGRES_HOST`)
- Host ports: gateway `${GATEWAY_HOST_PORT:-8081}`, frontend `${FRONTEND_HOST_PORT:-8090}` (8088 = alarm_superset on Marun); iotdb/minio unpublished; no `:80` / `:3000` / `:1883`
- Flink HA does **not** use lab ZooKeeper
- Alarm Flink submitters stay on profile `lab-alarm` (04b submits the four CPA jobs)

Pull (optional, no start): `bash migration/deploy/pull-images.sh`

## Air-gap (plant)

Do not build on the VM. See [OFFLINE_DEPLOYMENT_GUIDE.md](../OFFLINE_DEPLOYMENT_GUIDE.md).

```text
# internet box
python migration/deploy/build-prod-images.py
python migration/deploy/build-prod-images.py --verify-only
python migration/deploy/save-offline-bundle.py

# VM after docker load
bash migration/deploy/deploy.sh --prod --no-build
```

## Never

- `docker compose down -v` on Instrumental
- `DROP DATABASE`
- Lab topic wipe script
