# Evidence and historian retention — answer to the SME

Date: 2026-11-03 · Plant: Marun, 143 loops · Proposal, nothing built.

**SME request:** keep the **24 h** evidence for **3 years** (or one turnaround); every other interval **on demand**
from the IoTDB time series.

## 1. Measured at the plant

| Item | Value |
|---|---|
| Free disk | 90 GB of 194 GB |
| IoTDB volume (`ams-cpa_iotdb-data`) | **1.7 GB** for data since 2026-09-01 (63 days) |
| IoTDB per day | **~27 MB/day** (≈ 0.19 MB per loop per day; upper bound — the volume also holds `root.ams` and the write-ahead log) |
| IoTDB retention today | `root.site1` **90 days**, `root.ams` 365 days |
| 24 h evidence set | ~950 KB per loop per day (full detail) |

The raw time series is **~4× cheaper per day than the 24 h evidence** it produces (27 MB vs 119 MB for the fleet),
and every interval's evidence can be rebuilt from it.

## 2. 24 h evidence for 3 years

| Option | What is kept | 3 years |
|---|---|---:|
| A | full detail, exact original, all 3 years | ~130 GB — does not fit |
| B | full detail, 32-bit values | ~59 GB |
| **C (recommended)** | full detail for 90 days, then a compact form (verdict and metrics exact; charts at 1-minute resolution with the min/max band; 3 example cycles) | **~25 GB** |

Each extra year on C adds ~5 GB (4–5-year turnaround ≈ 30–35 GB).

## 3. IoTDB retention — space and what it buys

| IoTDB keeps | Space | Every interval on demand reaches back |
|---|---:|---|
| 90 days (today) | 2.4 GB | 90 days |
| 180 days | 4.9 GB | 6 months |
| **1 year** | **9.8 GB** | 1 year |
| 3 years | 29.5 GB | 3 years |
| 5 years | 49 GB | 5 years |

Changing the IoTDB retention is one command, no release. Raising it is safe; **lowering it deletes data** at once.

## 4. Combined plans

| Plan | 24 h evidence | IoTDB | On demand reaches | Total | Of 90 GB free |
|---|---|---|---|---:|---:|
| 1 | C, 3 years | 90 days | 90 days | ~27 GB | 30 % |
| **2 (recommended)** | **C, 3 years** | **1 year** | **1 year** | **~35 GB** | **39 %** |
| 3 | C, 3 years | 3 years | 3 years | ~55 GB | 61 % |
| 4 | full detail 90 days only | 3 years | 3 years (24 h older than 90 days rebuilt, not original) | ~40 GB | 44 % |

Plan 2 keeps the 24 h proof for 3 years and lets engineers rebuild any interval (1 min … 12 h) for a full year,
within 40 % of today's free space. Plan 3 is the same with 3-year rebuilds once more disk is available.

## 5. On demand — what works and what is built in this release

| Case | Status |
|---|---|
| 12 h / 24 h result less than 14 days old | works today: rebuilt from IoTDB, every gate except G12 |
| any interval (1 / 5 / 10 / 15 / 30 / 60 min, 4 h, 12 h) at any time IoTDB still holds | **new "evaluate on demand"** (CHG-102): loop + interval + time → full evidence set from IoTDB, configuration in force at that time, labelled *Reconstructed*, kept 3 days |
| G12 response evidence | not rebuildable (event-based); kept 14 days |

A rebuild takes ~10–20 s per gate on a free Flink slot. A rebuilt set may differ slightly from the original if the
engine has changed since; the label says so.

## 6. Decisions for the SME

1. 24 h after 90 days in compact form (option C) — acceptable? If an exact copy is required for 3 years: ~130 GB.
2. IoTDB retention: **1 year** (plan 2) or 3 years (plan 3)?
3. Turnaround length, if longer than 3 years.

Note: the IoTDB loop data moves to `root.hdpe.cpm` (CHG-101); the chosen retention must be set on the new database.
