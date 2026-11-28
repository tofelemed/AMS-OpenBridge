# System Response: read-only plant queries (Phase 3)

All read-only. Run on the Marun VM from `/opt/AMS-open` and paste the output back. Nothing here changes data.
Tested on the lab IoTDB 1.3.2 (the same functions and filters); the plant tree is `root.hdpe.cpm` (layout v2).

Set once per shell:
```bash
export IOTDB_PASS="$(grep '^IOTDB_PASSWORD=' migration/.env | cut -d= -f2-)"
iq() { docker exec -e P="$IOTDB_PASS" -e Q="$1" ams-iotdb bash -c '/iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$P" -e "$Q"' 2>&1 | grep -E '^\|' ; }
```

## 1. Tag names with non-Latin letters (Postgres, pgAdmin on `traverse_cplm`)

The plant loop list has `FIC10303А` (Cyrillic А) and `I_HIC20110в` (Cyrillic в). A registry name like that never
matches data published under the Latin name.
```sql
SELECT loop_id, loop_type, is_active FROM cpm.loop_registry WHERE octet_length(loop_id) <> char_length(loop_id);
SELECT DISTINCT loop_id, is_active FROM cpm.loop_tag_map WHERE octet_length(loop_id) <> char_length(loop_id);
```
Expected: no rows. Any row is a name to fix in Loop Registry.

## 2. The 18 tags that are not PID loops (Postgres, `traverse_cplm`)

```sql
SELECT loop_id, loop_type, is_active
FROM cpm.loop_registry
WHERE loop_id ~* '^(FQIC|I_HIC|S-HIC)' OR loop_id ~* '(RMP|_RAMP)$'
ORDER BY loop_id;
```
Expected: 5 FQIC, 5 HIC, 8 ramp flags. The active ones are retired in Loop Registry (owner action, after review).

## 3. Loops that run in Cascade (IoTDB, last 30 days)

```bash
iq "select count(mode) from root.hdpe.cpm.* where mode = 'CAS' and time > now() - 30d align by device" | awk -F'|' 'NR<=1 || $3+0 > 0'
iq "select count(mode) from root.hdpe.cpm.* where time > now() - 30d align by device" > /tmp/sr-mode-all.txt; wc -l /tmp/sr-mode-all.txt
```
The first line lists only loops with Cascade samples (the count is samples, about one per 4.7 s). Paste both outputs: the
share in CAS = the CAS count / the loop's total count. These loops get no System Response events until the Cascade phase.

## 4. Proposed operating regions for the 13 priority-A loops (IoTDB, AUT only, last 30 days)

```bash
iq "select avg(pv), stddev(pv), min_value(pv), max_value(pv), count(pv) from root.hdpe.cpm.FIC10401, root.hdpe.cpm.FIC10402, root.hdpe.cpm.FIC10501, root.hdpe.cpm.FIC10502, root.hdpe.cpm.FIC10303A, root.hdpe.cpm.FIC10303B, root.hdpe.cpm.FIC10301, root.hdpe.cpm.FIC10302, root.hdpe.cpm.FIC10509, root.hdpe.cpm.FIC10409, root.hdpe.cpm.FIC10504, root.hdpe.cpm.LIC10401, root.hdpe.cpm.LIC10501 where mode = 'AUT' and time > now() - 30d align by device"
```
From the output I propose each region as mean ± 3 standard deviations, kept inside the observed minimum and maximum and
the loop's PV range, rounded to the loop's precision. The SME approves or changes the values; they are then entered in
Gate Configuration. Until a region is set, the "PV left its operating region" rule stays off for that loop.
A loop that returns no row (count 0) either had no AUT data or is not in the tree under that exact name: query 1 tells
which (FIC10303A is written here with a Latin A).

## What comes back to me

Paste the outputs of 1-4. I will return: the names to fix, the tags to retire, the Cascade loop list with shares, and
the region table for the SME.

---

## Results, Marun, 22 Nov 2026 (owner: go with the recommendations)

Run from `/opt/AMS-open` on the plant (Postgres container `instrumental-postgres`, IoTDB `ams-iotdb`).

### 1. Non-Latin names: none
Both queries returned 0 rows. The registry spells `FIC10303A` with a Latin A; the Cyrillic letters were only in the
Excel loop list. Nothing to fix.

### 2. The 18 tags that are not PID loops: active, never sent data
All 18 are registered and active, and none of them has a series in the historian. **Decision: retire them in Loop
Registry** (owner action at the plant; retire is built and audited):
`FQIC10103`, `FQIC10104`, `FQIC10304`, `FQIC40302`, `FQIC50102C` (registered as loop type FIC),
`I_HIC20110A`, `I_HIC20110B`, `I_HIC20110C`, `S-HIC51103_TSW`, `S-HIC51303_TSW`,
`SIC20303RMP`, `SIC20303_RAMP`, `SIC20511RMP`, `SIC20511_RAMP`, `SIC20521RMP`, `SIC20521_RAMP`, `SIC20531RMP`,
`SIC20531_RAMP`.

### 3. Cascade: no current loop in 30 days
Only `FIC10710` had Cascade samples (391,517 of 391,782, 99.9 %). It is not in the current loop list; its sample count
matches the loops retired on 16 Nov. AUT-only capture loses nothing today; Cascade matters again when cascade loops
are configured (Phase 5).

### 4. Operating regions for the priority-A loops (recommended; SME to confirm)
Mean ± 3 standard deviations of PV in AUT over 30 days, kept inside the observed minimum and maximum. Units = each
loop's PV units in the registry.

| Loop | Time in AUT | Mean | Std dev | Observed min – max | **Recommended region** | Note |
|---|---|---|---|---|---|---|
| FIC10301 Catalyst | 99.9 % | 62.48 | 3.68 | 12.7 – 144.3 | **51.4 – 73.5** | |
| FIC10303B Activator | 98.9 % | 16.15 | 0.92 | -0.9 – 29.5 | **13.4 – 18.9** | |
| FIC10401 Press. hexane R-1021 | 100 % | 799.99 | 9.62 | 730.3 – 858.0 | **771 – 829** | |
| FIC10402 Mother liquor R-1021 | 100 % | 38,134 | 3,843 | 26,380 – 42,649 | **26,600 – 42,650** | spread 10 % of the mean: likely several operating levels; SME to confirm or split by grade |
| FIC10409 Ethylene R-1021 | 100 % | 19,827 | 815 | 16,382 – 20,971 | **17,380 – 20,970** | |
| FIC10502 Mother liquor R-1022 | 100 % | 70,517 | 2,274 | 58,432 – 81,817 | **63,700 – 77,340** | |
| FIC10509 Ethylene R-1022 | 100 % | 21,444 | 802 | 17,745 – 22,483 | **19,040 – 22,480** | |
| LIC10401 Level R-1021 | 100 % | 10.00 | 0.52 | 7.2 – 12.6 | **8.4 – 11.6** | |
| LIC10501 Level R-1022 | 99.9 % | 10.02 | 0.98 | 2.6 – 18.7 | **7.1 – 13.0** | |
| FIC10504 Butene R-1022 | 100 % | 247.5 | 155.5 | -7.8 – 631.3 | none | spread covers the whole range: not one operating point |
| FIC10303A Activator | 40 % | 0.07 | 2.28 | -0.5 – 19.1 | none | near 0 most of the time (on/off dosing) |
| FIC10302 Catalyst | 0 % | – | – | – | none | data arrives but never in AUT in 30 days |
| FIC10501 Press. hexane R-1022 | – | – | – | – | none | only 23 samples in 30 days: no data feed |

A region is entered per loop in Gate Configuration (a LOOP-scope bundle, properties `G2r.pv_region_min` /
`G2r.pv_region_max`); until then the "PV left its operating region" rule stays off for that loop. A region that is too
narrow censors normal step responses, so the SME should widen any band that a routine setpoint change leaves.

**Enter them only after the SME confirms (corrected 22 Nov).** The same two properties drive gate G2r in the short tier:
a window with the PV outside the region more than 20 % of the time fails G2r, and the fused verdict for that window is
excluded (`EXCLUDED_OPERATING_REGION`). A region therefore also changes the Overview and the KPIs, not only System
Response: a grade change or a start-up outside the band would remove those windows' verdicts.

### Data gaps found (for the gateway / I&C)
- Practically no data in 30 days (11-36 samples): **FIC10501** (priority A), FIC30102, FIC30701, LIC30206, PIC10704.
- Not in the historian at all: PIC60251, PIC50306, IIC20101A / B / C, SIC20303, SIC20511, SIC20521, SIC20531.
- Partial: PIC51208 (2,361 samples), LIC50303 (89,697; the current loops have about 474,000).
- These loops get no System Response events until their data arrives.
