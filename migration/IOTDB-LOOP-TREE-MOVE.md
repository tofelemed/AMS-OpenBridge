# Loop historian move: `root.site1.cpm` → `root.hdpe.cpm` (CHG-101)

Zero data loss. IoTDB 1.3.2 cannot rename, so the loop tree is **copied**, verified series by series, then
switched. The old tree is the backup and is deleted only at the very end, by hand. TTL stays **90 d**.
Background and design: `docs/historian/iotdb-namespace-current-and-plan.md` (sections 9-10).

The move lands in the **CHG-102 layout v2** (`infra/docker/iotdb-layout-v2.sh`, owner ams-open-11): raw loops
become ALIGNED devices with template `cpm_raw` (pv/sp/op/vp FLOAT, mode TEXT), and KPIs leave the loop device for
their own databases, family first: `root.hdpe.kpi.<gate_*|long_*>.<loop>` (TTL 3 y) and
`root.hdpe.kpis.short_*.<loop>` (90 d). `--layout v2` does that mapping, casts DOUBLE -> FLOAT, and REFUSES any device
or field the templates have no place for (writing one would auto-extend a template for every device).

Tool: `migration/iotdb-move-loop-tree.py` (`plan` / `prepare` / `copy` / `verify`) + `migration/iotdb_move_v2.py`.
It never deletes anything. Offline tests: `python -I tests/ops/test_iotdb_move_v2.py -v`.
Exit codes: 0 ok, 1 verify failed or IoTDB error, 2 precondition, 3 low disk (free space, then re-run the same command).

## What changes

One `.env` value drives everything. Code defaults stay `root.site1.cpm`, so files deployed without it change nothing.

| `.env` | Read by |
|---|---|
| `LOOP_ROOT_PREFIX=root.hdpe.cpm` | ams-api (raw writer), cplm-api (KPI writer, replay device, asset overrides), iotdb-init, Flink supervisor + `flink-job-submit-cplm` (CHG-102 5c on-demand evaluation fallback device; takes effect when the jobs are resubmitted), **ams-frontend build** |
| `IOTDB_LOOP_DB=root.hdpe.cpm` | iotdb-init (database + 90 d TTL) |
| `IOTDB_LAYOUT=v2` | iotdb-init: templates, KPI databases, 1-minute rollup query (CHG-102; other keys default) |

The frontend bakes the prefix at **build** time: the build box's `migration/.env` must carry the same
`LOOP_ROOT_PREFIX` when `build-prod-images.py` runs. Prove it on the built image:
`docker run --rm --entrypoint sh <ams-frontend image> -c "grep -rl root.hdpe.cpm /usr/share/nginx/html | head -1"`
must print a file.

## Plant steps (Marun)

All commands from `/opt/AMS-open`. `M="python3 -I migration/iotdb-move-loop-tree.py --layout v2 --new root.hdpe.cpm --env-file migration/.env"`.

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
Then the v2 templates and KPI databases, on the still-EMPTY raw database (a template cannot be set on a database
that already holds series). Same script iotdb-init runs; the 1-minute rollup query waits for the switch (step 3):
```bash
export IOTDB_PASS="$(grep '^IOTDB_PASSWORD=' migration/.env | cut -d= -f2-)"
docker exec -i -e IOTDB_PASS -e IOTDB_CLI=/iotdb/sbin/start-cli.sh -e IOTDB_HOST=127.0.0.1 -e IOTDB_PORT=6667 \
  -e IOTDB_USER=root -e LOOP_DB=root.hdpe.cpm -e LOOP_CPM_PREFIX=root.hdpe.cpm -e ROLLUP_1M=false \
  ams-iotdb bash -s < infra/docker/iotdb-layout-v2.sh        # must end "layout v2 in place." (~2 min)
$M plan                                   # now also maps every device + field: must end "plan OK"
```
`plan` exits 2 listing anything with no place in v2 (an unknown KPI family, a field missing from a template).
Fix the template in `iotdb-layout-v2.sh` first; never let the copy create it.

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
Exit 1 with `no available DataRegionGroup` or a `301 NullPointerException` means the same: the tool now retries both
(new-database regions appear only on first write), and if the retries run out, re-run the line. Any other exit 1: stop and read it.

**3. Switch (short window; Kafka keeps samples 12 h, the switch takes minutes)**
1. No replays/reconstructions from the workbench during the window.
2. Add the three lines to `migration/.env` (keep `IOTDB_RAW_TTL_DAYS` unset or equal to the TTL `prepare` set: copy
   and verify refuse a mismatch), `docker load` the new images, then `bash migration/deploy/deploy.sh --prod`.
   It recreates ams-api, cplm-api (both with the CHG-102 v2 writers), iotdb-init (re-asserts TTLs, creates the
   1-minute rollup query) and ams-frontend.
   cplm-api's new KPI-history consumer (group `traverse-cpa-kpi-history`) starts at Earliest: on its first start it
   re-writes every result still on the topic into the v2 KPI databases. That is idempotent and is expected, so its
   lag starts high and drains. It also covers KPI rows between the delta copy and the switch.
   deploy.sh does **not** resubmit Flink jobs on a config-only change. The only job that reads the prefix is
   "AMS - CPLM On-Demand Evaluation" (CHG-102 5c fallback device), and it is stateless:
   - Switch done inside the CHG-102 release: nothing extra. The full Flink swap (cancel all, then 04b submits every job)
     picks the prefix up, provided `migration/.env` already holds `LOOP_ROOT_PREFIX=root.hdpe.cpm` before the swap.
   - Switch done on its own, after CHG-102 is live: cancel only the On-Demand Evaluation job in the Flink UI or with
     `flink cancel <job id>`, then run `bash migration/04b-submit-flink-jobs.sh`, which resubmits the missing job.
     Check that the Flink UI shows exactly one On-Demand Evaluation job.
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

## Layout v2 rehearsal 2026-11-03 (scratch databases `root.mvtest.*`, removed afterwards)

| Step | Result |
|---|---|
| prepare + `iotdb-layout-v2.sh` on scratch names | templates set; `plan` refused before it ran ("database ... missing"), passed after |
| copy, 3 loops, full 90-d window | 1,046,079 points (raw + 11 KPI families each) in 22 s; target devices aligned, template series FLOAT/GORILLA/ZSTD, TEXT/DICTIONARY/ZSTD |
| verify (counts + min/max, FLOAT tolerance 1e-6) | VERIFY OK, 423 series |
| `v2-back` into a fresh legacy tree, and into pre-created DOUBLE series | VERIFY OK both; legacy vs round trip VERIFY OK (1,046,079 = 1,046,079) |
| **trap found** | IoTDB 1.3.2 keeps back-quotes LITERALLY in a ``SELECT cast(..) INTO dev(`pv`)`` target list: it created series named `` `pv` `` and auto-extended the template. The tool now writes bare names, accepts only plain identifiers, and stops if any template already holds a quoted node. |

## Full layout v2 move on the lab 2026-11-04 (run by CHG-102, ams-open-11)

`root.hdpe.cpm` (old layout) to `root.hdpev2.cpm`, `root.hdpev2.kpi`, `root.hdpev2.kpis`, with live writers running.
The lab target is `root.hdpev2` only because its `root.hdpe.cpm` already existed; the plant target stays `root.hdpe.*`.

| Step | Result |
|---|---|
| final verify | VERIFY OK: 25,003 series, 28,113,236 old points all present, min/max equal |
| switch | T_FLIP 11:05:55 UTC; writes are FLOAT, new KPI rows carry g0..g15 |
| asset republish | 922 links moved, the same 57 orphans as before |
| tiered reads | 34 Postgres rows of TIC30501 deleted: the API still returns all 176 windows, 17 from the historian, same diagnosis, severity, confidence and sample count |
| **`copy` stopped twice** | `no available DataRegionGroup` on the first write to a new database, and a `301 NullPointerException` from `Driver.processInternal` on one chunk. Three runs of the same line finished it. The tool retries both since then (unit-tested; not yet seen live) |

**With a non-default target, pass all four names to `iotdb-layout-v2.sh`:** `LOOP_DB`, `LOOP_CPM_PREFIX`, `KPI_DB`, `KPIS_DB`.
The last two default to `root.hdpe.kpi` and `root.hdpe.kpis`.

**History copied from the old layout has no gate statuses:** the old layout never stored them, so copied rows read UNKNOWN
per gate. The move itself loses nothing. The gap shows once the Postgres rows from before the switch age out (14 days),
unless they are backfilled. Decision open with CHG-102.

## After the move: evidence-archive trace references (CHG-102)
With `IOTDB_LAYOUT=v2`, cplm-api's evidence archive stops storing raw `time/pv/op` inline. It stores a reference to the loop's
IoTDB raw series plus a sha256, checked when the trace is read. Two rules follow:
- **Never rewrite or cast the raw tree again** (a second move, a type change, a re-copy) without first setting
  `Cplm__EvidenceArchive__TraceReferences=false`. Otherwise the referenced traces fail their hash and are unreadable
  (TRACE_HISTORIAN_DIFFERS; never served wrong). A prefix-only move is fine: the reader also tries the current prefix.
- Raw TTL >= archive retention + 2 d (30 d default; 90 d is fine).
- **After a rollback, keep `root.hdpe.cpm` for the evidence-archive retention (30 d default)** before deleting it.
  The reader uses the stored device first, so archived sets made during v2 keep reading from it while it exists.
  The fallback to the `root.site1.cpm` copy-back is untested. Removing `IOTDB_LAYOUT=v2` (cplm-api back to v1) stops new references.
- Rolling the cplm-api IMAGE back to one before CHG-102 5b-2 (commit 125e6865) makes the archive rows with codec `cpax2`
  unreadable. They stay in the table and read again after a roll-forward; sets archived before v2 are `cpax1` and unaffected.

## Rollback (any time before step 7)
Remove the three `.env` lines, load the previous images, `deploy.sh --prod`. Then copy what was written to the new
layout back into the legacy shape (raw + both KPI databases; FLOAT cast back to the legacy DOUBLE series):
`python3 -I migration/iotdb-move-loop-tree.py --layout v2-back --old root.hdpe.cpm --new root.site1.cpm
--new-db root.site1 --env-file migration/.env copy --from "$(cat /var/tmp/chg101-tflip)" --state /var/tmp/chg101-back.state`
and `verify` the same way. The rollup database `root.hdpe.kpi.m1` is not copied back (the legacy layout has none).
Switch the writers back BEFORE the copy-back, so the new tree is no longer written; otherwise verify up to 10 min
before the copy started (the same late-KPI rule as step 2).
