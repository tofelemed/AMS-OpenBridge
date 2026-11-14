# Item 0 sweep: ids, versions and technical details (CHG-184)

Owner review 2026-11-14, item 0, with the owner decisions of 2026-11-15: Q1 yes (Pipeline Health and
Administration too), Q6 (Record details removed everywhere), item 11.3 (Identity & raw tab and the
Rules & parameters CONFIGURATION section), item 9 (Workbench run id), item 15 (Reconstruct Run UUID),
item 12 ("unit not set").

Swept: every page and dialog under `components/Cpm/**` and `components/Administration/**`, plus the
shared trend panel `ui/trend`. Exports (CSV, zip) are not UI and keep their content.

## Removed and kept, page by page

| Page | Removed | Kept, and why |
|---|---|---|
| Evidence Workbench, header | Run id with its copy button (`RunSummaryBar`, item 9); "(run <id>)" in "Reconstruction accepted"; "predate v2.5" in the empty state | Proof retained state, the non-live purpose pill (SHADOW / EVALUATE), Reconstruct and Evaluate a window: what the user acts on |
| Evidence Workbench, tabs | The Identity & raw tab and everything in it: run, build commit, jar, bundle, dataset, revisions, calculation and profile versions, Copy run ID, Copy identity record, the window's flags card, the artifacts table, Raw record (item 11.3). `?sub=identity` and `?tab=identity` land on Proof | The window's flags are on Investigation, Performance and Replay |
| Evidence Workbench, Rules & parameters | CONFIGURATION section (bundle hash, copy, "Configuration used by this run ↗" and its drawer), method version ("v3.0.0"), Tier row, Capability row, "· bundle v4" in the thresholds line, "in this build", method code on hover; method code / version / capability keys in Parameters used | What the gate asks, Needs, Role, the method's plain name, the parameters, the thresholds line with its profile and time, the pinned note. Plain "Needs", the role casing and the profile name are Task 5 (CHG-187) |
| Evidence Workbench, Proof | The Metric column (CPLM-0xx) of the G0–G4 input table | Input, value, unit. The 19 calculation names are unique, so no code is needed to tell two apart; Task 5 puts the code in each row's ? tip (spec 11.1) |
| Evidence Workbench, gate states | "Method not installed in this build" with the method code and state; "The method run id does not resolve…" | "Method not available" with the reason in words |
| Evidence Workbench, evidence basis | "Built by commit abcdef12" / "an unrecorded build" | The reconstruction summary and "The retained proof is unchanged." |
| Evidence Workbench, Evaluate a window | "Flink" and "(Kafka)" in two error messages | The job's readable name ("CPLM On-Demand Evaluation") |
| Reconstruct evidence dialog | Run row with the UUID (item 15) | Loop, Gate, Window |
| Calculations | Metric code beside the panel title and under each list row ("CPLM-010 · G3" → "G3"); Record details button and dialog (window qualification, evidence-score band, "Gate in stored results", the `cplm_*` table name); Identity & raw ↗; the versions in the stale warning; the re-run id in the foot | Value, unit, gate, method; Rules & parameters ↗; Open proof →; the stale warning without versions; Run details |
| Run details dialog (Calculations and Replay) | Decision run (G15) id, bundle hash, calculation and profile versions, engine build | Gate tally, Computed, Proof retained and its note |
| Evidence Replay | Re-run id in the foot pill and in the result dropdown (several re-runs read "Re-run 1", "Re-run 2" in computed order); "today's engine build" in the re-run dialog; "Not available in this release"; "unit not set" on the phase-plane axis | The id stays the dropdown's value (the address needs it) |
| Trends (Overview, Loop Explorer, Investigation, Replay) | "(unit not set)" on the PV / SP axis: it reads "PV / SP" when the loop has no unit | The unit when the registry has one |
| Shared trend panel (`ui/trend`, design gallery only) | "unit not set" in axis names, value cells, table headings and the chart description | — |
| Loop Events | Record details button and dialog (fault family, calculation and profile versions, support until, item 1); "v2.5" in the availability texts | The episode facts, Historical ↗, Loop ↗. EVT codes: see Owner questions |
| Window Inspector | Record details button and dialog (Q6). The window's values are on the page "Inspect this window →" opens (Workbench proof table or Replay) | Feature flags, Sample density, Engine & timing (see Owner questions) |
| Loop Registry | Record details button and dialog (objective · topology · command, acquisition, model set by) | Those facts are on the Loop Explorer's model card |
| Historical | Technical details disclosure with the calculation version; the run id in the Review button's tooltip; "(before v2.5)" | Samples, now a plain row |
| Loop Explorer | Lineage: the engine name ("· Flink") and "· calc 3.0.0"; transmitter health: "Mapping version · NE107 interpretation v1" and "· rev N"; the health lane's "· rev N"; "(before v2.5)" in the gate detail | Device tag, NE107 flags, diagnostics, the gate count. Historian device: see Owner questions |
| Loop Explorer, effective configuration drawer | Bundle hash in the bundle pill ("LOOP v2 · f9153b00" → "LOOP v2"); jar and catalogue hash columns and the ACK hash in APPLY acknowledgements | Property keys, values, sources, job names and what each applied |
| Investigation | "predates v2.5" in the older-result texts; "(before v2.5)" in the gate proof dialog | "This is an older result" |
| Performance (gate dialog) | Run id in the Workbench button tooltip; "(before v2.5)" | — |
| System Response, Steps & data | Method row (method code and version), Run (id, copy), Bundle (hash, copy), "· rev N" after Purpose | Window, eligibility and finding, Purpose; the subgate outputs and the quantity Method column (see Owner questions) |
| System Response, model review dialog | Model id and "created from event" id | Family, path, revision (the decision is bound to it), estimator, parameters |
| Gate Configuration, band | Record details (content hash, etag, created, updated, note, catalogue hash) | The bundle's name ("LOOP v6") and state. Created, updated, author and note are on the Bundles list and the version panel |
| Gate Configuration, Effective | Build details at the list foot (catalogue hash, property count, worker count); catalogue id (CFG-0xx) in the property panel and dialog; "Not read by this build" → "Not used" | Property keys (the configuration's own names), values, sources, class |
| Gate Configuration, Workers | The Build part (bundle hash, catalogue hash, worker jars, counts); Jar and Catalogue hash columns; an ACK for another bundle shown as a hash → "for another bundle"; "one jar" / "N different jars" in the foot line → "catalogue matches" / "N different software releases" | Each job and what it applied; the catalogue mismatch warning |
| Gate Configuration, Bundles | Content hash in the version panel | "LOOP v6", "v7" … : the version number is the bundle's name, the object users manage here |
| Gate Configuration, bundle tabs | Properties: catalogue id in the panel head, "unread by build" / "not read by this build" / "Read-only in this build", the "Read by" row (engine job codes such as `flink:short`). Diff & impact: "not part of this build", "declared by the build", "ships in a build" (→ "ships in a software release", also in How to read). Approval: the content hash column → "Current content" / "Previous content". Shadow: the run id ("Run 7c1e04a2 on FIC10301" → "Run on FIC10301"). Deployments: rolled back deployment id, jar in the APPLY heading and per cell, bundle hash per job (→ "this bundle" / "another bundle"), "(other hash)" → "(other bundle)", "pinned to this hash" → "pinned to this bundle", "different jars" → "different software releases" | Bundle versions as names, states, who / when / note, ACK matrix, Epoch (see Owner questions), server-served reason codes and semantics text |
| Pipeline Health (Q1) | Job panel Record details (raw engine job name, engine job id, started); list foot Engine details (JobManager address, jobs off the list, which the list already shows); verification Record details (analysis run, replay and engine job ids); How to read: engine state codes, the "Not exposed" part (watermark and Kafka lag), Kafka / Flink / Postgres / IoTDB / supervisor names; "fused result in Postgres" | The job's readable name (the page's subject), its state and numbers, the verification's loop, round trip and results |
| Governance | The approval queue panel's Record details (bundle id, content hash) | Audit trail Record details (event, user, entity ids, hash, correlation): the audit record itself. Change traceability (version rows and Build details): the page's audit of what produces verdicts. See Owner questions |
| Administration (Q1) | Data source panel Record details (configuration id, client id, record version) | Connection URL, user, topic filters, loop ingest settings: the configuration being managed. Plant model node Path with Copy (the node's address). The data-source wizard's Client ID field (a value the engineer sets). Alarm feed, Alarm rules and Notifications are outside the CPA slice and were not changed |

## Owner questions

1. **EVT codes** ("EVT-18808"). They name an episode in the Loop Events list rows, the panel foot
   ("PIC40102 · EVT-2231 · 24h"), the "not in this list" notice, note receipts, the Historical focus band and
   Governance audit entity names. Users refer to episodes by them. Keep, or replace with loop · finding · time?
2. **Governance › Change traceability.** The version rows (Calculation engine vX · engine, Dynamics profile vY)
   and the Build details dialog (cplm-api build and commit, engine builds with commit and jar) are kept as audit
   content. Remove them too, or keep them for auditors only?
3. **Governance › Audit trail › Record details** (event id, user id, entity id, hash, correlation) is kept as the
   audit record itself, as instructed. Confirm.
4. **Window Inspector › Engine & timing** dialog (size / slide, allowed lateness, minimum samples, the
   watermark wording). Keep, rename to "Timing", or remove?
5. **Workbench G15 "Advanced — engine trace (raw codes)"** (kept since SME review #14, CHG-051) and the **G8
   method / bicoherence / capability tiles** and the **G13 legacy capability text**. These are gate views that Task 5
   (CHG-187) rebuilds; the engine trace needs your ruling (SME asked to keep it).
6. **Help tips ("Source and version" field)** of the metric help registry name engine stamps (calculationVersion,
   sourceCommit, jarSha256) and "Identity & raw", which is gone. The text is verbatim until Q7 and is generated
   from `docs/theme/deep/help-registry-draft.md`. Edit the draft now?
7. **Gate Configuration › Deployments › Epoch** (a counter that a State-boundary change raises). Kept as a
   configuration fact. Remove?
8. **Loop Explorer › Loop model › Historian device** (`root.hdpe.cpm.fic10401`, the historian path). Keep?
9. **System Response › Steps & data**: the subgate raw outputs and the quantity Method column (estimator codes)
   are this tab's subject ("how the kernel decided"). Keep?
10. **Server-served wording** that names the engine: the Loop Registry readiness check "CPLM Flink jobs running",
    property reasons such as `DIAGNOSTIC_MODE_NOT_GOVERNED_IN_BUILD`, deployment semantics text. They come from the
    server; change them there?
