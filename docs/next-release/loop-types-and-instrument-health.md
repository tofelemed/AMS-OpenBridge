# CPA: cascade and other loop types, and instrument health

What exists today, what to add, what to change. 25 Nov 2026. Analysis only: no code, database, plant or lab setting was changed.

- **Source read:** v2.10.0, the version live at Marun (branch `feat/sr-engine-fixes`, 94386d1e). File paths are from that tree.
  `FL/` = `src/flink/src/main/java/com/ams/flink/cplm/`, `API/` = `src/services/cplm-api/`, `ING/` = `src/services/ingestion-service/`,
  `UI/` = `src/frontend-ob/src/components/Cpm/`.
- **Marks:** **[C]** read in the code · **[L]** read on the lab · **[D]** stated in one of our documents · **[W]** published source (section 14) ·
  **[?]** must be confirmed by the plant or the SME. Anything without a mark is a proposal.
- **Sizes** (one developer, with tests, rough): **S** up to 1 day · **M** 2-4 days · **L** 5-10 days.
- **Words:** *master* = outer / primary loop, *slave* = inner / secondary loop. *Cascade closed* = the slave takes its set point from the master.

## 1. Short answer

**Loop types.** CPA can already **store** that a loop is a cascade master, slave, ratio, split range, override or feedforward loop. **Nothing uses it.**
Every loop is judged as a single loop that drives one valve. Registering a pair today would make some results wrong (section 5).

**Instrument health.** CPA's side is built and runs at the plant, but it is **empty**: no health source, no device linked to a loop, and no screen or import to link
one. Five engine faults must be fixed before the first real device is linked (section 8.5).

| | Already there | Must be added | Must be changed |
|---|---|---|---|
| Structure of a loop | type list, editor, words on screen [C] | who belongs to whom, normal mode per loop, scaling, history | one value per loop is not enough (a loop can be slave and master) |
| Engine | partner's raw samples already reach the Long job [C] | cascade state, pair analysis, "caused by the other loop" | 14 of the 16 gates differ for at least one structure (section 6) |
| System Response | paths and event names for cascade [C] | pair events, inner and outer model | it ignores "what the output drives" and captures AUT only |
| KPIs and events | safe handling of new reasons [C] | one problem per pair, "cascade open" | 8 KPIs count wrongly for a pair |
| Screens | structure words, linked-loops card, N/A gate mark [C] | link in the loop header, pair trends, link editor | about 20 texts, output unit, mode words |
| Instrument health | source reader, job, tables, API, lanes [C][L] | link screen, import, coverage list, valve rules | 5 faults first, then a list of smaller ones |

**Three facts that shape the plan**
1. **No current plant loop was seen in Cascade** in the 30 days to 22 Nov. Only FIC10710 ran in CAS (99.9 %); it is not in the current loop list and matches the loops retired on 16 Nov [D].
   So cascades are either run open, or not on our list, or not visible in the MODE signal. Only the DCS engineer can say.
2. **169 plant loops are declared "output drives a valve"** and the list of exceptions is still owed by the control engineer (`prod_decision.md:112`) [D].
   Any master among them is already judged as a valve loop.
3. **The lab cannot prove cascade today:** 6.3 million mode samples on 179 loops in the lab historian, none in CAS [L]. A simulated pair is needed first.

**Do not do these yet** (each one makes results worse until the named work is done)

| Do not | Why |
|---|---|
| Link a master and slave in the asset model | the link type is dropped on the way; the partner becomes a G13 "interacting loop", and a healthy cascade then looks like a disturbance [C] |
| Switch System Response to `AUT,CAS` | a slave's moving set point gives long chains of events, the mode is not stored with them, and the job's memory is never trimmed [C] |
| Add a second valve or extra signal row for a loop by SQL | two rows of one role make the loop list fail for the **whole plant** [C] |
| Edit a loop on screen after adding extra signal roles | the edit deletes every role except PV, SP, OP, MODE, VP [C] |
| Link the first real instrument device | a failed transmitter can read as healthy (section 8.5) [C] |
| Add new gate settings for pairs | a new setting changes the catalogue; deployed settings are then lost at a fresh Flink start (open since 24 Nov) [C] |

## 2. What we need from people

### 2.1 Decisions for the owner

| # | Decision | Recommended |
|---|---|---|
| D1 | What comes first | Cascade first. Ratio next. Split range, override and feedforward when the plant can send the extra signals |
| D2 | Normal mode per loop: master AUT, slave CAS (or RCAS). A slave left in AUT then reads "Cascade open" | Yes. **This changes the 22 Nov decision** to keep "in auto mode" = AUT or CAS for every loop |
| D3 | One problem per linked group on the Overview; the other loops show as "affected by" | Yes |
| D4 | No valve findings on a master (it has no valve) | Yes |
| D5 | Who links loops and devices | Engineer links, a second person confirms; Admin or SuperAdmin alone (same rule as regions) |
| D6 | Screens: one small partner link in the loop header, and one pair view inside Loop Explorer > Relationships. No new page | Yes, after the owner sees a sample |
| D7 | First source of instrument health | Both: the DCS status word as a quick start, Instrumental as the full source (section 8.7) |
| D8 | Health: watch for 2 weeks, then let it exclude windows | Yes |
| D9 | Transmitter in "Function check" (calibration) | Limit the result, do not exclude a 12 h window for a short calibration. **This softens the contract's present rule** (not valid for identification) |
| D10 | Slave transmitter failed: what happens to the master | Master "limited: inner measurement not valid". Not excluded, its own measurement is fine |
| D11 | Bring back the instrument detail panel (removed in CHG-158) | Yes, only as a dialog opened from the loop, not on the page |

### 2.2 From the plant

| # | What | From | Why |
|---|---|---|---|
| P1 | **Control structure table** (open request O7): loop, kind, master, slave, what the output drives | DCS engineer | without it nothing can be accepted |
| P2 | All MODE codes, and **what is sent when the cascade is open** (request O6). We map 1 AUT, 2 MAN, 3 CAS, 4 IMAN | DCS / gateway | CENTUM shows two modes at once ("AUT IMAN"); we receive one number |
| P3 | Scale and limits of each master's output, SP limits, normal mode, controller action and algorithm | DCS engineer | a master's output is in the slave's units |
| P4 | Extra signals: selector state, second valve, ratio set point, wild flow, feedforward signal | DCS / gateway | split range, override, ratio and feedforward cannot be judged without them |
| P5 | P, I, D of both loops; valve position (open request O5) | gateway | pair tuning, valve evidence |
| P6 | Faster samples (1 s or better) for fast slaves | gateway | at about 5 s a fast flow slave cannot be resolved |
| P7 | Device list and the filled worksheet (section 8.8) | instrument engineer | the mapping itself |
| P8 | Contract approval, ids and a publisher (open requests I1-I4) | Instrumental owner | there is no publisher today, only our simulator |
| P9 | Which quality or status words the gateway sends for a bad PV (open request O1) | gateway | interim health source |

**Worksheet for P1-P4** (one row per loop in a structure): `structure_no | kind (cascade / ratio / split / override / feedforward) | loop_tag | role (master / slave / wild flow / controlled
flow / controller / final element / selector / feedforward input) | partner_tag | normal_mode | output_drives (valve / VFD / slave SP / splitter / selector) | output_low | output_high |
output_unit | sp_low | sp_high | ratio | bias | split_low | split_high | valve_action | select (high / low) | selected_signal_tag | valve_a_tag | valve_b_tag | drawing_ref | filled_by | checked_by`

## 3. The master / slave logic

### 3.1 What the two modes together mean
CENTUM meanings come from unofficial copies of the manuals; the SME must confirm them [W][?].

| Master | Slave | State | Judge the master | Judge the slave |
|---|---|---|---|---|
| AUT, CAS, RCAS | CAS, RCAS | **Closed** | yes | yes, as a loop that follows a moving set point |
| IMAN | AUT | **Open** (slave on its own SP) | no: "waiting for slave" | yes, as a single loop; "not in normal mode" |
| IMAN | MAN | **Open** | no: "waiting for slave" | manual. **One problem, the slave's** |
| AUT (not IMAN) | AUT or MAN | **Open, unexpected** | no; check link, scaling or the MODE signal | as a single loop, or manual |
| MAN | CAS | **Master in manual** | manual | yes, follows the operator's value |
| any | PRD | **Primary direct**: the master drives the valve itself | as a valve loop, separate tuning | no, it is bypassed |
| any | IMAN, TRK, O/S | **Slave not controlling** | no: "waiting for slave" | no, with the reason |
| any | no data | **Not known** | no pair claim | no pair claim |

- MAN together with a bad PV is an **instrument** event: CENTUM drops to MAN and stays there [W]. It is not an operator choice.
- "Slave SP equals master output" does **not** prove the cascade is closed; it is also true while it initialises [W]. The modes decide; the match only checks
  that the link and its scaling are right.

### 3.2 What to measure for a pair

| Measure | How | Default, SME to approve |
|---|---|---|
| Cascade closed | time closed / time both loops have data | 95 % (same as normal mode) |
| Link check | slave SP against scaled master output while closed | difference above 1 % of span = "check link or scaling" |
| Slave follows | share of samples with abs(PV - SP) above 3 % of range, plus the lag | 3 % from ABB [W, search summary only] |
| Speed ratio | master time constant / slave time constant, closed loop | good 4 or more, 10 preferred; 3 or less poor [W]. Show "not resolvable" when samples are too slow |
| Slave limited | slave output or SP at its limit while closed | from the declared ranges |
| Who leads | same period, phase and gain between slave SP, slave PV and master PV | at least 8 averaging segments (today often 1) |

### 3.3 Who is the cause (first rule that fits)
1. Slave or master measurement not valid → **instrument**. No control claim.
2. Cascade not closed → no pair cause. Show the state only.
3. Valve evidence on the slave (output against valve position, or shape while its SP is quiet) → **slave valve**. Master is "affected".
4. Slave also cycles in periods when it ran in AUT with a fixed SP → **slave**.
5. Slave is at a limit, or does not follow → **slave capacity or tuning**. The master's error is the result.
6. Speed ratio 3 or less → **the two loops are too close in speed**.
7. Slave follows well, both cycle with the same period → **master tuning or an outside disturbance**.
8. Otherwise → **not decided**: count once, show both loops.

A moving SP is not proof that the valve is fine: sticking valves do occur in slaves whose SP cycles at the same period [W]. So rule 3 needs its own evidence.

### 3.4 The other structures

| Structure | What is normal | What must never be said | Extra signals needed |
|---|---|---|---|
| **Ratio** | slave in CAS; SP = ratio x wild flow | "set point changed by operator"; ratio error at very low wild flow | wild flow, ratio set point |
| **Split range** | one output, two valves; gain differs on each side | one stiction verdict for the output; "at limit" at the split point | valve B position, split points, valve action |
| **Override / selector** | a not-selected loop shows error and its output follows the other | any control, tuning, oscillation or valve finding while not selected; "manual" | which controller is selected |
| **Feedforward** | output moves on purpose | "excessive effort" from the feedforward part | feedforward signal, on / off |

## 4. What exists today, end to end

| Layer | Today | State |
|---|---|---|
| Registry fields | `topology` (8 values) and `command_path` (valve, VFD, slave SP), editable in the wizard (`API/Services/Registry/LoopModelDimensions.cs:20-27`, script 57) | there, not used [C] |
| Links | `cpm.loop_link` has cascade types, filled only from asset-model relationships. No screen, no CSV, no checks (two masters, circles), no dates, no history | half [C] |
| Normal mode | none. One global list: AUT and CAS count the same | missing [C] |
| Mode words | RCAS, PRD, TRK, O/S are not known, so they count as "not automatic". Five copies of the list | wrong [C] |
| Ingestion | any extra number reaches Kafka by configuration; after that only P, I, D are read by the engine. P, I, D are not in the historian | half [C] |
| To the engine | partner ids only; link type, direction and date are dropped (`API/Services/Registry/CpmLoopRegistryService.Evidence.cs:45-105`) | wrong [C] |
| Engine | topology and command path parsed (`FL/CplmDynamicsParameterSetSupport.java:141-142`) and read by no gate and no verdict | not used [C] |
| Pair data | the Long job already receives the partner's PV, SP, OP, VP and MODE in the same 4 h / 12 h / 24 h windows (`FL/CplmPeerFanoutSupport.java:80-113`); G13 uses PV only | best base to build on [C] |
| System Response | `CASCADE_SP_STEP` and slave-SP path exist as names; `setCommandPath` has no caller (`FL/response/ResponseCapture.java:118`) | dead code [C] |
| KPIs, events, replay | one loop at a time everywhere; no table can hold a result about a pair | missing [C] |
| Screens | words, linked-loops card, N/A mark, G1 tiles for selected / tracking. No page leads from slave to master except two places | half [C] |
| Gate Configuration | scopes: plant, loop type, loop. None by structure | missing [C] |
| Lab | 234 of 240 loops have structure "unknown"; links: 2 peers; no cascade | [L] |

## 5. What goes wrong today with a real pair
The code path is verified; the plant situation is an example, because no cascade data exists to run it on.

| Situation | What CPA says today | Where |
|---|---|---|
| Master cycles, slave follows perfectly | slave **confirmed oscillation**, "review gain and integral time" | `FL/fusion/FusionEvidence.java:63,143` |
| Slave valve sticks | master **confirmed oscillation** too; valve-shape gates judge the master's output | G7-G9, `FusionEvidence` |
| Operator puts the slave in MAN | two loops counted "manual"; advice on the master blames an operator | `BlockingExclusions.java:59-63`, KPI classifier |
| Slave left in AUT | slave counted "in auto mode": the open cascade looks good | `API/Services/Kpi/FleetKpiClassifier.cs:38` |
| Slave in CAS, SP always moving | set-point gate warns in every window; error gate fails against a fixed 0.5 % band; evidence volume grows | G2, G3 |
| Master output in slave units, no range declared | "outside operating region" or "at limit" | G2r, G10 |
| Master has no valve | shown as "valve position missing"; System Response models it as a valve loop | `API/Services/Registry/OptionalInputs.cs:57-62`; `ResponseCapture.java:67` |
| Pair linked in the asset model | G13 "interacting loop", hint "outside disturbance" | `CplmGateFusionEngine.java:322` |
| Loop under APC (RCAS) | excluded in every window as "not automatic" | `CplmNormalizedSample.java:253-270` |
| Split range at 75 % output | valve A at 100 %, so "valve does not follow" confirmed | G14 |
| Override loop not selected | worst performer, maybe "oscillation" that belongs to the other loop | G3, G5, G10 |
| Good feedforward | "excessive effort" confirmed | `FusionEvidence.java:65` |

## 6. Gates: what changes
**Keep** = no change. **Off** = not applicable; the gate status **and its score** must both be off, because the verdict reads the scores directly [C].

| Gate | Master | Slave in CAS | Ratio slave | Split range | Override | Feedforward |
|---|---|---|---|---|---|---|
| G0 Data | Keep + both loops have data | same | + wild flow | + second valve | Keep | + signal |
| G1 Mode | Change: IMAN = waiting for slave | Change: normal = CAS | Change: CAS or RCAS | Keep | Change: selected or not | Keep |
| G2 Set point | Keep | **Off** | **Off** | Keep | Keep | Keep |
| G2r Operating region | Change: range = slave SP range | Keep | Keep | Change: per valve | only while selected | Keep |
| G3 Error | only while closed | Change: follow measure | Change: follow + ratio error | Keep | only while selected | Keep |
| G4 Effort | Change: "demand", not valve wear | Change: minus SP-driven part | same | Change: per valve | only while selected | Change: minus FF part |
| G5 G6 Oscillation | Keep + who is the cause | + control error as signal | same | + split-point flag | only while selected | + source |
| G7 G8 G9 Valve shape | **Off** | only while SP is quiet | same | per valve, never across the split | only while selected | only while FF quiet |
| G10 Output limit | Change: slave SP limit, slave saturated | Keep | Keep | Change: limits at the split point | not a fault when not selected | Keep |
| G11 Frozen PV | Keep | Keep | check both inputs | Keep | Keep | Keep |
| G12 System Response | never as valve; outer model (7.4) | inner model | inner model | one model per side | only while selected | FF is an input |
| G13 Interaction | Change: directed pair, not "peer" | same | wild-flow link | sibling valve | sibling controller | disturbance link |
| G14 Valve position | **Off** | Keep | Keep | two valves + characteristic | only when this output is used | Keep |
| G15 Verdict | new causes, one problem per pair | same | same | same | same | same |

- **No new gate number.** The pair result is a block inside the G13 evidence. A new gate key would touch six fixed lists plus the historian template [C].
- **New verdict reasons:** Cascade open, Waiting for slave, Not selected, Tracking, Partner has no data. **New causes:** caused by master, caused by slave, loops too
  close in speed, split point, feedforward, wild flow. Reasons are plain text in storage; do **not** add enum members, an older API would fail on them after a
  rollback (`API/Services/Kpi/FleetKpiDaily.cs:103`) [C].
- **G13 itself needs a repair:** for TIC, LIC, gas and vapour pressure and unknown types the coherence test uses one segment, so it is always 1.0. Only FIC and
  liquid PIC (12 h and 24 h) have a real test [C, recomputed]. These are exactly the usual masters.
- **The "another loop is the cause" rule exists but practically never fires:** it needs an almost still actuator (`FusionEvidence.java:90-95,133`) [C].

## 7. Changes layer by layer

### 7.1 Structure model (NEW, L) — cplm-api, database `traverse_cplm`
- `cpm.control_structure`: id, kind (CASCADE, RATIO, SPLIT_RANGE, OVERRIDE, FEEDFORWARD), status (PROPOSED, CONFIRMED, RETIRED), valid from / to, parameters, who.
- `cpm.control_structure_member`: role (MASTER, SLAVE, WILD_FLOW, CONTROLLED_FLOW, CONTROLLER, FINAL_ELEMENT, SELECTOR, FF_INPUT), loop **or** a signal path,
  parameters (scale, bias, split low / high, action, high / low select).
- Rules: one master per slave, no circle, members active and on the same site, `topology` worked out from membership, every change dated and audited with before / after.
- **Why not `loop_link`:** no dates, no roles, no parameters, and every row becomes a G13 peer. Keep it for PEER and UPSTREAM_OF. Copy the dating pattern of
  `cpm.signal_device_binding_history`, which the database already protects from overlaps.
- **Normal mode** per loop (AUT, CAS, RCAS, MAN): new registry column.
- **To the engine:** a new attribute `cplm.loop.structure` **inside the existing metadata message**. No new topic. A separate message with the same key would erase
  the other attributes [C]. A loop that leaves a structure needs an explicit empty value. Both loops are re-sent on every change.
- **Later:** a suggestion list, never automatic: mode hand-shake (slave enters CAS when master leaves IMAN), then SP = scaled output. Start as a script, S.

### 7.2 Signals and ingestion

| What | Change | Size |
|---|---|---|
| Mode words | RCAS, PRD, TRK, O/S, both parts of "AUT IMAN"; one shared list and a test for all copies (`CplmNormalizedSample.java:253`, `ResponseJobConfig.java:87`, `ING/Pipeline/ModeVocabulary.cs`, `utils/modeVocabulary.ts`, `UI/shared.tsx:157`) | S-M |
| Mode share | store the share of each mode per window (today only "automatic share"); without it the API cannot tell "open" from "manual" | M |
| SP / OP limits, tracking flag, P, I, D in the historian | per-loop extras; ingestion by configuration, engine and historian by code | M |
| Second valve, wild flow, selector, FF | a **member signal** of the structure, not a new column per loop: one new role today touches about 35 places [C] | L |
| Historian | layout v2 template is created, never altered; a field the template lacks is added for every loop [C]. Plan the template step | S |
| Loop types | AIC, IIC, NIC, SIC, HIC have no type; FQIC is stored as FIC, PDIC as PIC | M |

### 7.3 Engine (Flink)

| # | Change | Where | Size |
|---|---|---|---|
| E1 | Cascade state per window from both modes | new `engine/StructureGate` in the Long job | M |
| E2 | Pair analysis (3.2) on slim partner samples (estimate: 0.8 MB per partner per 24 h, against about 40 MB for today's full copies) | `CplmPeerFanoutSupport`, Long job | L |
| E3 | Gate applicability by structure, status and score | `MethodEligibility`, Short and Long calculators, `FusionEvidence` | M |
| E4 | Cause rules (3.3), new reasons and texts | `FusionEvidence`, `VerdictAssembly`, `DiagnosisBands`, `Recommendations`, `BlockingExclusions` | M |
| E5 | Only use samples where the structure is active (mode mask); G5-G11 and G13 ignore mode today | calculators | M |
| E6 | G13 repair: 8 or more segments, detrend, declared sample grid, return phase | `InteractionMath`, `OscillationMath`, `WelchPsd` | M |
| E7 | Partner data in replay, on-demand and reconstruction (today G13 is always "not evaluated" there) | `WindowEvaluation`, `EvidenceReconstruction`, `IotDbLoopReader` | M-L |

- **No new Flink job, topic or consumer group.** The CPLM consumer-group rule stays as it is.
- **Restart safety:** put structure on the sample, not in the loop profile, so run ids of other loops do not move. A new field must also go into `copy()` and
  `peerCopy()`. Do not add fields to `RoleObservation`. Do not add catalogue properties until the gate-configuration loss is fixed.

### 7.4 System Response

| # | Change | Size |
|---|---|---|
| R1 | Trim the job's memory (`CaptureStateMachine.events`, `ResponseCapture.emitted` are never trimmed). **Before any CAS capture** | S |
| R2 | Use "what the output drives". Fill the registry first: on the lab 234 of 240 are unknown, and unknown must keep today's behaviour | S |
| R3 | Store the mode on the event; AUT to CAS ends the event; hold-out models separate per mode, path and regime | M |
| R4 | `CASCADE_SP_STEP` only for a clear, isolated step; a limited routine window for a moving SP; a rate limit | M |
| R5 | Inner model (slave) first: needs no partner data. Then outer model and speed ratio: needs both loops' samples in one place | L + L |
| R6 | Tuning of both loops at the event. A slave in CAS stores no tuning today, because tuning is written only with an event | M |
| R7 | Split range: one model per output range. The "by regime" configuration layer exists but the engine refuses it today (`GateConfigBundle.java:130`) | L |

Volume if CAS is switched on (estimate from measured AUT rates): about 65-70 MB per slave, 1.3 GB for 20 slaves. Superseded events of slaves must be counted, not stored.

### 7.5 KPIs, events, API (cplm-api)

| KPI | Wrong for a pair | Change |
|---|---|---|
| In auto mode | open cascade counts good; RCAS counts bad | share of time in the loop's **own normal mode** |
| In manual mode | one hand on the slave = 2 loops | count the slave only |
| Oscillating, valve problem, priority queue | two loops for one problem | count the cause once; list `affects` |
| Performing acceptably, worst error | slave in CAS fails against a fixed band | follow measure |
| At limit | master = slave SP range; override not selected | reason per role |
| Effort | slave effort comes from the master | attribute it to the master |
| Diagnostic capability | master "valve position missing" | not applicable |
| New | - | **Cascade open** (slaves below 95 % closed), with its drill-down. Not selected = information only |

- Read the links once and pair **in memory** after the existing plant read. No join inside the fleet SQL and no second payload read: in the v2.10.0 tests one payload read there made a page about 15 times slower.
- Daily KPI: rule version 3, three columns (`group_id`, `role`, `attributed_to`), rule version shown on the trend. Old days are not rewritten.
- Events: keep one event per loop, add a link table (cause, affected, reason); lists and counts collapse. Shelving and acknowledge stay per event.
- An override loop that is not selected must not keep an event open for ever: new state "suspended".
- The data-team PI export repeats the KPI rules in SQL and already differs since rule 2. Make it read the stored daily rows instead.

### 7.6 Screens (minimal, owner sees a sample first)

| Place | Change | Size |
|---|---|---|
| Loop header (`UI/context/LoopBand.tsx`) | NEW: "Master TIC..." / "Slave FIC..." link; stays on the same page. One change covers 9 pages | S |
| Loop Explorer > Relationships | NEW: the one pair view. One trend per row, linked zoom, plain words (raw codes today) | M |
| Registry editor | NEW: "Linked loops" part and "Normal mode"; cross-checks; three CSV columns | M-L |
| Performance, Registry list | UPDATE: "Slave of ..." under the loop name | S |
| Overview | UPDATE: words only; one tile "Cascade open" if D2 and D3 are yes | S |
| Loop Events | UPDATE: one row "Linked loop" when its event is open | S |
| Explorer, Historical, Replay | UPDATE: output unit from the loop (7 places print "%"), set point "from TIC...", optional partner row | M |
| Investigation | UPDATE: new causes; exclusion words ("loop not in automatic" is shown for every exclusion today) | S-M |
| System Response | UPDATE: event words, partner trends each in its own row, inner and outer model cards, redraw reads the slave SP | L |
| Workbench | UPDATE: "does not apply" state; today it offers Reconstruct | S |
| Gate Configuration | UPDATE: one line "Does not apply to a cascade master." | S |
| Trend page, Pipeline Health | nothing | - |
| Governance | UPDATE: words for link changes | S |

### 7.7 Gate Configuration
Default values per structure (for example a slave's follow limit) need a profile per structure and loop type, for example `FLOW_FAST_SELF_REG__CASCADE_SLAVE`.
No SQL change, **but first fix the loss of deployed settings at a fresh Flink start**. Until then the defaults stay in the engine.

### 7.8 No change needed
ams-api alarms, display and HMI designer, notification, analysis, audit, historian-bff, template, binding-resolver and the gateway read no pair data [C]. `ams-api`
changes only if a new measurement must be stored (`RawLoopIotDbConsumer`).

## 8. Instrument health

### 8.1 The chain today

| Step | Built | At Marun |
|---|---|---|
| 1 Instrumental sends device state by MQTT (contract v1) | **no publisher**, only our simulator | nothing sent [D] |
| 2 Broker | yes | our EMQX is not reachable from outside there and its rules refuse this topic; request I2 names the wrong broker, 192.168.190.91:1883 is the PI archiver's [C][D] |
| 3 ingestion-service reads it, only when a data source of type `INSTRUMENTAL_HEALTH` is active | yes | none documented [D] |
| 4 Kafka: health, context, rejected messages | yes | topics exist |
| 5 Flink "Instrument Context" job | yes | one of the 8 jobs; on the v2.10.0 jar by the 24 Nov check [D] |
| 6 Fusion uses it; cplm-api stores it; API | yes | running, empty |
| 7 Screens | one line of text, PV lanes, a filter. The detail panel is on no page | same |

### 8.2 How a device is mapped
**One link = one loop signal + one device + a period.** Example (tag names are illustrative):

| Loop signal | Field device | Link |
|---|---|---|
| FIC10409 **PV** | flow transmitter FT-10409 | PV → device id |
| FIC10409 **VP**, or **OP** if travel is not measured | positioner of valve FV-10409 | VP → device id |
| same transmitter used by two loops | one device | two links, works today |

- **Key = the device id that Instrumental publishes.** Tag, PRM id, HART id and serial are kept to check the link, never to match by text.
- **Tag = the function, id = the body.** A replaced transmitter is a new link from its install date; the old link closes by itself, history stays right.
- **Do not ask Instrumental to know our loops.** The contract expects `FIC10302.PV` in its messages. Better: Instrumental sends its own variable name and **our link carries the
  map**. Today any other name reads as "does not concern this loop", so a failure passes as healthy.

**Today, step by step (API only, no screen):**
1. Data source: `POST /api/ingestion/data-sources`, type `INSTRUMENTAL_HEALTH`, broker and user (the admin form has no field for this), with `instrumental_health: { tenant_id, site_id, allowed_source_ids }`.
2. Each link: `POST /api/v1/cpm/loops/{loop}/instrument-bindings` with `{ signalRole, deviceId, installationId, sourceId, validFrom, note }`. Roles PV, SP, OP, VP, MODE. Engineer or
   higher. A second POST replaces the device. A clash answers 409.
3. Check: `GET /api/v1/cpm/loops/{loop}/instrument-health`.

Lab: 1 link (FIC10302 PV → TT-10302), last data 4 Nov, message path proven; **no window was ever excluded by health**, that part is proven by unit test only [L].

### 8.3 Which device matters for which loop

| Loop | Devices | Effect |
|---|---|---|
| Single | PV transmitter; positioner | PV failed: no verdict. Positioner failed: no valve finding, PV figures stay |
| Cascade master | own PV; slave PV and slave valve as dependency | slave PV failed: master **limited**, no tuning or cause claim |
| Cascade slave | own PV, own valve; master PV as dependency | master PV failed: the slave's SP is not trusted, note only |
| Ratio | controlled flow, wild flow | wild flow failed: ratio figures off |
| Split range | PV, valve A, valve B | per valve |
| Override | every PV that can be selected | only the selected one counts |
| Feedforward | PV, feedforward transmitter | feedforward claims off |
| 2 out of 3 or median | three transmitters in slots A, B, C | 1 bad = limited, 2 bad = not valid. **Not possible today**: one device per signal |
| Compensated flow | pressure / temperature transmitter | limited. Today a failure there reads as healthy |

### 8.4 What each state should do (D8-D10)

| State | PV transmitter | Positioner (VP or OP) |
|---|---|---|
| F Failure, or measurement not valid | window has no verdict, cause "instrument" | G14 and valve shape off, no valve finding; PV figures stay |
| C Function check | limited while it lasts | same, limited |
| S Out of specification | limited, named on the result | limited |
| M Maintenance | note only, never blocks | note only |
| Stale, unknown, source offline | limited; never shown as healthy | same |
| No device linked | "not checked"; never shown as healthy | same |

### 8.5 Faults to fix before the first real device [C, checked twice]

| # | Fault | Where |
|---|---|---|
| H1 | A **failed positioner changes nothing**, while "out of specification" gives a caution | `FL/fusion/HealthLanes.java:55-64` |
| H2 | Flags and variables of all diagnostics are pooled: a whole-device failure plus any other message on another variable reads **healthy** | `FL/health/DeviceStateMachine.java:174-179`, `HealthEligibilityPolicy.java:41-53` |
| H3 | A variable name we do not know reads as "independent", so a failure passes as healthy | same |
| H4 | After a link is replaced or removed, the **old device's fault can stay** on the loop | `FL/health/CplmInstrumentContextJob.java:179-199` |
| H5 | A late correction of history overwrites the live state | `FL/CplmGateFusionStreamJob.java:212` |

Next in line: only the newest state counts, not the window (a fault one minute before the end excludes 12 h); one source offline marks the whole site; a retained message older than 24 h is
refused and the device stays silent; nothing is rebuilt after a fresh Flink start; no way to re-send links; the four health tables are never cleaned (about 0.8 GB a day at
300 devices, estimate); System Response, replay and reconstruction ignore health; a "watch only" switch does not exist.

### 8.6 What to add
- **Links:** kind (primary, actuator, redundant, compensation, dependency), slot and voting, variable map, position tag, draft / approved / ended (M).
- **API:** list all, CSV import with dry run, end, correct, re-send, coverage report, "devices that report but are not linked" (M).
- **Screen:** Registry detail > Signals gets an "Instrument" column and a link dialog; import page; detail panel as a dialog; valve lane; plain words in the filter;
  the health block in the data-source form (M).
- **Dependencies** from the structure tables of 7.1 (M). This is the one place where the two topics meet.

### 8.7 A source that can start earlier
Ask the gateway to send the CENTUM **PV data status** beside PV. A small bridge writes it as contract messages with no NE107 flag and "measurement not valid"; the policy already handles
that. Proposal, instrument engineer to approve [W][?]: `BAD, IOP+, IOP-, NCOM, PTPF, NRDY` → not valid · `CAL, NEFV, MNT` → not valid, "under calibration" · `QST` → degraded · `OOP` →
output path, not the PV. (CENTUM uses `CAL`, not `CLBR`.) Size M. It gives transmitter validity, not valve health or early warnings; Instrumental still adds those.
AMS alarms (IOP / OOP) cannot help now: the alarm part is off at Marun.

### 8.8 Worksheet for the instrument engineer
One row per device and loop signal: `site | loop_tag | signal_role (PV/VP/OP) | kind | slot | voting | position_tag | device_type | protocol | manufacturer | model | serial_no |
hart_or_ff_id | prm_device_id | instrumental_device_id | installation_id | source_id | native_variable | effect (invalidates / degrades / none) | split_from | split_to | valid_from (UTC) |
valid_to | reference_document | filled_by | checked_by | remark`. The loop must be registered; one primary per signal and time; no matching by part of a tag.

### 8.9 Steps to go live
1. Owner decisions D7-D11. Correct the contract and requests I2, I4, I5, then send for signature (S).
2. Fix H1-H5, then the next-in-line list, with a watch-only switch (about 15-20 days).
3. Link kinds, API, import, screen (about 8-12 days).
4. Lab proof: simulator with about 10 devices and 2 sources, PV and valve (M).
5. Plant: broker user and rights, data source, worksheet, dry-run import, **2 weeks watch only**, then enforce unit by unit.

Steps 1-4 can start now. Step 5 waits for Instrumental (P8), the instrument engineer (P7) and the gateway (P9).

## 9. Faults found on the way (fix first; useful without any new loop type)

| # | Fault | Where | Size |
|---|---|---|---|
| B1 | A screen edit of a loop deletes extra roles; a re-import clears the asset link; two rows of one role break the loop list for all | `UI/registry/wizard/wizardForm.ts:191-194`, `API/Services/CpmLoopRegistryService.cs:146,169,205`, `API/Services/Registry/CpmLoopRegistryService.Bulk.cs:271,301`, `API/Services/CpmLoopRegistryReads.cs:105` | M |
| B2 | Link type dropped; every link becomes a G13 peer | `CpmLoopRegistryService.Evidence.cs:51-59` | S |
| B3 | Master shown as "valve position missing" (4 copies of the rule) | `OptionalInputs.cs:57-72`, `EffectiveEntries.Resolvers.cs:250`, `optionalInputs.ts:27` | S |
| B4 | System Response ignores "what the output drives": every master is modelled as a valve loop (valve and VFD use the same path, so those are not affected) | `ResponseCapture.java:118`, `CplmResponseAnalysisJob.java:127` | S |
| B5 | RCAS, PRD, TRK, O/S unknown | section 7.2 | S-M |
| B6 | G13 coherence always 1.0 for most loop types; cause rule unreachable; effort score on raw units | section 6 | M |
| B7 | System Response memory never trimmed | `CaptureStateMachine.java:17`, `ResponseCapture.java:76` | S |
| B8 | **Shelved loops stay in the priority queue**; the shelved count is always 0 | `API/Data/FleetPrioritySql.cs:60-61` | S |
| B9 | G10 never reaches the 12 h / 24 h KPI history | `API/Services/KpiHistoryMapper.cs:136-137` | S |
| B10 | Historical mode key does not match its colours; every exclusion reads "not in automatic"; N/A gates offer Reconstruct | `ChartFoot.tsx:20`, `metricAvailability.ts:66`, `GateResultState.tsx:71-93` | S |
| B11 | PI export SQL differs from the Overview since KPI rule 2 | `docs/pi-export/` | S |
| B12 | Deployed gate settings lost at a fresh Flink start (known, 24 Nov) | `ConfigDeploymentService.cs:124` | M |

## 10. Work plan

| Phase | Result for the user | Content | Days (rough) | Needs |
|---|---|---|---|---|
| **0 Inputs** | - | D1-D11; P1-P3 for cascade, P7-P9 for health; simulator of a real pair on the lab | 4-6 | people |
| **1 Repairs** | fewer wrong results today | B1-B12 | 14-20 | nothing |
| **2 Cascade: say nothing wrong** | open cascade visible, no false valve or manual findings, one problem per pair | 7.1, modes, E1, E3, E5, KPI rule 3, registry and header screens | 30-45 | P1, P2 |
| **3 Cascade: name the cause** | "caused by the slave valve" | E2, E4, E6, E7, event links, pair view | 25-35 | phase 2, real data in CAS |
| **4 Cascade: tune the pair** | inner and outer model, speed ratio | R1-R6 | 25-40 | P3, P5, P6, SME |
| **5 Other structures** | ratio, then split range, override, feedforward | member signals, R7, per-structure rules | 35-55 | P4 |
| **H Instrument health** | device state on each loop and in the verdict | 8.5-8.9 | 25-40 | P7-P9; dependencies need phase 2 |

- Phase 1 and the health engine fixes (H1-H5) can start now and run in parallel.
- **Phase 2 alone is worth a release.** Phase 3 needs loops that really run in cascade; if operators keep them open, phase 2 already shows exactly that.
- Phase 4 is not possible for fast flow slaves until faster samples arrive (P6).

## 11. What the releases contain

| Item | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Health |
|---|---|---|---|---|---|---|
| Flink jar (full swap) | yes | yes | yes | System Response job only | yes | yes |
| cplm-api | yes | yes | yes | yes | yes | yes |
| ams-frontend | yes | yes | yes | yes | yes | yes |
| ingestion-service | modes | modes | - | - | signals | yes |
| ams-api | - | - | - | - | historian fields | - |
| auth-service | - | permission for links | - | - | - | - |
| SQL fresh install (`database/scripts`, `migration/schema/03`) | - | 71 | 72 | 73 | 74 | 75 |
| SQL live plant (`scripts/cpm-NN`, with rollback) | - | cpm-23 | cpm-24 | cpm-25 | cpm-26 | cpm-27 |
| Kafka topics, consumer groups | none | none | none | none | maybe one for member signals | none |
| Settings | - | - | - | `--response-capture-modes AUT,CAS` in all four submit scripts | historian template | `INSTRUMENTAL_HEALTH` source, broker user |

Script numbers are the next free ones today; whoever ships first takes the first. Schema changes also go into the service's own start-up SQL (`CpmLoopRegistryService.Schema.cs`).
For every release: `changes_tracker.md` (services, scripts), `prod_decision.md` (normal modes, thresholds, KPI rule 3 and its date, capture modes, health retention, watch / enforce date,
approver rule). New files per feature: several touched files are already at 400-480 lines.

## 12. How we prove it

| # | Test | Expected |
|---|---|---|
| T1 | Simulated pair, all modes of 3.1 | each state right, shares add up to 100 % |
| T2 | Healthy closed cascade, 24 h | no finding on either loop |
| T3 | Sticking slave valve | one problem, cause slave valve, master "affected" |
| T4 | Master too aggressive | cause master; slave not "confirmed oscillation" |
| T5 | Slave put in MAN | manual count +1, not +2; master "waiting for slave" |
| T6 | Slave in AUT for a shift | "Cascade open" counts it; not "in normal mode" |
| T7 | Master output in slave units, 0-300 | no false limit or region result |
| T8 | A pair edited on screen, imported by CSV, retired | nothing lost, history kept, both loops re-sent |
| T9 | Fresh Flink start, and a savepoint start | pair results return; single-loop run ids unchanged |
| T10 | Plant-size fleet read with 60 pairs | not slower than today |
| T11 | Health: F on PV, F on valve, pooled messages, unknown variable, replaced device, two sources, 3-day-old message, restart | as in 8.4; none reads healthy |
| T12 | Slave transmitter failed | master limited, not excluded |
| T13 | 200-row device import with 5 bad rows | 195 in, 5 reported, dry run first |

## 13. Plant hints for the control engineer (hints only, not facts)
- **Output range above 100** suggests the output is another loop's set point: **LIC10601 0-300** (FIC10710, the one loop seen in cascade, has PV 0-300), **PIC10411** and **PIC10511** 0-140,
  **TIC10101** 0-124, **TIC30304** 100-155. Check these five first. Some rows in the workbook may be output limits instead.
- **Same number, different letter:** TIC / FIC 10403, 10503, 30501, 30502, 30603, 80104 · LIC / FIC 10401, 10404, 10501, 30102 · PIC / FIC 10513, 80103 · PIC / FQIC 10104. Weak evidence:
  LIC10401 is a reactor level and FIC10401 its hexane feed, not a proven pair.
- **Letter groups** (one variable with several outputs, or three machines?): PIC10201A/B/C, IIC20101A/B/C, FIC10303A/B.
- **Question for OT:** if LIC10601 is the master of FIC10710, retiring FIC10710 left the master without its slave.

## 14. Not verified, and sources
- The plant was not touched: its registry values, links, device links, modes and broker are known only from documents.
- No real cascade exists in any data we have. Sections 5 and 6 come from reading code, not from a run.
- What the gateway publishes for "AUT IMAN", PRD or a not-selected loop is unknown. CENTUM meanings come from unofficial manual copies: check the site's licensed manuals.
- Days are rough estimates. Thresholds in 3.2 and health rules in 8.4 and 8.7 need SME and instrument approval.
- Instrumental's own documents and code are not in this repository and were not opened.

Sources [W]: speed ratio, Skogestad 2023 `skoge.folk.ntnu.no/prosessregulering/course-material/Skogestad-Advanced-control-elements-2023.pdf` · mode and open cascade, AIChE CEP
`aiche.org/sites/default/files/cep/20200555.pdf` · judge the pair together, refinery case `skoge.folk.ntnu.no/prost/proceedings/PID-12/papers/0046.pdf` · moving-SP loops, US10088829B2 and
US9733641 · sticking valves in slaves, ADCONIP 2014 `.../adconip-2014/pdf/SUBS81TO100/0098/0098_FI.pdf` · both loops flagged, `improvewithdv.blogspot.com/2014` · override,
`controlglobal.com/articles/2006/095` · split range, `controlglobal.com/articles/2019/ways-to-improve-split-range-control` · feedforward,
`blog.yokogawa.com/blog/feedforward-in-process-control` · actuator first, DYCOPS 2013 paper 0107 · NE 107, Endress+Hauser learning center.
