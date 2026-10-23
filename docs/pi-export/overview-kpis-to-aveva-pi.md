# CPM Overview KPIs → AVEVA PI: data hand-over

**For:** the data engineering team that will read the CPM (control-loop performance) database and write PI tags.
**Covers:** every number in the **Operations overview** KPI cards of the CPM Overview page (12 h window by default, 24 h on the switch).
**Status of the facts:** code as deployed at Marun in release v2.8.0 (2026-10-16). Source files are named so each rule can be checked.

---

## 1. The short answer

| Question | Answer |
|---|---|
| Are the KPIs stored in a table? | **No.** No KPI table, view, Flink job or historian series holds them. |
| How are they produced? | **At request time.** For each page load, cplm-api reads each loop's newest result row, classifies the loop with fixed rules (in C#), and counts. The result is cached in memory for 15 s only. |
| So what must you do? | Run the SQL in **`overview-kpis.sql`** (next to this file) on a schedule. It reproduces the classification and the counts exactly, in SQL, and returns one row per KPI. |
| Which database? | PostgreSQL database **`traverse_cplm`**, tables **`analytics.cplm_gate_results`** and **`cpm.loop_registry`**. Read-only access is enough. |

The IoTDB series `root.site1.cpm.<loop>.kpi.gate_12h` / `gate_24h` are **not** these KPIs: they hold one loop's raw window metrics and lack the mode, saturation and G3/G4 values the KPIs need. Do not use them for this.

---

## 2. Where the data lives

**Server:** the PostgreSQL container `instrumental-postgres` on the plant VM (`192.168.190.91`), database `traverse_cplm`.
Ask plant operations for a **read-only login** and the published port (`docker port instrumental-postgres` on the VM shows it). A minimal role:
```sql
CREATE ROLE pi_reader LOGIN PASSWORD '<set by operations>';
GRANT CONNECT ON DATABASE traverse_cplm TO pi_reader;
GRANT USAGE ON SCHEMA analytics, cpm TO pi_reader;
GRANT SELECT ON analytics.cplm_gate_results, cpm.loop_registry TO pi_reader;
```

### 2.1 `cpm.loop_registry`: one row per loop

| Column | Use |
|---|---|
| `loop_id` | loop key (match **case-insensitively**: `lower(loop_id)`) |
| `display_name`, `site`, `area`, `unit` | names and plant scope (optional filters) |
| `monitoring` (JSONB) | **`monitoring->>'enabled'` = true defines the "monitored" population.** Missing = false. `is_active` is not used. |

### 2.2 `analytics.cplm_gate_results`: one row per loop per evaluated window (the "fused verdict")

Written by the analytics engine about every 15 minutes per loop and window kind. Partitioned by day on `window_end`; kept 14 days.

| Column / JSON path | Meaning |
|---|---|
| `loop_id` | loop |
| `window_kind` | `'12h'` or `'24h'`: which rolling window the row evaluates |
| `window_end` (timestamptz, UTC) | end of the evaluated window; **recency = this column** |
| `purpose` | **only `'LIVE'` rows count** (others are replays / reconstructions) |
| `created_at` | tie-break when two rows share a `window_end` |
| `diagnosis` | the verdict code, e.g. `NO_CALL`, `SUSPECTED_OSCILLATION`, `INSUFFICIENT_DATA`, `EXCLUDED_MODE` |
| `confidence` | evidence score 0–1 (not used in any count) |
| `payload->>'auto_pct'` | share of the window in AUTO / CASCADE (0–1) |
| `payload->>'manual_pct'` | share in MANUAL (0–1; = 1 − auto_pct) |
| `payload->>'saturation_pct'` | share of the window with the controller output at a limit (≤ 5 % or ≥ 95 %) |
| `payload->'gates'->>'G3'` | control-error gate: `PASS` / `WARN` / `NOT_EVALUATED` |
| `payload->'gates'->>'G4'` | actuator-activity gate: `PASS` / `WARN` / `STRONG` / `NOT_EVALUATED` |

`auto_pct`, `manual_pct` and `saturation_pct` are JSON `null` when the window had too little data; the rules treat null as "not measured".

---

## 3. How each loop is classified

Done per monitored loop, for one window kind (`12h` or `24h`) and one evaluation instant **`as_of`** (normally "now").

1. **Take the newest row:** the loop's newest `cplm_gate_results` row with that `window_kind`, `purpose = 'LIVE'` and `window_end <= as_of` (ties: newest `created_at`).
2. **Freshness:** `fresh` = the row exists and `as_of − window_end ≤ 3600 s` (1 hour).
3. **State** (first rule that applies):

   | State | Rule |
   |---|---|
   | Never evaluated | no row at all |
   | Stale | row exists but not fresh |
   | Not assessable | `diagnosis` is empty, `PENDING`, `INSUFFICIENT_DATA`, or starts with `EXCLUDED` |
   | Assessed | anything else |

4. **Outcome** (assessed loops only). Band = the diagnosis text before the first `_`, family = the text after it:

   | Outcome | Rule |
   |---|---|
   | Performing acceptably | diagnosis is `NO_CALL` or `INSUFFICIENT_EVIDENCE` **and** in auto mode **and** not saturated **and** G3 = `PASS` **and** G4 ≠ `STRONG` |
   | No fault, but limited | diagnosis `NO_CALL` / `INSUFFICIENT_EVIDENCE`, but one of the four conditions fails (a missing G3 counts as a fail) |
   | Finding | band `SUSPECTED` or `CONFIRMED` |
   | Symptom only | band `DETECTED` or `CLASSIFIED` |
   | Unrecognised | any other code (should not occur; not shown on the page) |

5. **Mode and saturation flags** (fresh rows only, whatever the state):
   - in auto mode = `auto_pct ≥ 0.95`;
   - in manual mode = `manual_pct ≥ 0.50`;
   - saturated = `saturation_pct > 0.10`.

   A null value is "not measured": it is out of that KPI's denominator, and also means "not in auto mode" for rule 4.

**Thresholds** (cplm-api `KpiThresholds`; not overridden at Marun): fresh 3600 s, auto 0.95, manual 0.50, saturation 0.10.
Source: `src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs`, `FleetKpiModels.cs`, `Data/FleetKpiSql.cs`.

---

## 4. The KPIs

| Key | Card label | Count | Denominator ("% of …") |
|---|---|---|---|
| `acceptable` | Performing acceptably | outcome = acceptable | monitored loops |
| `normal-mode` | In auto mode | in auto mode | loops with a measured `auto_pct` |
| `manual-mode` | In manual mode | in manual mode | loops with a measured `manual_pct` |
| `oscillating` | Oscillating | finding with family `OSCILLATION` | assessed loops |
| `valve` | Suspected valve problem | finding with family `FINAL_ELEMENT_NONLINEARITY` | assessed loops |
| `effort` | Excessive actuator effort | finding with family `EXCESSIVE_EFFORT` | assessed loops |
| `saturated` | Saturated / at limit | saturated | loops with a measured `saturation_pct` |
| `not-assessable` | Not assessable | state = not assessable | monitored loops |
| `stale` | Stale | state = stale | monitored loops |
| `never-evaluated` | Never evaluated | state = never evaluated | monitored loops |

The query also returns `monitored`, `assessed`, `finding`, `symptom-only` and `no-fault-limited` (the coloured state bar under the cards).

**Percentage:** `100 × count / denominator`; the page rounds it to a whole number, and shows nothing when the denominator is 0.

**"Change" badge** on each card = this percentage minus the same percentage evaluated at `as_of − 24 h`. Do **not** push it: PI can derive it from the history of the `pct` tag. (Recomputing a past instant also works, but rows are updated in place, so it reflects today's stored rows, not exactly what was shown 24 h ago.)

---

## 5. The SQL

**File:** `overview-kpis.sql` (same folder). One statement, read-only, about 15 output rows. Columns: `as_of`, `window_kind`, `kpi_key`, `label`, `count`, `denominator`, `pct`.

Edit only the `params` block at the top:

| Parameter | Value |
|---|---|
| `window_kind` | `'12h'` or `'24h'`. Run it twice (once per window) to feed both tag sets. |
| `as_of` | `now()` for live values. A past `timestamptz` back-fills; it only works within the 14-day retention of `cplm_gate_results`. |
| `site` / `area` / `unit` | `NULL` = whole plant (what the page shows by default); a value scopes it like the page's plant filter. |
| thresholds | leave as they are, unless the page's thresholds change |

Example (psql):
```bash
psql -h <host> -p <port> -U pi_reader -d traverse_cplm -A -F ',' -f overview-kpis.sql
```

It was run successfully against the lab database on 2026-10-23; there the states summed to the monitored total (161 + 4 + 76 = 241).

### 5.1 Optional: per-loop values

If PI should also carry per-loop tags (e.g. each loop's state), the classification comes from the `classified` step of the same query. Replace the final `SELECT … FROM counts …` with:
```sql
SELECT loop_id, display_name, site, area, unit, window_end, d AS diagnosis, state, outcome, family,
       auto_pct, manual_pct, saturation_pct, g3, g4, in_mode, in_manual, saturated
FROM classified ORDER BY loop_id;
```

---

## 6. Suggested PI mapping

| Item | Suggestion |
|---|---|
| Tag naming | `CPM.<SITE>.FLEET.<WINDOW>.<KPI>.<FIELD>`, e.g. `CPM.HDPE.FLEET.12H.ACCEPTABLE.PCT`. Fields `COUNT`, `DENOM`, `PCT`; window `12H` / `24H`; KPI = `kpi_key` upper-cased with `-` → `_`. |
| Value types | `COUNT` and `DENOM` integer; `PCT` float (one decimal). When the denominator is 0, `PCT` is NULL: write "No Data" / bad quality, not 0. |
| Timestamp | the run's `as_of` (UTC). Not `window_end`: each loop's window ends at a different time. |
| Cadence | every **15 minutes**. Results arrive about every 15 min per loop (freshness allows four missed evaluations = 1 hour), so 15 min tracks the page closely. Faster gains nothing. |
| Load | one statement over ~175 loops, using the newest-row indexes on `cplm_gate_results`. Light; safe at this cadence. |
| Back-fill | optional: run with past `as_of` values in 15-min steps, up to 14 days back. |

---

## 7. Checking your numbers against the page

1. Run the query with `as_of = now()` and `window_kind = '12h'`.
2. Within a minute, open the CPM Overview page (12 h, whole plant) or call `GET /api/v1/cpm/fleet/kpis?windowKind=12h` through the gateway (logged-in user).
3. Each card's big number = `count`, and its "% of N" = `pct` rounded / `denominator`. A difference of one loop can happen at a window boundary (results arrive every ~15 min). Re-run, and it should match.

---

## 8. Things that will surprise you

- **Monitored ≠ loops in scope.** The page's top line "N loop(s) in scope" counts every registry loop; the KPI cards count only monitored ones (`monitoring.enabled = true`).
- **In auto / In manual / Saturated count loops in any state,** including not-assessable ones, as long as the newest row is fresh and the value is present. Their denominators differ from the others.
- **"In manual mode" = 1 − auto share ≥ 50 %.** UNKNOWN or empty mode samples count as manual.
- **"Oscillating" card text says "evidence ≥ 75"**, but the count tests only the band (suspected or confirmed) and the family, not the confidence. The SQL follows the count.
- **No fault identified is not "acceptable".** `NO_CALL` / `INSUFFICIENT_EVIDENCE` must also pass mode, saturation, G3 and G4. A G3 of `NOT_EVALUATED` fails.
- **Rows are updated in place** (same loop, window and end time can be rewritten with more samples). Always take the newest row as the query does; never sum rows.
- **After an engine restart,** the 12 h / 24 h windows refill over ~11 h / ~23 h. Meanwhile many loops read Stale or Not assessable. That is real, not a query fault.
- **Retention:** result rows are kept 14 days; there is no deeper history to back-fill from.

---

## 9. Not covered here

These are on the Overview page, but are not part of the KPI cards. Ask if they should go to PI too:

- **"Loops requiring review"** (priority queue): `GET /api/v1/cpm/fleet/rankings?orderBy=priority`, SQL in `src/services/cplm-api/Data/FleetPrioritySql.cs`.
- **Event trail:** `analytics.cplm_event_frames`, newest first.
- **Configuration-limits strip:** registry counts, `GET /api/v1/cpm/fleet/summary`.
- **The 14-day KPI trend:** on the KPI drill-down page. It is the same KPI query evaluated at past instants, so PI's own history replaces it.
