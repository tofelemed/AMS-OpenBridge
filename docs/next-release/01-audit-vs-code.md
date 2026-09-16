# Next release (v2.5) — audit of the v6 spec against the code

Audited on branch `feat/ot-loop-ingestion` at `5cec34ef` (code identical at `8899c684`, which only removed docs/test-data files). Every verdict cites file:line in the source, not documentation.

## Audit of record — spec gap register vs. code

| Gap | P | Verdict | What the code does today (evidence) | Phase |
|---|---|---|---|---|
| R01 G12 is not a system-response analysis | P0 | **NOT DONE** | `CplmGateFusionEngine.java:207-216` — boolean step-test flag → PASS / `NO_STEP_TEST`. No response package, no estimators, no numeric lib (`src/flink/pom.xml`: junit only). | 2 |
| R02 Generic final-element confirmation unsound | P0 | **PARTIAL** | Confirmed requires conf ≥ 0.90 **and VP present** (`CplmGateFusionEngine.java:590-618`); VP caps at 0.89 (`:237,412`) — VP presence is still the physical discriminator; no positive non-following evidence required. Persistence cap `:435-479`. | 1E |
| R03 Native per-role fidelity not preserved | P0 | **NOT DONE** | `LoopJoiner.cs:10-14` `LoopTuple` has ONE `EventTsMs` + ONE `Quality`; per-member ts exists internally (`Member{Value,TsMs,Good}` `:63`) and is dropped at serialisation; VP/MODE held forever, hold invisible (`:306-311`); vp/mode quality ignored (`:312`). | 1A |
| R04 Unknown/numeric quality → GOOD | P0 | **NOT DONE** | `OtPayloadParser.cs:80-86` `Str(root,"quality") ?? "GOOD"` — numeric quality silently dropped; `LoopJoiner.IsGood :338` "g"-prefix; `CplmNormalizedSample.isGoodQuality :106-117` null ⇒ good; no `IsFinite` anywhere; `Double.parseDouble("NaN")` accepted. | 1B |
| R05 5 s capture vs fast dynamics | P0 | **NOT DONE** | `LoopIngestConfig.cs:67` grid 5 s; `minSamplesPerPeriod=8` applied only inside the long job (`CplmGateEngine.java:372,519-571`); no per-loop acquisition policy, no bandwidth eligibility reason surfaced. | 1D, 2G |
| R06 G2/G4 unit-dependent | P0 | **PARTIAL** | G2 `spRangePassMax` default 1.0 EU (`CplmLoopDynamicsProfile.java:92`), not span-relative; G4 `>8.0 / >3.0` hardcoded (`CplmGateEngine.java:253-257`). G3 band is span-based (C01 done: `CplmLoopDynamicsProfile.java:127-132`). | 1D |
| R07 Geometry/lag over-interpreted | P0 | **PARTIAL** | G8 `computeHorch :1003-1038` is a cross-correlation non-reciprocity index labelled "oddness" and feeds stiction (`:427`); G9 geometry safeguards exist (`isGeometryDecisiveForbidden`). | 1E, 2C |
| R08 Limits/freeze rely on samples | P0 | **PARTIAL** | G10 `satLowPct/satHighPct` 5/95 + `satLimitDwellSamplesWarn=30` (profile, `CplmLoopDynamicsProfile.java:94-97`) — samples not seconds, no engineering-range limits; G11 `freeze ≥60 s && ≥10 % window` hardcoded (`CplmGateEngine.java:472`). | 1D |
| R09 G13 links are not interaction analysis | P1 | **NOT DONE** | `CplmGateFusionEngine.java:218-229` boolean `hasPeerLinks` from broadcast `cplm.loop.evidence`. | 2F |
| R10 Missing evidence closes an episode | P0 | **NOT DONE** | `CplmEventFrameService.cs:33-40,144-153` — EXCLUDED/INSUFFICIENT/NO_CALL close open frames. | 1F |
| R11 Response/health wait on long fusion | P0 | **NOT DONE** | Fusion 12h/24h only (`CplmGateFusionStreamJob.java:108-110`), 4h never fused; no fast condition path. | 1D, 2B |
| R12 Per-gate evidence plots incomplete | P0 | **NOT DONE** | Engine emits scalars only (`CplmGateResult.java`, `CplmLongDiagnosticsResult.java`); UI has 8 generic charts, no ACF/PSD/fit/residual/Bode (`historical/chartOption.ts`, `CpmReplay.tsx:158-195`). | 2C, 2E |
| R13 Evidence drawer selects latest | P0 | **NOT DONE** | `GateEvidencePanel.tsx:63` `useLatestGates`; static `GATE_ROLES :36-44` (3 copies incl. `CpmReplay.tsx:31`, `ProfileAside.tsx:27`). | 2E |
| R14 Mixed units on one axis | P1 | **NOT DONE** | `historical/chartOption.ts:165-197` one yAxis for PV/SP/OP/VP; tooltip local time, no unit/quality. | 2E |
| R15 Instrumental NAMUR integration | P0 | **NOT DONE** | Zero hits for NAMUR/NE107/instrument health in ingestion, Flink, cplm-api, DB; UI only `utils/quality.ts`. | 1H |
| R16 Configuration panel | P0 | **NOT DONE** | Only `thresholdProfileId` free text (`AddLoopWizard.tsx:265`), fire-and-forget metadata broadcast (`CpmLoopRegistryService.cs:1673-1737`), no endpoints/lifecycle. | 3 |
| R17 Config scoping/fallback unsafe | P0 | **NOT DONE** | Static `SPINE` map (`CplmDynamicsParameterSetSupport.java:39`), parse failures swallowed (`:64-66,281,337,381`), field overlay on class pack (`:174`), canonical topic gated off by default (`CplmParameterSetBroadcastSupport.java:41-47`). | 3C |
| R18 Window/state changes ≠ hot params | P0 | **NOT DONE** | Windows compiled (`CplmShortFeatureStreamJob.java:57-127`, `CplmLongDiagnosticsStreamJob.java:39-47`); no change-class model. | 3A, 3F |
| R19 Run identity/historical context | P0 | **NOT DONE** | Upsert guarded by `sample_count` (`CplmResultConsumerService.cs:208-226`); replay writes the live topic (`CplmHistoricalReplayJob.java:47`), Kafka-only input; no run/purpose/bundle ids. | 1G |
| R20 Heartbeat disguises stale | P0 | **PARTIAL** | RBE heartbeat keeps `p.ts` (`LoopLiveRbeJob.java:294,304`) — good; quality-only change does not pass value deadband (`:258-270`); UI shows one `ts` (`mqttStore.ts:134-146`). | 1C |
| R21 Latency claim start point | P1 | **NOT DONE** | No source-vs-tuple latency measurement anywhere. | 4 |
| R22 Persistence/recovery carried forward | P0 | **PARTIAL** | At-least-once + poison-pill skip exists (`CplmResultConsumerService.cs:76-81,144,186-191`); no reconciliation/backlog metric. | 1G |
| R23 Identity/SQL-init/build/scope | P0 | **PARTIAL** | Flink test suite does not compile (`CplmLoopDynamicsAwareTest.java:304,312` → `GateFusionCoProcess` vs actual `GateFusionProcess`); lab/prod schema drift (`migration/schema/03` hand-merged). | 0 |
| R24 Lifecycle catalogue vs work control | P1 | **PARTIAL** | Ack/shelve on event frames only (`CpmEventsController.cs:98-121`); notes piggyback on ack (`CpmReplay.tsx:447-472`). | 2D |
| R25 Tag-derived loop class | P0 | **NOT DONE** | `cpm.loop_registry.loop_type CHECK IN (FIC,PIC,PIC_GAS,PIC_VAPOUR,LIC,TIC,UNKNOWN)` (`32_cpm_loop_registry.sql:33-34`); `dynamicClassOf` client-side (`registryShared.ts:18-24`). | 2G |
| R26 Version strings don't identify behaviour | P0 | **NOT DONE** | Only `calculationVersion="3.0.0"`/`dynamicsProfileVersion="2.0.0"` in payload JSONB (`CplmGateResult.java:126-127`); no jar/config/bundle hash. | 1G |

**Build conflicts C01–C07 resolved against code:** C01 span band **is** in code (0.005 × span, fallback 0.5). C02 quiet-tick skipping + newest-member time **is** in code (`LoopJoiner.cs:292-302`). C03 300 s heartbeat **is** in code and does *not* refresh ts. C04 MIN_SAMPLES=32 **is** in code (`CplmLongDiagnosticsStreamJob.java:47`). C05 unresolved: ~45 parser fields, G4 3/8 hardcoded → Phase 3 catalogue closes it. C06 no late side-outputs; short lateness 30 s…3 min per branch, long timer skips ahead — record in capability manifest. C07 → R26 task.

**Retained (do not rebuild):** 12 CPM pages, registry + wizard + bulk import, engineering ranges, linked 4-lane historical chart, phase-plane replay, event frames ack/shelve, audit chain, fleet reads with index probes + cache, at-least-once consumers with static membership, 6 short window branches, long 15-min timer, YAML dynamic-class packs, replay job, RBE heartbeat.

---

