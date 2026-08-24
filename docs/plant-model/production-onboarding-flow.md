# Production data-entry flow — Plant Model, Loop Registry, and everything between

**Who this is for:** the team standing this platform up against a real plant (HDPE).
It answers one question: *when we set this up in production, who types what, where,
and in what order?* The order is not a preference — each stage is the lookup table
the next stage validates against, and the platform **enforces** it (unknown
hierarchy rejects a tag row; an unmodelled location rejects a loop with
`422 LOCATION_NOT_IN_UNS`).

The Plant Model page shows this pipeline live as the status strip at the top:

```
1 Hierarchy  →  2 Instruments & tags  →  3 OT aliases  →  4 Control loops  →  5 Ingestion
   (tree)          (devices + meas.)       (DCS bridge)      (CPM registry)      (data flows)
```

| Stage | Where | Who typically owns it |
|---|---|---|
| 0 Naming design | on paper | asset/instrument engineer + OT |
| 1 Hierarchy | SQL seed or Administration → **Plant Model** | asset engineer |
| 2 Instruments & tags | Plant Model **Import CSV** / `import-plant-tags.ps1` | instrument engineer |
| 3 OT aliases | same import (`ot_tag` column) / **Tag Aliases** page | instrument engineer + OT |
| 4 Control loops | CPM → **Loop Registry** / `import-cpm-loops.ps1` | process/control engineer |
| 5 Ingestion sources | Administration → **Data Sources** | OT / integration engineer |

---

## Stage 0 — Naming design (half a day, on paper, once)

Decide before anything is typed, because **path segments are permanent identity**
(they become IoTDB series, MQTT topics, Redis keys — renaming later means moving data):

- Segments are lowercase `snake_case`; a name starting with a digit gets a `u`
  prefix (`u1001_polymerization_reactor_1`) — IoTDB path nodes must not start
  with a digit. Human names ("1001-Polymerization Reactor 1") live in the
  display-name field and can change any time.
- Loop ids stay the plant's own tags (`45FIC-109`); dashes/dots fine, no spaces.
- Two tags that differ only in punctuation collapse onto one historian device —
  the registry rejects the second one (`LOOP_ID_HISTORIAN_COLLISION`).

## Stage 1 — Hierarchy: Site → Area → Unit

**Bulk (recommended for the initial load):** a generated, idempotent SQL seed —
the HDPE tree is [48_hdpe_plant_hierarchy.sql](../../database/scripts/48_hdpe_plant_hierarchy.sql)
(1 site, 7 sections + `Unassigned`, 25 units, 59 origin-ID aliases). Re-runnable;
survives re-deploys as part of `database/scripts/`.

**Incremental (day-2):** Administration → **Plant Model** → "+ Add Site" /
"+ Area" / "+ Unit" on the tree rows. The parent is always the node you clicked —
never free text — and the segment is auto-slugged from the name (editable at
create, immutable after).

*Guardrails you will meet:* path grammar is validated (letters/digits/`_`/`-`,
level shape checked); a node with live children — or one that control loops still
reference — refuses deletion with a 409 that says exactly what still hangs off it.

## Stage 2 — Instruments & tags: Device → Measurement

One row per **measurement** in the handoff sheet
([template](hdpe-tag-import-template.csv), columns documented in the
[README](README.md)). A device-only row (blank measurement) is fine for equipment
without signals yet.

**UI route:** Administration → Plant Model → **Import CSV** — three steps
(Source → Review → Import), nothing is written until the last step; the review
lists every asset that would be created and every row error.
**Script route (volume / repeatable):**

```powershell
.\scripts\import-plant-tags.ps1 -CsvPath instruments.csv -DryRun   # plan only
.\scripts\import-plant-tags.ps1 -CsvPath instruments.csv           # import
```

*Rules both routes enforce:* hierarchy is **never** created from a tag row unless
you explicitly opt in (`-CreateMissingHierarchy` / the checkbox); level cells
accept segments (`section_300`) or display names ("Section 300"); re-runs are
idempotent (existing paths are skipped, not duplicated); parents are derived from
the path server-side, so row order never matters. Asset writes go in batches of
2 000 per request against a 5 000/request server cap.

## Stage 3 — OT aliases: the DCS bridge

Every measurement whose data will arrive from the DCS needs an alias:
`45FT109.PV → hdpe/section_300/u3005_butene_recovery/45ft109.pv`
(`source_system: ot-gateway`). Without it, an incoming event **parks** as an
unknown tag instead of flowing — reviewable, mappable later, but no history for
the unmapped period.

- Normally you never enter these separately: the tag import's `ot_tag` column
  writes them in the same run.
- Corrections and one-offs: Administration → **Tag Aliases** (list, search, add,
  delete, its own CSV import). Legacy path + source system are immutable
  identity — fixing a wrong one is delete + recreate.

## Stage 4 — Control loops: CPM → Loop Registry

A loop is **enrollment, not a new asset**: it groups four to five existing
signals (PV/SP/OP/MODE/VP) under the plant's loop tag with type, criticality and
a monitoring flag — the configuration the CPLM analytics engine consumes.

One row per loop in the worksheet ([template](hdpe-loop-worksheet-template.csv)):
loop tag, service, location segments, loop type (mandatory — it selects the
dynamics profile), criticality, the **DCS tag name per role**, and the OP
engineering range.

**Script route (recommended — it is the only route that stores `sourceTag` and
the OP range):**

```powershell
.\scripts\import-cpm-loops.ps1 -CsvPath loops.csv -DryRun
.\scripts\import-cpm-loops.ps1 -CsvPath loops.csv -WriteSignalAliases
```

**UI route:** CPM → Registry → the 5-step wizard (single loops; the location is
picked from the asset-model cascade, so typos cannot invent sites) or its CSV
import (bulk, one request per file).

*What activation does for you:* validates the location against the plant model
(`422 LOCATION_NOT_IN_UNS` unless you explicitly override), then **projects** the
loop into the tree — a Device node (`CpmLoop`, ISA-88 control module) under its
unit with the signal Measurements beneath it. Those nodes wear a **CPM badge** in
the Plant Model tree that links back to the loop; the loop's detail card links
back with **"View in plant tree"**. Retiring a loop releases exactly what its
projection created, nothing else.

*Rollout practice:* don't onboard all loops at once. Pilot 2–3 end-to-end
(activate → readiness green → data flowing → first verdicts after ≥ 12 h of
samples), then batch the rest per unit.

## Stage 5 — Ingestion sources: turn the data on

Administration → **Data Sources**: one config per feed (process telemetry,
alarms, loop signals) with broker details and, for alarms, the DCS
priority-band map. Configs created here take effect when the ingestion
subscriber runtime ships (phase 2); the mapping stores it will read — aliases,
the loop registry's source tags — are exactly what stages 3–4 filled.

---

## Go-live checklist

- Status strip on Plant Model shows all five stages green.
- Spot-check a tag end-to-end: **Tag Aliases → resolve** finds the asset;
  `GET /api/bindings/resolve?path=…` answers `provenance: "asset-model"`
  (a `"fallback"` provenance means the asset row is missing — the binding
  points at a location nothing writes).
- Every pilot loop: CPM → Registry → readiness shows `ready: true`; the loop's
  device and signals are visible under their unit in the tree.
- Nothing sits under `hdpe/unassigned` that shouldn't.

## Day-2 operations (the short version)

| Change | Where | Notes |
|---|---|---|
| New instrument / tag | Plant Model tree or a small CSV re-import | re-imports are idempotent |
| New loop | Loop Registry wizard, or add a worksheet row and re-run the script | re-activation is an upsert |
| Rename a display name | Edit on the node / loop | safe any time — names are labels |
| Rename a path segment | **not supported** — segments are identity | model the new node, migrate, retire the old |
| Retire an instrument | delete measurements → device (bottom-up) | blocked while loops reference it — retire/remap the loop first |
| Retire a loop | Loop Registry delete | analytics history is kept; projected assets are released |
| New DCS tag appears | it parks as unknown → add the alias | flows from the next event on |

**Permissions:** stages 1–3 need `asset.edit` (engineer/admin roles); stage 4
needs `cpm.manage`; stage 5 needs `ingestion.manage`. Reads are open to any
authenticated role.
