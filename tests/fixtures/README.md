# Loop-registry bulk-import fixtures

CSVs for exercising **CPM → Loop Registry → Import CSV** (upload the file, or paste its
contents). Regenerate or resize with
[`scripts/make-loop-registry-csv.ps1`](../../scripts/make-loop-registry-csv.ps1):

```powershell
.\scripts\make-loop-registry-csv.ps1 -Count 50                    # 50 good rows + 8 fault rows
.\scripts\make-loop-registry-csv.ps1 -Count 200 -Clean -Prefix BULK
.\scripts\make-loop-registry-csv.ps1 -Count 25 -Site houston -Unit crude1 -Path .\my.csv
```

| File | Rows | Purpose |
|---|---|---|
| `loop-registry-50-loops.csv` | 50 valid + 8 invalid | the everyday case: import, and see every validation fire |
| `loop-registry-200-loops.csv` | 200 valid | exceeds the per-minute mutation window — exercises the automatic pause/resume |

Both target `houston/crude1`, which exists in the lab asset model. Change the location with
`-Site` / `-Area` / `-Unit`; a location that is not in the asset model still imports but is
flagged in the preview.

## What the files exercise

* **Derived signal paths** — most rows leave `pv_tag … vp_tag` blank, so the importer derives
  `site/[area/]unit/<tag>.<role>`. Every 10th row spells the paths out explicitly (including
  `vp_tag`) to prove both styles mix in one file.
* **Real plant tags** — ids carry dashes (`DEMO-FIC-001`). VP is only mapped where given.
* **The CSV comma trap** — every 7th row has a quoted service description containing a comma.
* **`#` comment lines** — ignored by the parser.

## The 8 deliberately-invalid rows (in the 50-row file)

Each should appear red in the preview with a specific reason, and must not be imported:

| Row | Expected complaint |
|---|---|
| `DEMO-BAD-001` | missing `loop_type` |
| `DEMO/BAD/002` | `/` is not allowed — the loop id is a URL path segment |
| `DEMO-BAD-003` | `loop_type` FLOW is not in the served contract |
| `DEMO-BAD-004` | criticality `urgent` is not low/medium/high/critical |
| `DEMO-BAD-005` | `pv_tag` is the dotted `root.…` historian form, which the binding resolver cannot resolve |
| `DEMO-BAD-006` | location `narnia/unit9` is not in the asset model (**warning only** — this row still imports) |
| `DEMO-FIC-001` (2nd) | duplicate tag in file |
| `DEMO_FIC_001` | historian collision with `DEMO-FIC-001` — both sanitise to `DEMO_FIC_001` |

## How many loops per import?

**Up to 5 000 in one import**, and a 1 000-loop file lands in about 8 seconds.

The importer sends the whole file in a **single** `POST /api/v1/cpm/loops/bulk-activate`.
That matters twice over: the gateway counts one mutation per *request*
(`RateLimiting:MutationPerMinute` = 120 per user per 60 s), so a row-by-row import used to
stall at 120 loops with `429`s; and the server can only batch its own work when it receives
the whole set.

Measured with `scripts/test-bulk-activate.ps1`:

| Batch | Import | Retire (incl. releasing projected assets) |
|---|---|---|
| 200 | 1.0 s (5 ms/loop) | 0.8 s (200 loops + 800 assets) |
| 1 000 | 3.0 s (2.9 ms/loop) | 2.6 s (1 000 loops + 4 000 assets) |

For comparison, the old per-row path (`scripts/measure-loop-import-throughput.ps1`, 4 workers)
managed ~33 ms/loop **and could not exceed 120 loops at all**; retiring 1 000 loops took over
seven minutes.

What made it fast — each of these was an N+1 that is now done set-at-a-time:

| Was | Now |
|---|---|
| 2 collision `SELECT`s per row (one reading the whole registry) | 1 query, then collide in memory |
| 1 transaction + `INSERT` per row | 1 transaction, multi-row `INSERT` in chunks of 500 |
| up to 10 asset-model round trips per loop (a by-path `GET` + `POST`/`PUT` per signal) | 1 `POST /assets/by-paths` + 1 `POST /assets/bulk` per 1 000 |
| a connection + 3 queries + an awaited Kafka delivery per loop (evidence) | 2 queries, 2 `UPDATE`s, and one flush for the batch |

Per-row outcomes are preserved throughout: a bad row fails alone (`SAVEPOINT` per chunk with a
row-by-row fallback), and the response carries a result for every submitted row.

Two bounds remain, both deliberate: **5 000 rows** per request (`MaxBulkLoops`) and an **8 MB**
request body (`BodyLimits:BulkImportBytes`) — the UI flags an oversized file before sending.

## Retiring loops

`POST /api/v1/cpm/loops/bulk-delete` takes a list of ids and is also one mutation. It fixed a
leak worth knowing about: the per-loop `DELETE` removed the registry row (cascading the
signal-asset ledger) but **never released the assets the projection had created**, so every
onboard/retire cycle left orphaned `CpmLoopSignal` measurements in the UNS — visible in the
designer's tag picker forever, and mistaken for user-owned assets by any later projection onto
the same path. Retirement now deletes the assets it created and clears only the transport
overrides on assets that pre-existed. `DELETE /loops/{id}` routes through the same code, so the
single-loop path is fixed too.

If you ran the older build, `scripts/cleanup-orphan-loop-signal-assets.ps1` finds and removes
the leftovers (`-WhatIf` to report only).

> Two things that look like failures but are not: `GET /assets/by-path/...` answers **200 with an
> empty body** when an asset is absent, and the gateway **TTL-caches `GET /api/assets*` for 60 s**,
> so a freshly deleted asset can still be served from cache. Add a cache-busting query
> parameter when asserting on deletion.
