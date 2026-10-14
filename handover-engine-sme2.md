# Engine hand-over: SME review round 2, phase C

From ams-open-fb, 2026-10-14. The user approved handing these to the engine (gates) owner.
Evidence for each item: [SME_review_2_check.md](SME_review_2_check.md).

**CHG numbers.** CHG-092 and CHG-093 are reserved by ams-open-fb (phases A and B, frontend and cplm-api). Take CHG-094 or higher here.

**Frontend meanwhile.** Phase A adds frontend shims so the screens already agree, including on stored history. Engine fixes make
the stored data right from then on.

## C1. G15 status should equal the diagnosis band (SME #6)

**Problem.** `fusion/DiagnosisBands.java:43-72` writes `diagnosis = DETECTED_x` and `CLASSIFIED_x` with `gate15Status = "SUSPECTED"`.
`CplmGateFusionEngine.applyPersistence` (~419-424) turns a non-persistent call into `DETECTED_` with G15 `SUSPECTED`, so one result
is named two ways.

**Fix.** Set `gate15Status` to the same band as the diagnosis prefix: `DETECTED` / `CLASSIFIED` / `SUSPECTED` / `CONFIRMED`, and
`INSUFFICIENT_EVIDENCE` for `NO_CALL`. If downstream consumers need the old G15 vocabulary, add a separate field instead.

## C2. Hypotheses: evidence against vs. not assessed (SME #7)

**Problem.** `fusion/Hypothesis.java:35-40` only emits `QUALIFIED` / `DISQUALIFIED`, never `NOT_ASSESSED`.
`fusion/VerdictAssembly.java:72-91` marks EXTERNAL_DISTURBANCE without peer links, and SENSOR without a health source, as
DISQUALIFIED. A missing input therefore reads as evidence against.

**Fix.** Use three states:
- `DISQUALIFIED` only with real `contradictions` or `disqualifiers`.
- `NOT_ASSESSED` when a required input is missing:
  - disturbance with no peer links;
  - sensor with no health source and no freeze;
  - stiction with NO_VP and NO_VALID_CYCLE.

  Carry `missing_inputs`.
- `NO_EVIDENCE` otherwise.

## C3. Recommendation per diagnosis family (SME #14)

**Problem.** `CplmGateFusionEngine.java:248-252` gives every qualified family the same "positioner / bump test before retuning" text,
including oscillation and excessive effort.

**Fix.** Add a per-family recommendation:

| Family | Recommendation |
|---|---|
| stiction / geometry | current VP / positioner / stroke text, respecting `vpDeclaredAbsent` |
| oscillation (tuning) | review gain / integral; a step test confirms |
| external disturbance | trace the upstream / interacting loop |
| excessive effort | review gain / derivative and PV filtering / noise; check OP travel and reversals |

Scale the urgency by band, e.g. DETECTED = monitor.

## C4. G3 compliance unit trap (found during the check)

**Problem.** `contracts/gate-config/v1/property-catalogue.json` CFG-074 declares `G3.objective_compliance_min` as unit **fraction**,
range 0–1. But:
- the factory value is `0.005`;
- `config/BundleProfileMapper.java:54` reads it ×100;
- `config/FactoryLayer.java:34` writes it /100.

The round trip is consistent today. An engineer who enters 0.5 (meaning 50 %) makes the engine compare against 50, so G3 is
always WARN.

**Fix.** Make the stored value the real fraction (0.5) and drop the ×100 / ÷100. Migrate existing bundles, or validate the input.
