# v6 deployment — CHG-023 (CPM Overview / Performance read path)

Ships **cplm-api, ams-frontend, historian-bff**. Three additive indexes, applied **online before
the image swap**. No Flink change, no job resubmission, no data load. Companion:
[UPDATE-RUNBOOK.md](UPDATE-RUNBOOK.md); the change itself is CHG-023 in
[changes_tracker.md](../changes_tracker.md).

| | |
|---|---|
| Bundle | `release-out/v6-<date>/` from `python migration/deploy/build-release.py --release v6` |
| Services | `cplm-api`, `ams-frontend`, `historian-bff` |
| Schema | indexes only — `ops/cpm-04-fleet-latest-indexes.sql`, run **before** step C3 |
| Data load | none |

**The one trap:** run the index file *before* loading the new cplm-api image. The image's
self-heal DDL would otherwise build the same indexes at startup with a plain `CREATE INDEX`
(blocks the consumer's writes for the build, ~10–60 s on the plant's table). Not harmful, but
the ops file does it online with no lock.

---

## A. Build box

```powershell
cd D:\HMI_Project_Usama\AMS-open
git status --short                                   # must be empty — bundles ship git archive HEAD
# proof (lab stack up via .\run-all.ps1; a throwaway Redis for the BFF test)
dotnet test tests/cplm-api.Tests                     # 28/28 (lab Postgres on 5433; ~7 min, the legacy oracle is that slow)
docker run --rm -d --name snaptest-redis -p 6390:6379 redis:7.2-alpine
dotnet test tests/historian-bff.Tests                # 4/4
docker rm -f snaptest-redis
cd src/frontend-ob; npm test; npm run lint; npm run build; cd ..\..
python migration/deploy/build-release.py --release v6 --dry-run
python migration/deploy/build-release.py --release v6
```

## B. Transfer

As V3: `scp -r release-out\v6-<date> lean@192.168.190.91:/tmp/v6`, then
`sudo cp -r /tmp/v6 /opt/ams-recovery/`.

## C. Plant

```bash
cd /tmp/v6 && sha256sum -c SHA256SUMS.txt                          # every line OK
docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' > /tmp/pre-v6-images.txt

# C1. BEFORE numbers (keep the file)
docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-06-fleet-perf-probe.sql | tee /tmp/fleet-probe-before.txt

# C2. indexes, online — expect three rows, valid = t
docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-04-fleet-latest-indexes.sql

# C3. images
for f in *.tar.gz; do gunzip -c "$f" | docker load; done
cd /opt/AMS-open && bash migration/deploy/deploy.sh --prod 2>&1 | tail -8

# C4. checks
docker exec instrumental-kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results         # one member
docker exec instrumental-kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results-frames  # one member
docker logs traverse-cplm-api --since 2m 2>&1 | grep -i "schema ensured"
docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-06-fleet-perf-probe.sql | tee /tmp/fleet-probe-after.txt

# C5. end to end (token from /api/auth/login) — each < 0.3 s, X-Cpm-Cache present
for p in "fleet/summary" "fleet/rankings?limit=50" "fleet/heatmap" "calculations" "loops"; do
  curl -s -o /dev/null -D - -w "$p  %{time_total}s  %{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:8081/api/v1/cpm/$p" | grep -E "X-Cpm-Cache|  [0-9]"
done
```

Users hard-refresh (Ctrl+F5) for the new frontend bundle.

## D. Afterwards, not part of the release

`ops/cpm-05-gate-results-retention-check.sql` (read-only) gives the facts for the retention
decision: the plant's result tables have no ceiling (~33k gate rows/day). Option A = TimescaleDB
policies if the extension is available on Instrumental's Postgres; option B = a nightly delete.

## Rollback

Indexes are additive — leave them. Reload the previous cplm-api / frontend / historian-bff
images from `/tmp/pre-v6-images.txt` and `deploy.sh --prod`; the old queries still work, only
slowly.
