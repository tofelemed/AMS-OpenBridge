# Flink jobs — CPA slice (04b = 05)

Submit **after** prefixed topics in `kafka/topics.txt` exist. Unique names (Instrumental has no Flink).

`--bootstrap.servers` on Marun: `kafka-1:9092,kafka-2:9092,kafka-3:9092`  
`--input-topic` / output flags must be the **prefixed** names (Phase 5). Lab defaults are in the last column of `topics.txt`.

| Job name (Flink UI) | Class | Required this cut |
|---|---|---|
| `AMS - CPLM Short Feature Engine` | `com.ams.flink.cplm.CplmShortFeatureStreamJob` | yes |
| `AMS - CPLM Long Diagnostics Engine` | `com.ams.flink.cplm.CplmLongDiagnosticsStreamJob` | yes |
| `AMS - CPLM Gate Fusion Engine` | `com.ams.flink.cplm.CplmGateFusionStreamJob` | yes (submit last) |
| `AMS - Loop Live RBE Engine` | `com.ams.flink.cplm.LoopLiveRbeJob` | yes (live PV/SP/OP) |

On-demand (not in standing 04b): historical replay / A8 recompute from `cplm-api`.

**Do not submit:** `OpcEventStreamJob`, alarm IoTDB persistence, `LiveStateJob`, alarm KPI/export, `AnalysisExecutionJob`, `CplmGateStreamJob` (legacy double-producer).

Checkpoint: MinIO `s3://ams-flink/…`. Skip if job already `RUNNING`. Log REST submit into deploy log.

JAR: `src/flink/target/ams-flink-1.0-SNAPSHOT.jar` (same image `/opt/flink/usrlib/`).
