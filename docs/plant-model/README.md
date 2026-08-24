# Plant model handoff — tags and loops

How the real HDPE instrument list and control-loop worksheet get into the platform.
The hierarchy (Site → Area → Unit) is already seeded by
[48_hdpe_plant_hierarchy.sql](../../database/scripts/48_hdpe_plant_hierarchy.sql);
these two imports layer the tags and loops onto it. Order matters
(docs/ot-data-integration/07): **hierarchy → tags + aliases → loops → ingestion**.

Two ways to run each import:

| Route | When |
|---|---|
| **UI** — Administration → Plant Model → Import CSV (tags) / CPM → Registry → Import (loops) | Interactive, small-to-medium files, visual review step |
| **Scripts** — [`scripts/import-plant-tags.ps1`](../../scripts/import-plant-tags.ps1) / [`scripts/import-cpm-loops.ps1`](../../scripts/import-cpm-loops.ps1) | Volume loads, repeatable/CI, and the loop fields the UI wizard cannot set (`sourceTag`, `engineering`) |

## 1. Tag import — one row per measurement (or per device)

Template: [hdpe-tag-import-template.csv](hdpe-tag-import-template.csv)

| Column | Meaning | Example |
|---|---|---|
| `site`, `area`, `unit` | **Path segments** from the seeded tree (`hdpe`, `section_300`, `u3005_butene_recovery`). The UI importer also accepts display names ("Section 300"); the script requires segments or names that slug to them | `hdpe` |
| `device` | The instrument/equipment node (lowercase; slugged if needed) | `45ft109` |
| `measurement` | Leaf name after the dot; blank = the row only ensures the device | `pv` |
| `name` | Display name of the measurement (or device when no measurement) | `45FT-109 Flow` |
| `description` | Free text | |
| `engineering_unit` | `m3/h`, `degC`, `barg`, `%` … | |
| `range_lo`, `range_hi` | HMI scale limits | `0`, `250` |
| `device_template` | Type label — powers collections/asset-relative displays (`Transmitter`, `Pump`, `Valve`) | |
| `ot_tag` | **Exact DCS/OT tag name** → written to `alias_mapping` (`source_system: ot-gateway`) so incoming telemetry resolves | `45FT109.PV` |

```powershell
.\scripts\import-plant-tags.ps1 -CsvPath tags.csv -DryRun     # show the plan, write nothing
.\scripts\import-plant-tags.ps1 -CsvPath tags.csv             # import
# -CreateMissingHierarchy   opt-in: also create unknown site/area/unit rows
# -NoAliases                skip the ot_tag → alias rows
```

Rules (same as the UI): hierarchy is **never** auto-created unless explicitly asked;
rows referencing unknown hierarchy fail alone; re-running is safe — existing paths
are reported as `already exists`, not duplicated. Parents are derived server-side
from the path, so row order never matters.

## 2. Loop worksheet — one row per control loop

Template: [hdpe-loop-worksheet-template.csv](hdpe-loop-worksheet-template.csv)

| Column | Meaning |
|---|---|
| `loop_id` | The plant's own tag (`45FIC-109`); dashes/dots fine, no spaces |
| `display_name` | Service description ("Butene recycle flow") |
| `site`, `area`, `unit` | Path segments — validated against the asset model on activation |
| `loop_type` | `FIC PIC PIC_GAS PIC_VAPOUR LIC TIC UNKNOWN` — mandatory (drives the dynamics profile) |
| `criticality` | `low medium high critical` |
| `pv_ot_tag … vp_ot_tag` | The **DCS tag names** for PV/SP/OP/MODE/VP — stored as `sourceTag` (the ingestion joiner's key). VP optional |
| `op_min`, `op_max` | OP engineering range (G2r/saturation need it when OP is not 0–100 %) |
| `enable_monitoring` | `true`/`false` (default true; true requires PV/SP/OP/MODE) |
| `profile` | Optional threshold profile id |

UNS signal paths are derived by convention: `{site}/{area}/{unit}/{loop_id_lower}.{role}`.
Activation auto-creates the loop's Device node + signal assets under its Unit.

```powershell
.\scripts\import-cpm-loops.ps1 -CsvPath loops.csv -DryRun
.\scripts\import-cpm-loops.ps1 -CsvPath loops.csv
# -WriteSignalAliases        also write pv_ot_tag → signal-path alias rows
# -AllowUnmodelledLocation   explicit override for locations not in the tree
```

Both scripts authenticate through the gateway (`-GatewayUrl`, default `http://localhost:8081`;
`-Username`/`-Password`, default the bootstrap admin) and exit non-zero when any row failed.
