# v2.5 Phase 2C — Exact per-gate intermediates as evidence, and the evidence API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Expands master-plan tasks 2C.1 and 2C.2.

**Goal:** Every engine gate (G0–G11, G13–G15) emits its exact intermediates as `EvidenceArtifact`s with **the workbook's field names** (`docs/next-release/spec/xlsx_Gate_evidence.tsv`, column "Artifact fields"), G6 moves from the naïve DFT to a Welch PSD in signal²/Hz with the ordinate kind declared, and cplm-api serves manifests and chunks immutably with ETags, tenant/site checks and on-demand reconstruction.

**Architecture:** One builder class per tier under `cplm/evidence/` (`ShortArtifacts` for G0–G4 from the short result, `LongArtifacts` for G5–G11 from the long result, `FusionArtifacts` for G13–G15 from the gate result) that read intermediates the calculators now *retain* on their result objects. The calculators keep their formulas; they gain retained arrays (`AcfResult.acf[]`, `FftResult.psd[]/freqHz[]`, cycle tables, geometry vertices) that were previously computed and discarded. The jobs already have evidence side outputs (long job since 1G.3); the short and fusion jobs gain the same side output. The golden test `CplmGateEngineSynTic001Test` may move **only** on G6 scalars, and the tolerance is recorded in `00-build-truth.md`.

**Tech Stack:** as Phase 2A; commons-math3 `FastFourierTransformer` (radix-2) for the Welch PSD. cplm-api: ASP.NET Core, Dapper, the 1G `PostgresEvidenceBlobStore`.

**Spec:** §3.1–3.3 (evidence workbench inputs), `xlsx_Gate_evidence.tsv`, §2.10 metric-record shape; NR-032, NR-034.

## Global Constraints

- Artifact field names are the workbook's, verbatim (a test parses the TSV and checks every gate's list).
- Units on every artifact axis; masks are boolean arrays aligned to `x`; a display-decimated series is never a substitute for the calculation series (`calculationSamples` vs `displayPoints` already on `EvidenceArtifact`).
- G6 `ordinate_kind = "PSD"`, unit `signal^2/Hz`, Welch: Hann window, `segment_samples` / `overlap_fraction` from the profile (defaults 256 / 0.5), zero-padded to the next power of two, one-sided, Parseval-consistent to 2 %.
- Golden values move only for G6 (documented tolerance); every other gate's scalars are byte-identical.
- Artifacts ride the existing chunk transport (1G.2) keyed by `method_run_id` of **their gate** (`method_run_ids[gate]` on the result), so the workbench selection resolves them from a gate cell.
- Files ≤ 400–500 lines; TDD; commit per task.

---

### Task 2C.1a: Retain the intermediates on the calculators (no formula change)

**Files:**
- Modify: `engine/OscillationMath.java` (`AcfResult` + `double[] acf, lagS; int[] pairCount; double[] crossingTimesS`; `FftResult` + `double[] freqHz, psd; String ordinateKind, spectralWindow; int fftSize; double resolutionHz, noiseReference; int[] peakIndices, harmonicIndices`), `engine/ShapeMath.java` (`TriangularityResult` + `List<CycleFit> cycles` with `cycleId, originalIndices[], phase[], measured[], sineFit[], triangleFit[], amplitude, phaseRad, sseSine, sseTriangle, score, accepted, rejectReason`; `HorchResult` + `double[] lagS, phiPositive, phiNegative, oddContribution, evenContribution`; `GeometryResult` + `List<CyclePolygon> polygons` with `cycleId, pairIndices[], pvNorm[], uNorm[], vertices[][], corners, area, bboxArea, qualificationSteps`), `engine/LimitMath.java` (`SaturationStats` + `boolean[] activeLow, activeHigh`; `DeltaPvResult` + `double[] deltaPv; double noiseBand; int[] spikeIndices`)
- Modify: `CplmShortFeatureResult`, `CplmLongDiagnosticsResult` — transient holders for the retained intermediates (NOT serialised to the results topic; `toJson` unchanged) so the artifact builders can read them in the same operator.
- Test: existing golden `CplmGateEngineSynTic001Test` unchanged and passing; new `RetainedIntermediatesTest` (ACF length = lags, PSD length = fftSize/2+1, cycle table size = completedCycles, polygons = accepted cycles).

- [ ] Step 1: failing `RetainedIntermediatesTest` → Step 2: run → Step 3: retain the arrays → Step 4: golden + new pass → Step 5: commit `refactor(flink): calculators retain their intermediates for evidence (no formula change) (2C.1a)`.

### Task 2C.1b: Welch PSD for G6 with the old scalars derived from it

**Files:**
- Create: `engine/WelchPsd.java` (`Result compute(double[] x, double tsSec, int segmentSamples, double overlapFraction)` → `freqHz[]`, `psd[]` (signal²/Hz, one-sided, Hann-corrected), `fftSize`, `resolutionHz`, `segments`, `parsevalRatio`)
- Modify: `OscillationMath.computeFftBandLimited` → PSD-based: `peakFreqHz`, `peakPeriodSec`, `peakRatio` (peak PSD / median in-band PSD), `harmonicAmplitudeRatio` (√PSD ratios), `harmonicEnergyRatio`, `spectralEntropy` (normalised PSD), `peakToMedian`, `totalEnergy` (∫PSD df) — same names, same meaning, computed from the PSD; `CplmLoopDynamicsProfile` + `g6SegmentSamples` (256), `g6OverlapFraction` (0.5), `g6DetrendMode` ("LINEAR")
- Test: `WelchPsdTest` (pure sine, period 100 s at 5 s → peak at 0.01 Hz within one resolution bin; Parseval within 2 %; white noise → flat within statistical bounds; unit `signal^2/Hz`), golden `CplmGateEngineSynTic001Test` re-baselined for the G6 scalars only — record old → new values and the reason in `00-build-truth.md`.

- [ ] Steps 1–5; commit `feat(flink): G6 Welch PSD in signal^2/Hz; legacy G6 scalars derived from the PSD; golden re-baselined for G6 only (2C.1b)`.

### Task 2C.1c: Artifact builders and side outputs for every gate

**Files:**
- Create: `evidence/ShortArtifacts.java` (G0 per role: `sample_time, verified_time, arrival_time, value, quality_native, quality_normalized, hold_kind, age_s, delta_t_s, accepted_mask, exclusion_reason`; G1: `mode_native, mode_normalized, controlling_authority, selector_id, selected, tracking, op_requested, u_applied, state_intervals`; G2: `sp, pv, d_sp_dt, event_id, trigger_threshold, stable_pre_mask, event_type`; G2r: `pv, u_applied, region_vertices_or_bounds, domain_mask, operating_regime_id`; G3: `error, tolerance_band, cumulative_iae, cumulative_ise, cumulative_itae, eligible_duration, objective_id, benchmark_interval`; G4: `u_applied, vp, delta_u, reversal_markers, command_total_variation, measured_travel_variation, sigma_u_norm, sigma_pv_norm, baseline_activity`), `evidence/LongArtifacts.java` (G5: `preprocessed_signal, acf_lag_s, acf_value, acf_pair_count, crossing_times, accepted_cycles, regularity_method`; G6: `frequency_hz, psd_or_amplitude, ordinate_kind, spectral_window, detrend, fft_size, resolution_hz, noise_reference, peak_indices, harmonic_indices`; G7: per cycle incl. rejected; G8: `lag_s, phi_positive, phi_negative, odd_contribution, even_contribution, method_id` (bicoherence absent + capability reason); G9: per cycle polygon; G10: `u_requested, u_applied, vp, tracking_error, active_low, active_high, limit_reason, dwell_events, supply_pressure, actuator_pressure, validity` (pressures null `NOT_MAPPED`); G11: `pv, delta_pv, noise_band, freeze_events, spikes, quantization, F, C, S, M, health_state_id, source_verified_time, measurement_impact, eligibility_intervals`), `evidence/FusionArtifacts.java` (G13 `UNAVAILABLE` capability record until 2F; G14: `claim_type, positive_evidence_ids, contradictions, source_validity, test_id, review_record, scope, confirmed_at`; G15: `observations, hypotheses, evidence_groups, score_semantics, explanations, qualified_support, condition_state, availability, case_state, result_revision`)
- Multi-column artifacts: extend `EvidenceArtifact` with optional named extra columns (`Map<String,double[]> columns`, `Map<String,String[]> labels`) — the chunker already encodes f64le columns; string columns ride the manifest `provenance` (they are small: reasons, ids).
- Modify: `CplmShortFeatureStreamJob` (evidence side output like the long job; `--evidence-topic`), `CplmGateFusionStreamJob` (same), `LongEvidence` → delegates to `LongArtifacts` (dwell/freeze tables stay as they are).
- Test: `GateArtifactsTest` — parses `xlsx_Gate_evidence.tsv` from the test classpath; for every gate G0–G11, G14, G15 the emitted artifact kinds/columns cover the workbook's field list exactly (G13 = UNAVAILABLE record with reason; G8 bicoherence optional); every artifact has units; masks boolean and aligned; G7 includes rejected cycles with reasons.

- [ ] Steps 1–5; commit `feat(flink): every gate emits its exact intermediates as evidence with the workbook's field names (2C.1c)`.

### Task 2C.2: Evidence API — manifest + chunks with ETag, on-demand reconstruction

**Files:**
- Modify: `Controllers/CpmMethodRunsController.cs` (`GET /method-runs/{id}` resolves through `cplm_gate_results.method_run_ids @> {gate:id}` **or** `cplm_short_feature_results` / `cplm_long_feature_results` (a stage id equals the fused id, so the row of any tier serves) **or** `analytics.response_event.method_run_id`; returns the gate's slice + identity; `GET /method-runs/{id}/evidence` → manifest `{artifacts:[{artifact_id, method_run_id, kind, role_or_path, support, x{quantity,unit}, y{quantity,unit}, columns[], data_type, encoding, checksum, calculation_samples, display_points, masks, provenance, readiness}]}`, `ETag = sha256(manifest json)`, `If-None-Match` → 304)
- Create: `Controllers/CpmEvidenceController.cs` (`GET /evidence/{id}/chunks/{n}` → `application/octet-stream` (gzip f64le), `ETag` = chunk sha, `Cache-Control: private, immutable, max-age=31536000`, `If-None-Match` → 304, 404 + JSON `EVIDENCE_EXPIRED` when the manifest is EXPIRED, 409 `EVIDENCE_PENDING` when not COMPLETE; site check: the loop's `site` must be in `X-Auth-Sites` when that header is present (403 otherwise))
- Modify: `Controllers/CpmAnalysisRunsController.cs` — `purpose=EVIDENCE_RECONSTRUCTION` + `methodRunId` → resolves the loop/window of that run and starts a bounded replay over exactly that support (`--from-ms/--to-ms`), linked through `analysis_run.manifest.reconstructs = <method_run_id>`; the original row is never touched.
- Test: `EvidenceApiTests` (lab DB, WebApplicationFactory or direct controller): COMPLETE manifest served with a stable ETag; `If-None-Match` → 304; PENDING → 409; EXPIRED → 404 `EVIDENCE_EXPIRED`; cross-site → 403; a method run resolvable from a short row, a gate row and a response event.

- [ ] Steps 1–5; commit `feat(cplm-api): immutable evidence API - manifests + chunks with ETags, site check, evidence reconstruction runs (2C.2)`.

## Self-review

- Spec coverage: §3.1 exact artifacts per gate (2C.1c), §3.2 G6 PSD semantics (2C.1b), §3.3 immutable served evidence with readiness states (2C.2), NR-032 (workbook field names test), NR-034 (unavailable artifact → reason, never an empty chart: the API returns readiness and the G13/G8 capability records carry reasons).
- Placeholders: none. Type consistency: `EvidenceArtifact.series(...)` from 1G.2 plus the new optional columns; `method_run_ids[gate]` keys (1G.3) are the artifact keys.
