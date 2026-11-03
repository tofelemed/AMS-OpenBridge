# Loop historian move: `root.site1.cpm` → `root.hdpe.cpm` (CHG-101)

Zero data loss. IoTDB 1.3.2 cannot rename, so the loop tree is **copied**, verified series by series, then
switched. The old tree is the backup and is deleted only at the very end, by hand. TTL stays **90 d**.
Background and design: `docs/historian/iotdb-namespace-current-and-plan.md` (sections 9-10).

Tool: `migration/iotdb-move-loop-tree.py` (`plan` / `prepare` / `copy` / `verify`). It never deletes anything.
Exit codes: 0 ok, 1 verify failed or IoTDB error, 2 precondition, 3 low disk (free space, then re-run the same command).

## What changes

One `.env` value drives everything. Code defaults stay `root.site1.cpm`, so files deployed without it change nothing.

| `.env` | Read by |
|---|---|
| `LOOP_ROOT_PREFIX=root.hdpe.cpm` | ams-api (raw writer), cplm-api (KPI writer, replay device, asset overrides), iotdb-init, **ams-frontend build** |
| `IOTDB_LOOP_DB=root.hdpe.cpm` | iotdb-init (database + 90 d TTL) |

The frontend bakes the prefix at **build** time: the build box's `migration/.env` must carry the same
`LOOP_ROOT_PREFIX` when `build-prod-images.py` runs. Prove it on the built image:
`docker run --rm --entrypoint sh <ams-frontend image> -c "grep -rl root.hdpe.cpm /usr/share/nginx/html | head -1"`
must print a file.

## Plant steps (Marun)

All commands from `/opt/AMS-open`. `M="python3 -I migration/iotdb-move-loop-tree.py --new root.hdpe.cpm --env-file migration/.env"`.

**0. Pre-checks (read-only, the day before)**
```bash
$M plan                                   # databases, TTLs, devices, statement count. Must end "plan OK".
sudo du -sh "$(docker volume inspect -f '{{.Mountpoint}}' ams-cpa_iotdb-data)"
df -h /                                   # free >= iotdb-data size + 5 GB
```
`plan` refuses (exit 2) if `root.hdpe` already exists as a database or the trees overlap.

**1. Create the new database (no service impact)**
```bash
$M prepare                                # CREATE DATABASE root.hdpe.cpm + SET TTL 90 d (copied from root.site1)
```

**2. Bulk copy while the plant keeps writing the old tree (no service impact)**

First: Flink jobs RUNNING and the cplm-api results group `traverse-cpa-cplm-results` lag near 0. KPI rows are
stamped with their window END and written when the result arrives, so a row stamped just before T_COPY can land
in the old tree after its device was copied. The delta copy re-covers the last 10 min before T_COPY; that only
holds while results arrive within minutes.
```bash
T_COPY=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo "$T_COPY" | tee /var/tmp/chg101-tcopy
$M copy --to "$T_COPY" --state /var/tmp/chg101-bulk.state --disk-path /var/lib/docker
$M verify --to "$(date -u -d "$T_COPY - 10 min" +%Y-%m-%dT%H:%M:%SZ)"   # must end "VERIFY OK"
```
Verify stops 10 min before T_COPY on purpose: a verify up to T_COPY itself fails on every live loop's KPI
series (lab 2026-11-03: 280 rows on the 4 fed loops, all stamped in the last minute before T_COPY); step 4
copies and verifies that strip. Interrupted or exit 3? Re-run the same `copy` line: finished chunks are skipped.

**3. Switch (short window; Kafka keeps samples 12 h, the switch takes minutes)**
1. No replays/reconstructions from the workbench during the window.
2. Add the two lines to `migration/.env`, `docker load` the new ams-frontend image, then `bash migration/deploy/deploy.sh --prod`.
   It recreates ams-api, cplm-api, iotdb-init (re-asserts the 90 d TTL) and ams-frontend.
3. `T_FLIP=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo "$T_FLIP" | tee /var/tmp/chg101-tflip`

**4. Delta copy (the minutes between step 2 and the switch)**
```bash
FROM=$(date -u -d "$(cat /var/tmp/chg101-tcopy) - 10 min" +%Y-%m-%dT%H:%M:%SZ)
TO=$(date -u -d "$(cat /var/tmp/chg101-tflip) + 5 min" +%Y-%m-%dT%H:%M:%SZ)
$M copy --from "$FROM" --to "$TO" --state /var/tmp/chg101-delta.state
$M verify --to "$TO"                      # whole window, must end "VERIFY OK"
```

**5. Re-point the asset links** (Designer history for loop signals): `POST /api/v1/cpm/loops/bulk-republish-evidence`
through the gateway, body `{"loopIds":[...]}`, chunks of 20 loops (larger chunks time out in asset-model).
Then count what still points at the old tree:
```sql
-- traverse_assets
SELECT contextual_path, iotdb_path_override FROM assets.assets WHERE iotdb_path_override LIKE 'root.site1.cpm.%';
```
The republish only rewrites each loop's CURRENT projection. Rows left over are assets no loop projects any more
(an earlier placement, a role since unmapped). Check that no display or template names them (search their
`contextual_path` in `traverse_displays` / `traverse_templates`): unreferenced leftovers are harmless; a referenced
one is re-pointed by fixing its loop's mapping and republishing that loop. Lab 2026-11-03: 979 -> 57 leftovers
(56 orphaned `hdpe/unassigned/unassigned/*`, 1 unmapped `vp`), none referenced.

**6. Check**
- `docker exec ams-iotdb ... -e "select last pv from root.hdpe.cpm.PIC80105"` advances; the same on `root.site1.cpm.PIC80105` stops at T_FLIP.
- `curl -s -H "$H" 'http://localhost:8081/api/hist/last?series=root.hdpe.cpm.PIC80105&measurements=pv,sp,op,mode'`
- CPM Explorer / Historical: 12 h, 24 h and older ranges, no gap at T_FLIP; one reconstruction succeeds.
- Kafka group `traverse-cpa-iotdb-raw-loop` lag back near 0.

**7. Soak 7 days, then free the old copy**
```bash
$M verify --from <oldest day still wanted> --to "$(cat /var/tmp/chg101-tflip)"    # last proof: VERIFY OK
# only then, in the IoTDB CLI:  DELETE DATABASE root.site1;
```

## Lab rehearsal 2026-11-03 (full lab tree, sim feeding 10 loops throughout)

| Step | Result |
|---|---|
| plan | 2,157 devices (183 raw, 1,974 kpi), ~4,536 statements, 1 s |
| prepare | `root.hdpe.cpm` created, TTL 90 d; second run a no-op |
| bulk copy | 27,043,042 points in 17 min 42 s (REST on 127.0.0.1), 0 retries |
| verify to T_COPY - 10 min | VERIFY OK, 27,039,379 = 27,039,379 points, 41 s |
| switch | ams-api / cplm-api / iotdb-init / ams-frontend recreated; old tree's last sample 10:40:37, new tree current within a minute; iotdb-init re-asserted 90 d |
| delta copy + whole-window verify | 11,004 points in 70 s; VERIFY OK 27,049,822 old points all present, 55 s |
| asset links | 243 loops republished in 13 chunks, 32 s; 922 of 979 links moved (leftovers above) |
| after the switch | KPI rows only in the new tree (1,572 vs 0 in 25 min); UI Historical, binding-resolver and `/api/hist/trend` all read `root.hdpe.cpm`; 90-day trend identical on both paths, no gap at T_FLIP |
| rollback copy-back | 20,170 points in 56 s; VERIFY OK on the settled window |

## Rollback (any time before step 7)
Remove the two `.env` lines, load the previous ams-frontend image, `deploy.sh --prod`. Then copy what was written
to the new tree back: `python3 -I migration/iotdb-move-loop-tree.py copy --old root.hdpe.cpm --new root.site1.cpm
--new-db root.site1 --from "$(cat /var/tmp/chg101-tflip)" --state /var/tmp/chg101-back.state` and `verify` the same way.
Switch the writers back BEFORE the copy-back, so the new tree is no longer written; otherwise verify up to 10 min
before the copy started (the same late-KPI rule as step 2).
