# Recompute from IoTDB instead of storing — how it works and what must stay stored

Date: 2026-11-03 · Questions: (1) if we keep nothing in PostgreSQL, can we recompute everything from IoTDB, as with
PI? (2) Flink stores its results in PostgreSQL today — how would on-demand runtime from IoTDB work?

## 1. Today's flow

```
Plant (OPC / PI)
  → Kafka  traverse.cpa.loop.samples.v1 (12 h)
      ├─► ams-api RawLoopIotDbConsumer ─► IoTDB  root.site1.cpm.<loop>.{pv,sp,op,vp,mode}   (raw, 90 d)
      └─► Flink live jobs (Short, Long, Fusion, Response) — continuous, every 15 min
              → Kafka result + evidence topics
              → cplm-api consumers ─► PostgreSQL traverse_cplm
                    results (verdicts 14 d), features (6 h / 24 h), evidence (6 h / 2 d),
                    episodes, acknowledgements, notes, configuration, registry
  → Workbench / CPM pages read cplm-api (PostgreSQL)
```

Flink never writes to PostgreSQL directly: it publishes to Kafka, and cplm-api stores what it consumes.

## 2. On-demand runtime from IoTDB

The pieces exist (`CplmHistoricalReplayJob`, source `iotdb`; `EVIDENCE_RECONSTRUCTION`):

```
Workbench: loop + interval + time  ─► cplm-api POST /analysis-runs
   cplm-api: looks up the configuration and registry in force at that time (PostgreSQL)
           ─► submits a Flink BATCH job (bounded)
   Flink: reads IoTDB [from, to) for the loop (+ peers for G13)
        ─► the same engine code as live ─► evidence + verdict
        ─► Kafka evidence topic, keyed by the analysis run
   cplm-api: stores it as a short-lived cache (STANDARD, 3 days)
   Workbench: polls the run status ─► shows the set, labelled "Reconstructed"
```

PostgreSQL here is a **3-day cache, not history**. Removing the cache means recomputing on every view (~10–20 s
per gate); the cache is small and already built.

Faster variant, same rule: one **always-running Flink on-demand job** reading a request topic, instead of submitting
a batch job per request — no job start-up per click. The project rule "Flink-only compute" means the engine is not
run inside cplm-api, even though the engine classes could be called directly.

## 3. What raw data alone cannot give

| Input to a result | In IoTDB? | Why it matters |
|---|---|---|
| Raw PV / SP / OP / VP / mode | yes | the signal |
| Configuration at that time (thresholds, profiles, OP ranges, criticality) | no | same data + today's thresholds = a different verdict |
| Engine version | no | every release changes some calculations |
| Registry and peer links | no | needed to run the analysis at all |
| History across windows (persistence, episodes, family debounce) | no | a verdict depends on earlier verdicts: a rebuild must replay days, not one window |
| Human actions (acknowledge, shelve, notes, reviews, validated models) | no | decisions, not calculations — never recomputable |

Recompute gives **what the engine says now**. Stored context gives **what it said then and what people did about it** —
the audit trail SME review 2 #18 asks for.

## 4. PI works the same way

| PI | Ours |
|---|---|
| PI Data Archive — raw time series | IoTDB |
| PI AF (SQL Server) — analysis configuration, hierarchy, **event frames** | PostgreSQL context: configuration, registry, episodes |
| PI Analytics outputs — written back as **stored tags** | verdicts / KPIs |
| Analysis backfill — recalculation on explicit request | "evaluate on demand" |

PI also keeps raw data in the archive, context in SQL, and stores its analysis outputs.

## 5. Recompute-only: costs

- **Speed:** the Overview reads 143 loops' current verdicts in 0.14 s; recomputing them per page load is minutes.
- **Compute:** ~10–20 s per gate per window on a Flink slot; concurrent users queue.
- **Reach:** limited to the IoTDB retention.
- **Drift:** late or corrected historian data silently changes old verdicts.

## 6. Recommended split

| Keep | Where | Size |
|---|---|---|
| Raw time series | IoTDB | ~10–27 MB/day |
| Verdict summary per window (gate statuses, diagnosis, score, **config version, engine version**) | PostgreSQL, or as numbers in IoTDB | a few KB per window |
| Configuration history, registry, episodes, acknowledgements, notes, shelving | PostgreSQL | a few MB in total |
| Evidence (charts, cycles, PSD, …) | **not stored — rebuilt on demand from IoTDB** with the stored config version; 3-day cache | ~0 |
| 24 h proof for 3 years (SME) | compact archive | ~25 GB |

Old engine versions are not kept runnable: after an engine release a rebuild may differ slightly and is labelled
*Reconstructed*.

**In one line:** almost all evidence storage can be replaced by recompute from IoTDB, as long as PostgreSQL keeps the
thin layer that cannot be recomputed — configuration, decisions and the verdicts people acted on.
