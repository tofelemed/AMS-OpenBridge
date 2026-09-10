# v3 deployment — step by step

Prod runs **v2**. This ships CHG-001…014 (see [changes_tracker.md](../changes_tracker.md)).
**No schema migration.** 5 images + the Flink JAR + 2 SQL scripts.

Companions: [UPDATE-RUNBOOK.md](UPDATE-RUNBOOK.md) (per-service detail, rollback, disk drill).

---

## A. Plant — config first, no deploy (do this alone, confirm, then decide if B is urgent)

Needs **no image, no restart, and no frontend** — the script calls the API, and the subscriber
reloads itself within ~30 s. Independent of B–F; run it today.

**A0.** Get the script onto the VM (skip if the v3 bundle is already there — it is at
`/opt/ams-recovery/v3/ops/set-mode-map.py`). One 3.5 KB file, no bundle required:
```powershell
scp scripts\set-mode-map.py lean@192.168.190.91:/tmp/
```

**A1.** Restore the MODE map on every `MQTT_LOOP_SAMPLES` source.
```bash
export ADMIN_PW='<admin password>'
python3 /tmp/set-mode-map.py            # dry run — prints what is stored now
python3 /tmp/set-mode-map.py --apply
```
> If the dry run says `(no loop_ingest block at all)`, the wizard erased it — the script restores the map; `grid_seconds`/`topic_template` fall back to defaults.

**A2.** OK when tuples carry `AUT`/`MAN`/`CAS`, not raw `1`/`2`:
```bash
docker exec instrumental-kafka-1 kafka-console-consumer --bootstrap-server kafka-1:9092 --topic traverse.cpa.loop.samples.v1 --max-messages 5 --timeout-ms 30000 2>/dev/null | grep -o '"mode":"[A-Z]*"' | sort | uniq -c
```

**A3.** OK when `avg_auto_pct` is off zero and G1 is no longer the universal failure:
```bash
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm < scripts/diagnose-gate-failures.sql   # or ops/ from the bundle
```

⚠ Until step D4 lands, **nobody edits these sources in the wizard** — a save deletes `loop_ingest` again.

---

## B. Build box (Windows)

**B1.** Clean tree — bundles ship `git archive HEAD`.
```powershell
cd D:\HMI_Project_Usama\AMS-open
git status --short          # must be empty
```

**B2.** Prove the set.
```powershell
dotnet test tests/ingestion-service.Tests          # 134/134
.\scripts\test-ot-loop-ingestion-e2e.ps1           # 23/23, ~15 min, needs run-all.ps1 stack
```

**B3.** Build + verify + save.
```powershell
python migration/deploy/build-release.py --release v3 --dry-run   # read the plan
python migration/deploy/build-release.py --release v3
```
Output: `release-out/v3-<date>/` — 5 `*.tar.gz`, `ams-flink-1.0-SNAPSHOT.jar`, `ops/` (4 files), `SHA256SUMS.txt`, `VM-STEPS.md`.
Every verify row must read **PROD**.

---

## C. Transfer

```powershell
cd release-out\v3-<date>
scp -r . lean@192.168.190.91:/tmp/v3
```
Two-hop via the gateway PC: copy there first, then `cd` into the folder before `scp` (a `C:` in the argument is parsed as a hostname).

On the VM, keep a copy off `/tmp` — it is the only offline recovery path this host has:
```bash
sudo mkdir -p /opt/ams-recovery && sudo cp -r /tmp/v3 /opt/ams-recovery/
```

---

## D. Plant — binaries

**D1.** Integrity + headroom + rollback point.
```bash
cd /tmp/v3 && sha256sum -c SHA256SUMS.txt        # every line OK — STOP otherwise
df -h /                                           # want several GB free
docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' > /tmp/pre-v3-images.txt
```

**D2.** Load all five images.
```bash
cd /tmp/v3 && for f in *.tar.gz; do gunzip -c "$f" | docker load; done
```

**D3.** Flink — image + JAR file + resubmission move together.
```bash
cp /tmp/v3/ams-flink-1.0-SNAPSHOT.jar /opt/AMS-open/src/flink/target/ams-flink-1.0-SNAPSHOT.jar
docker rm -f ams-flink-taskmanager ams-flink-jobmanager
cd /opt/AMS-open && bash migration/deploy/deploy.sh --prod 2>&1 | tail -8
docker exec ams-flink-jobmanager flink list -m localhost:8081
```
OK when **4 × RUNNING** and every start time is now.
> Removing both containers is mandatory: `04b` skips any job whose name already exists, so with the old JobManager up it prints `[OK]` while the **old jar** keeps running. Marun has no ZK HA, so `rm -f` really does clear them. Do **not** run `flink-job-submit-cplm` (lab-only profile).
> Cost: jobs restart with fresh window state — 12h/24h verdicts need up to a day.

**D4.** Recreate the rest.
```bash
cd /opt/AMS-open && bash migration/deploy/deploy.sh --prod 2>&1 | tail -8
```
If `traverse-ingestion-service` name-conflicts: `docker rm -f traverse-ingestion-service` first (~30 s pause, QoS-1 session covers it).

---

## E. Plant — data (pgAdmin → `traverse_cplm`)

**E1.** Onboard the 14 unregistered CPA loops.
`ops/cpm-01-onboard-missing-loops.sql` → expect 14 registry + 56 tag-map rows. They park at `hdpe/unassigned/unassigned`; relocate later via the wizard.

**E2.** Dry-run the ranges: change the final `COMMIT` to `ROLLBACK`, run `ops/cpm-02-load-engineering-ranges.sql`, read the **Messages** tab.
- Report 1 must say `SKIPPED — none`.
- **Confirm against the DCS before committing:** `TIC10704` OP `3..5`, `TIC30304` OP `100..155`. A wrong OP range blocks the diagnosis outright — worse than leaving it undeclared.

**E3.** Run it for real (`COMMIT`) → **171 loops** carrying all four bounds.

**E4.** Republish — mandatory. The SQL reaches neither the engine nor the UNS without it.
```bash
TOKEN=$(curl -s -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('accessToken') or d.get('token'))")
echo ${#TOKEN}     # non-zero, or everything below 401s
```
```bash
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select loop_id from cpm.loop_registry order by loop_id" > /tmp/loops.txt
while read L; do C=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "http://localhost:8081/api/v1/cpm/loops/$L/republish-evidence"); echo "$L $C"; sleep 0.5; done < /tmp/loops.txt | tee /tmp/republish.log
```
```bash
grep -v ' 200$' /tmp/republish.log      # empty = done; else re-run those ids (idempotent)
```
> `sleep 0.5` is the gateway's 120 mutations/min global limit. Tokens expire in 1 h.

---

## F. Verify

Every `/api/` route needs a bearer token (they all 401 without one):
```bash
TOKEN=$(curl -s -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('accessToken') or d.get('token'))"); echo "len=${#TOKEN}"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8081/api/ingestion/stats | grep -o '"VP":"vp"'   # paramRoles.VP
docker exec instrumental-kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results | head -3   # ONE member
S=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ); E=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# ISO-8601 ONLY: the endpoint binds DateTimeOffset, so epoch-ms 400s with an empty body.
# Needs the bearer token like every /api route. Expect JSON, <=9999 points, never a 500.
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8081/api/hist/raw/cursor?series=root.site1.cpm.<loop-with-data>&start=$S&end=$E&maxCount=10000&measurements=pv,sp,op" | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8090/                # 200 — users Ctrl+F5
docker exec ams-flink-jobmanager flink list -m localhost:8081                  # 4 × RUNNING
df -h /
```
**The gate proof — use the SHORT windows.** Straight after D3 the long tables hold either
pre-fix history or windows with minutes of data, so `diagnose-gate-failures.sql` (which reads
`cplm_gate_results`) cannot answer yet. This is the query that can, ~20 min after D3:
```bash
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "select window_kind, count(*) as windows, round(avg(auto_pct)::numeric,3) as avg_auto, count(*) filter (where payload->>'gate1_status'='PASS') as g1_pass, count(*) filter (where payload->>'gate1_status'='EXCLUDED') as g1_excl from analytics.cplm_short_feature_results where created_at > now() - interval '25 minutes' group by 1 order by 1;"
```
`avg_auto` off zero and a non-zero `g1_pass` = the MODE fix reached the engine. (Measured
2026-09-10: 0.000 → **0.63**, 435 PASS vs 258 EXCLUDED on 1m windows.) The 60m row stays blank
until a full hour has elapsed. Run `ops/diagnose-gate-failures.sql` for the fleet view tomorrow,
once 12h/24h windows hold only post-deploy data.

Browser: Administration → Data Sources → the loop-samples card now shows a **Loop ingest** panel with the MODE map (CHG-013).

Logs are `SERVICE_LOG_LEVEL=Error` — silence is normal; verify from the endpoints above, not `docker logs`.

---

## Rollback

```bash
grep <service> /tmp/pre-v3-images.txt          # old image id
docker tag <old-id> ams-cpa-<service>
cd /opt/AMS-open && bash migration/deploy/deploy.sh --prod
```
Keep `/tmp/pre-v3-images.txt` and `/opt/ams-recovery/v3` until v3 has soaked a day.
Every code change defaults to prior behaviour; only CHG-001's process-time stamping needs an image rollback to undo.

---

## Expectations to set

- **G3 PASS → WARN on some loops** after E3 — 57 get a *tighter* band than today's flat 0.5 EU. That is the fix working.
- **12h/24h verdicts are meaningless for ~a day** after D3 (fresh Flink window state).
- **G14/VP** flips to `CONFIRMED_CAPABLE` only on the first long window after a loop with a mapped, published VP.

## Never on this VM

`docker system prune` / `prune -a` / `volume prune` · `docker image prune` without reading the list (removal is one-way — nothing can be re-pulled) · anything of Instrumental's (volumes, Prometheus data, databases, topics) · `rm` on a live container log (truncate) · building or pulling images.
