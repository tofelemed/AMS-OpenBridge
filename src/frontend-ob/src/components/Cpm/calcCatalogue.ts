/**
 * The honest metric catalogue for U9: one entry per metric our analytics tables
 * ACTUALLY store, grouped by the gate that consumes it. It is deliberately not
 * generated — the CPA prototype shipped a 143-row fixture describing metrics
 * that do not exist, and every row here maps to a real column in
 * cplm_short_feature_results / cplm_long_feature_results / cplm_gate_results.
 *
 * Split out of CpmCalculations so the page, the drawer and the catalogue each
 * stay within the repo's file-size limit.
 */

export interface MetricDef {
  id: string;
  field: string;          // column in the feature/gate rows
  name: string;
  gate: string;
  kind: 'Calculation' | 'Parameter' | 'Decision';
  unit: string;
  source: 'short' | 'long' | 'gate';
  description: string;
}

/** Metrics our analytics tables actually store — the honest catalogue. */
export const METRICS: MetricDef[] = [
  { id: 'CPLM-001', field: 'completeness', name: 'Sample completeness', gate: 'G0', kind: 'Calculation', unit: 'ratio', source: 'short', description: 'Fraction of expected samples present in the window.' },
  { id: 'CPLM-002', field: 'sample_count', name: 'Sample count', gate: 'G0', kind: 'Calculation', unit: 'count', source: 'short', description: 'Samples evaluated in the window.' },
  { id: 'CPLM-003', field: 'auto_pct', name: 'Automatic-mode fraction', gate: 'G1', kind: 'Calculation', unit: 'ratio', source: 'short', description: 'Time fraction the controller spent in AUTO.' },
  { id: 'CPLM-010', field: 'mae', name: 'Mean absolute error', gate: 'G3', kind: 'Calculation', unit: 'PV units', source: 'short', description: 'Mean |PV − SP| over the window.' },
  { id: 'CPLM-011', field: 'rmse', name: 'Root-mean-square error', gate: 'G3', kind: 'Calculation', unit: 'PV units', source: 'short', description: 'RMS control error.' },
  { id: 'CPLM-012', field: 'iae', name: 'Integral absolute error', gate: 'G3', kind: 'Calculation', unit: 'PV·s', source: 'short', description: 'Accumulated absolute error.' },
  { id: 'CPLM-013', field: 'ise', name: 'Integral squared error', gate: 'G3', kind: 'Calculation', unit: 'PV²·s', source: 'short', description: 'Accumulated squared error.' },
  { id: 'CPLM-014', field: 'good_error_pct', name: 'Good-error time', gate: 'G3', kind: 'Calculation', unit: 'fraction', source: 'short', description: 'Time fraction (0-1) the error stayed inside the good band.' },
  { id: 'CPLM-020', field: 'effort_ratio', name: 'Actuator effort ratio', gate: 'G4', kind: 'Calculation', unit: 'ratio', source: 'short', description: 'OP travel relative to the error it corrects.' },
  { id: 'CPLM-021', field: 'travel_per_day', name: 'OP travel per day', gate: 'G4', kind: 'Calculation', unit: '%/day', source: 'long', description: 'Total actuator travel extrapolated to a day.' },
  { id: 'CPLM-022', field: 'reversals_per_hour', name: 'OP reversals per hour', gate: 'G4', kind: 'Calculation', unit: 'per h', source: 'long', description: 'Direction changes of the actuator.' },
  { id: 'CPLM-030', field: 'acf_period_s', name: 'Oscillation period (ACF)', gate: 'G5', kind: 'Calculation', unit: 's', source: 'long', description: 'Dominant period from the autocorrelation.' },
  { id: 'CPLM-031', field: 'acf_regularity', name: 'Oscillation regularity', gate: 'G5', kind: 'Calculation', unit: 'ratio', source: 'long', description: 'How regular the oscillation is (0–1).' },
  { id: 'CPLM-040', field: 'harmonic_amplitude_ratio', name: 'Harmonic amplitude ratio', gate: 'G6', kind: 'Calculation', unit: 'ratio', source: 'long', description: 'Harmonics vs fundamental amplitude.' },
  { id: 'CPLM-041', field: 'harmonic_energy_ratio', name: 'Harmonic energy ratio', gate: 'G6', kind: 'Calculation', unit: 'ratio', source: 'long', description: 'Spectral energy in harmonics.' },
  { id: 'CPLM-050', field: 'triangularity', name: 'OP triangularity', gate: 'G7', kind: 'Calculation', unit: 'score', source: 'long', description: 'Triangular-wave similarity of the actuator trace (stiction shape).' },
  { id: 'CPLM-060', field: 'horch_oddness', name: 'Horch oddness', gate: 'G8', kind: 'Calculation', unit: 'score', source: 'long', description: 'Odd-symmetry of the PV–OP cross-correlation.' },
  // P2-4: raw is noise-sensitive (near 0.9+ even on healthy 5s data) and the
  // qualified variant reads 0.0 on the stiction reference loop, so NEITHER is a
  // trustworthy headline alone - say so instead of pretending.
  { id: 'CPLM-070', field: 'corner_score', name: 'Phase-portrait corner score (raw)', gate: 'G9', kind: 'Calculation', unit: 'score', source: 'long', description: 'Sharp-corner evidence in the PV–OP phase plot. CAUTION: the raw statistic reads high (~0.9) even on healthy noisy data; treat it only alongside the G9 verdict and phase-area band, never alone.' },
  { id: 'CPLM-090', field: 'confidence', name: 'Fused confidence', gate: 'G15', kind: 'Decision', unit: 'ratio', source: 'gate', description: 'Final banded confidence of the selected family.' },
];

