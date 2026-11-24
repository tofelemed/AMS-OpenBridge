# Evidence and daily KPI times follow the plant shifts (06:00 / 18:00)

| | |
|---|---|
| Status | **CONFIRMED 23 Nov 2026 (owner): option A.** Shifts are exactly 06:00–18:00 / 18:00–06:00 every day and the daily production report runs 06:00–06:00, so Marun gets `PLANT_DAY_START=06:00` in `migration/.env` **at the System Response release's Flink swap** (one restart). Built as CHG-106 (default `00:00` for other plants), 22 Nov, branch `feat/sr-mine`. Question 3 (day named by start or end date) not answered yet: the start date applies (default). |
| CHG | CHG-106 |
| Plant | Marun. Shifts: day 06:00–18:00, night 18:00–06:00 (Iran time, +03:30) |
| Depends on | v2.9.0 (deployed 2026-11-13), which brought the plant-time boundaries (CHG-102) |

## 1. Questions for the SME

1. Are the shifts exactly **06:00–18:00 and 18:00–06:00, every day** (no rotating 8-hour shifts, no weekend pattern)?
2. Does the plant's **daily production report run 06:00 to 06:00**? This decides option A or B below.
3. If the day runs 06:00–06:00, which date names it: the **start** date (22 Nov = 22 Nov 06:00 to 23 Nov 06:00) or the end date?

## 2. How it works today (v2.9.0)

- **Verdicts:** the 12 h and 24 h verdicts are rolling, recomputed every 15 minutes over the last 12 or 24 hours.
  This proposal does not change them. Overview and the KPI pages stay exactly as they are.
- **Saved evidence sets (boundary sets):** every day, every loop, the evidence of two windows is always saved and
  kept 30 days:
  - the 12 h windows that end at **00:00 and 12:00** Iran time;
  - the 24 h window that ends at **00:00**.
- **Daily KPI history (3 years):** one stored day per plant day, **00:00 to 00:00** Iran time.
- **The problem:** the 00:00–12:00 set holds the last 6 hours of the night shift plus the first 6 hours of the day shift.
  No saved set matches one shift, so a shift review or a crew comparison (manual-mode time, set-point changes per shift)
  cannot use them.

## 3. Proposal

**Option A (recommended, if the production day is 06:00–06:00)**: everything moves together.

| Item | Today | Option A |
|---|---|---|
| 12 h saved sets | end 00:00 and 12:00 | end **06:00 and 18:00** = one set per shift |
| 24 h saved set | 00:00 → 00:00 | **06:00 → 06:00** = a day shift plus the night shift after it |
| Daily KPI history | 00:00 → 00:00 | **06:00 → 06:00** |

**Option B (if the production day is midnight to midnight)**: only the 12 h sets move to 06:00 / 18:00. The 24 h set and
the daily KPI history stay at midnight.

Why not move only the 12 h sets in option A's case: a 24 h set ending at midnight would then cover parts of three shifts.

## 4. How it is built

One new setting, **`PLANT_DAY_START=06:00`** in `migration/.env`. The default is `00:00`, so another plant sees no change.
It must be a whole quarter hour: the long job fires every 15 minutes (06:00 Iran = 02:30 UTC, which is fine).

| Where | Change |
|---|---|
| Flink `src/flink/.../cplm/evidence/PlantClock.java` (`isBoundary`, lines 71-80) | boundary = day start and day start + 12 h for 12 h; day start for 24 h |
| Flink `EvidencePolicy.java` | new job argument `--plant-day-start` (default `00:00`), shown in the startup log line |
| `migration/04b-submit-flink-jobs.sh` (plant), `infra/docker/flink-submit-cplm.sh`, `infra/docker/flink-job-supervisor.sh` (lab) | pass `PLANT_DAY_START` to the long and fusion jobs |
| cplm-api `Services/Kpi/PlantClock.cs` (`DayOf`, `DayStart`, lines 96-117) | the plant day starts at `PLANT_DAY_START` |
| compose (`Cpm__PlantDayStart` for cplm-api) | forward the setting |
| tests | Flink `PlantClockTest`, `EvidencePolicyTest`, `LongBoundaryEmissionTest`; cplm-api `PlantClockTests`, `FleetKpiDailyTests` |
| frontend | only if the SME wants the day named by its end date (question 3) |

Rejected shortcut: `PLANT_TIME_ZONE=-02:30` would move "midnight" to 06:00 Iran time with no code change, but every
plant-time label in the application would then read UTC-02:30 instead of Iran time.

## 5. Deploy

- New Flink jar plus cplm-api, so a **full Flink swap**: the 12 h / 24 h verdicts take up to a day to refill.
- Ship it with the **next release that changes the jar anyway** (the System Response engine fixes, CHG-204..211), so the
  plant has one Flink restart, not two.
- Add `PLANT_DAY_START=06:00` to the plant `migration/.env` **before** the Flink swap and `deploy.sh`.
- After the swap, recompute the daily KPI days that can still be recomputed (section 6).

## 6. Effect on stored data

- **Saved evidence sets:** sets already saved at 00:00 / 12:00 stay readable until their 30 days pass. New sets are saved
  at 06:00 / 18:00. For up to 30 days both kinds are listed, each under its own end time.
- **Daily KPI history:** a stored day can be recomputed on the new definition only while its gate results are still
  kept (14 days). On 2026-11-22 that means the days from about **8 Nov** onward. The days from the deploy back-fill
  (about 31 Oct to 7 Nov) stay midnight days. **Each day of waiting adds one more midnight day.** The date where the
  definition changes goes into `prod_decision.md`.
- **Unchanged:** rolling verdicts, Overview, the KPI pages, retention, disk use.

## 7. Checks after the deploy

| Check | Expected |
|---|---|
| Flink long and fusion job logs, line `CHG-102: evidence emit=...` | plant time zone IR and day start 06:00 |
| Workbench, archived sets of one loop | the newest 12 h set ends 06:00 or 18:00 (+03:30) |
| `/health` `evidenceArchive` after the first 06:00 or 18:00 + 15 min | installed true, behind false, lostToSweep 0 |
| Daily KPI history | the newest stored day ends at 06:00 Iran time |
| `migration/daily-check.sh` section 7b | newest archived set at most 14 h old |

## 8. Records when it is built

- `changes_tracker.md`: the CHG entry (services, scripts, tests).
- `prod_decision.md`: rows "Plant day (CHG-102)" and "Evidence boundaries (CHG-102 5a)" get the day start, the SME's
  answer, and the date the definition changed.
