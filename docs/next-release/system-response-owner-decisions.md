# System Response: owner decisions, 22 Nov 2026

For the System Response engine work on `feat/sr-engine-fixes` (CPA Redesign session, CHG-204..211) and its SME document
`docs/system-response-fixes-for-sme.md` on that branch. The session was not running when these were made, so they are
recorded here. Nothing below is built yet.

## 1. Auto only, no Manual (settles item 1)

- No bump-test capture in Manual. Nothing to build: the engine already captures only in automatic modes.
- The events from the controller's own output moves in Auto are **kept**: they are the only source of models today.
- Dropped: the "Bump test (Manual)" / "Output move (Auto)" labels, the alternative "stop the Auto output moves", and the
  I&C question "are bump tests a planned practice".

## 2. Cascade is not Auto for System Response; capture in AUT only

- System Response captures events only in **AUT**. **Cascade and master/slave analysis are the next phase**, with their
  own event type, label and pair analysis.
- Today `CplmNormalizedSample.isAutoMode()` (lines 227-242) counts CAS, CASC, CASCADE, RSP, SUP, DDC and any "AUTO" /
  "CASCADE" string as auto, and `ResponseCapture` uses it (lines 113-170).
- **Scope the change to the response job only**, for example a job argument `--response-capture-modes AUT` (default
  `AUT`; adding Cascade later = a setting change and a resubmit).
- **Do not change `isAutoMode()`**: `ShortFeatureCalculator` (auto mask), `ShortArtifacts` (authority) and the Overview
  "in auto mode" KPI (AUT + CAS ≥ 95 %) use it. The owner keeps that KPI as it is (normal-mode practice: Cascade is
  automatic control).
- Behaviour once built: AUT → CAS during an event censors it ("Controller changed mode"), the same as AUT → MAN.
- Before the Cascade phase: a read-only plant check of which loops run mostly in CAS. Those loops get no System Response
  events until then.

## 3. Controller tuning (P / I / D) arrives over MQTT (answers item 4, I&C question 1)

The plant will publish each loop's P, I and D on MQTT in the same payload and with the same rules as PV / SP / OP / MODE.
Nobody enters tuning by hand, and the "Controller tuning" loop-settings section is not needed.

Today the response job always passes `ControllerSnapshot.unknown()` (`CplmResponseAnalysisJob.java:172`):

| Step | State |
|---|---|
| Ingestion | **Already done.** `LoopIngestConfig.DefaultParamRoles` maps `P` → `p`, `I` → `i`, `D` → `d` and `LoopJoiner` writes them as extra numeric fields on `traverse.cpa.loop.samples.v1`. Only if the gateway uses other names: a `param_roles` overlay (configuration, no code) |
| Flink sample | **To build.** `CplmNormalizedSample` reads only pv, sp, op, vp, mode: add p, i, d |
| Response job | **To build.** a `ControllerSnapshot` from them instead of `unknown()`. CENTUM: P = proportional band %, so Kc = 100 / P (in % of span); I and D in seconds; PV span from the loop registry, output 0-100 % |
| Rule "tuning changed" | **To build.** a change in p, i or d censors the open event |
| Historian | **To decide.** the IoTDB raw template (`cpm_raw`: pv, sp, op, vp, mode) has no p, i, d. Adding measurements is allowed (it is not a rewrite of the raw tree), or keep a tuning-change log in Postgres instead |
| Then working (code exists) | frequency analysis (gain / phase margin, Bode: `FrequencyResponse`) and the tuning advice (`SimcAdvisor`) |

Still to ask I&C:
- the exact MQTT field names;
- whether P / I / D are sent on change or periodically;
- whether the loops use PID, PI-D or I-PD. Only the setpoint-response prediction and advice need this. Gain and phase
  margins do not, because the feedback path is the same in all three.

## Still open with the SME

Item 2 (which loops are integrating), item 6 (operating regions and their values), item 4 (which loops are averaging, for
λ), and confirmation of the defaults table. The plant shift times are a separate question:
`docs/next-release/shift-time-change.md`.
