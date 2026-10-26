# CPM Overview KPIs: where they come from and how to read them

**For:** the data engineering team that will pick the Overview KPIs up from the CPM database.
**Covers:** the KPI cards of the **Operations overview** on the CPM Overview page (12 h window by default, 24 h on the switch).
**As of:** release v2.8.0 at Marun (2026-10-16).

## 1. Where the KPIs are

**They are not stored in any table.** cplm-api computes them each time the page loads:

1. It reads the newest result row of every monitored loop.
2. It classifies each loop with fixed rules.
3. It counts the loops in each class.

To get the same numbers, run **`overview-kpis.sql`** (next to this file). It applies the same rules in SQL and returns one row per KPI.

**Database:** PostgreSQL **`traverse_cplm`**, in the `instrumental-postgres` container on the plant VM (`192.168.190.91`). Read-only access to these two tables is enough:

| Table | What it holds | Columns used |
|---|---|---|
| `cpm.loop_registry` | one row per loop | `loop_id`; `monitoring->>'enabled'` (true = monitored, the population of every KPI); `site`, `area`, `unit` (optional scope) |
| `analytics.cplm_gate_results` | one row per loop per evaluated window, about every 15 min, kept 14 days | `loop_id`, `window_kind` (`'12h'` / `'24h'`), `window_end` (UTC), `purpose` (only `'LIVE'`), `created_at`, `diagnosis`, and in `payload`: `auto_pct`, `manual_pct`, `saturation_pct`, `gates.G3`, `gates.G4` |

Match `loop_id` case-insensitively (`lower(loop_id)`).

## 2. How each loop is classified

For one window kind (`12h` or `24h`), at one instant `as_of`:

1. **The row.** Take the loop's newest row with that `window_kind`, `purpose = 'LIVE'` and `window_end <= as_of`. If two rows tie, take the newest `created_at`.
2. **Fresh.** The row is fresh if `as_of − window_end ≤ 1 hour`.
3. **State:**

   | State | Rule |
   |---|---|
   | never evaluated | no row |
   | stale | the row is not fresh |
   | not assessable | `diagnosis` is empty, `PENDING`, `INSUFFICIENT_DATA` or `EXCLUDED…` |
   | assessed | anything else |

4. **Outcome of an assessed loop.** The band is the diagnosis text before the first `_`, the family is the text after it.

   | Outcome | Rule |
   |---|---|
   | acceptable | `NO_CALL` or `INSUFFICIENT_EVIDENCE`, **and** `auto_pct ≥ 0.95`, **and** `saturation_pct ≤ 0.10`, **and** G3 = `PASS`, **and** G4 ≠ `STRONG` |
   | finding | band `SUSPECTED` or `CONFIRMED` |
   | symptom only | band `DETECTED` or `CLASSIFIED` |

5. **Mode and saturation.** These apply to any fresh row, whatever its state:
   - **in auto mode:** `auto_pct ≥ 0.95`;
   - **in manual mode:** `manual_pct ≥ 0.50`;
   - **saturated:** `saturation_pct > 0.10`.

   A null value means not measured. A null `auto_pct` also means "not in auto mode", so the loop can't be acceptable.

The rules are taken from `src/services/cplm-api/Data/FleetKpiSql.cs` and `Services/Kpi/FleetKpiClassifier.cs`.

## 3. The KPIs

| KPI (card) | Count | Denominator |
|---|---|---|
| Performing acceptably | outcome acceptable | monitored loops |
| In auto mode | in auto mode | loops with a measured `auto_pct` |
| In manual mode | in manual mode | loops with a measured `manual_pct` |
| Oscillating | finding, family `OSCILLATION` | assessed loops |
| Suspected valve problem | finding, family `FINAL_ELEMENT_NONLINEARITY` | assessed loops |
| Excessive actuator effort | finding, family `EXCESSIVE_EFFORT` | assessed loops |
| Saturated / at limit | saturated | loops with a measured `saturation_pct` |
| Not assessable | state not assessable | monitored loops |
| Stale | state stale | monitored loops |
| Never evaluated | state never evaluated | monitored loops |

**Percentage** = 100 × count / denominator (the page rounds it to a whole number).

## 4. Reading them

```bash
psql -h <host> -p <port> -U <read-only user> -d traverse_cplm -A -F ',' -f overview-kpis.sql
```

- **Output:** 30 rows: the 15 KPI rows for `12h`, then the same 15 for `24h`. Columns `as_of, window_kind, kpi_key, label, count, denominator, pct`. All 30 rows always come back, with zeros if a scope matches no loop.
- **Parameters:** in the `kinds` and `params` blocks at the top:
  - `kinds`: the windows to compute, `'12h'` and `'24h'` by default;
  - `as_of`: `now()` for the current values;
  - `site` / `area` / `unit`: `NULL` for the whole plant.
- **Port and login:** plant operations provide them. On the VM, `docker port instrumental-postgres` shows the port.

**Checking your numbers:** run the query, then within a minute open the Overview page (12 h, whole plant). Each card's number should equal `count`, and its "% of N" should equal `pct` / `denominator`. Results arrive about every 15 minutes, so a difference of one loop can happen at that boundary; re-run and they should match.
