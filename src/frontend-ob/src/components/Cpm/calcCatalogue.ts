/**
 * The honest metric catalogue for U9: one entry per metric our analytics tables
 * ACTUALLY store, grouped by the gate that consumes it. It is deliberately not
 * generated — the CPA prototype shipped a 143-row fixture describing metrics
 * that do not exist, and every row here maps to a real column in
 * cplm_short_feature_results / cplm_long_feature_results / cplm_gate_results.
 *
 * Split out of CpmCalculations so the page, the panel and the catalogue each
 * stay within the repo's file-size limit.
 */

export const CATEGORIES = ['Data & mode', 'Control error', 'Actuator', 'Oscillation', 'Decision'] as const;
export type CalcCategory = typeof CATEGORIES[number];

export interface MetricDef {
  id: string;
  field: string;          // column in the feature/gate rows
  name: string;
  gate: string;
  category: CalcCategory;
  unit: string;
  source: 'short' | 'long' | 'gate';
  description: string;
}

/** Metrics our analytics tables actually store — the honest catalogue. */
export const METRICS: MetricDef[] = [
  { id: 'CPLM-001', category: 'Data & mode', field: 'completeness', name: 'Sample completeness', gate: 'G0', unit: 'ratio', source: 'short', description: 'Fraction of expected samples present in the window.' },
  { id: 'CPLM-002', category: 'Data & mode', field: 'sample_count', name: 'Sample count', gate: 'G0', unit: 'count', source: 'short', description: 'Samples evaluated in the window.' },
  { id: 'CPLM-003', category: 'Data & mode', field: 'auto_pct', name: 'Automatic-mode fraction', gate: 'G1', unit: 'ratio', source: 'short', description: 'Fraction of the window’s samples taken in AUTO.' },
  { id: 'CPLM-010', category: 'Control error', field: 'mae', name: 'Mean absolute error', gate: 'G3', unit: 'PV units', source: 'short', description: 'Mean |PV − SP| over the window.' },
  { id: 'CPLM-011', category: 'Control error', field: 'rmse', name: 'Root-mean-square error', gate: 'G3', unit: 'PV units', source: 'short', description: 'RMS control error.' },
  { id: 'CPLM-012', category: 'Control error', field: 'iae', name: 'Integral absolute error', gate: 'G3', unit: 'PV·s', source: 'short', description: 'Accumulated absolute error.' },
  { id: 'CPLM-013', category: 'Control error', field: 'ise', name: 'Integral squared error', gate: 'G3', unit: 'PV²·s', source: 'short', description: 'Accumulated squared error.' },
  { id: 'CPLM-014', category: 'Control error', field: 'good_error_pct', name: 'Good-error time', gate: 'G3', unit: 'fraction', source: 'short', description: 'Fraction (0–1) of the window’s samples whose error is inside the good band.' },
  { id: 'CPLM-020', category: 'Actuator', field: 'effort_ratio', name: 'Actuator effort ratio', gate: 'G4', unit: 'ratio', source: 'short', description: 'Spread of the actuator relative to the spread of the process value: std(OP) ÷ std(PV).' },
  { id: 'CPLM-021', category: 'Actuator', field: 'travel_per_day', name: 'OP travel per day', gate: 'G4', unit: '%/day', source: 'long', description: 'Total actuator travel extrapolated to a day.' },
  { id: 'CPLM-022', category: 'Actuator', field: 'reversals_per_hour', name: 'OP reversals per hour', gate: 'G4', unit: 'per h', source: 'long', description: 'Direction changes of the actuator.' },
  { id: 'CPLM-030', category: 'Oscillation', field: 'acf_period_s', name: 'Oscillation period (ACF)', gate: 'G5', unit: 's', source: 'long', description: 'Dominant period from the autocorrelation.' },
  { id: 'CPLM-031', category: 'Oscillation', field: 'acf_regularity', name: 'Oscillation regularity', gate: 'G5', unit: 'ratio', source: 'long', description: 'How regular the oscillation is (0–1).' },
  { id: 'CPLM-040', category: 'Oscillation', field: 'harmonic_amplitude_ratio', name: 'Harmonic amplitude ratio', gate: 'G6', unit: 'ratio', source: 'long', description: 'Harmonics vs fundamental amplitude.' },
  { id: 'CPLM-041', category: 'Oscillation', field: 'harmonic_energy_ratio', name: 'Harmonic energy ratio', gate: 'G6', unit: 'ratio', source: 'long', description: 'Spectral energy in harmonics.' },
  { id: 'CPLM-050', category: 'Oscillation', field: 'triangularity', name: 'OP triangularity', gate: 'G7', unit: 'score', source: 'long', description: 'Triangular-wave similarity of the actuator trace (stiction shape).' },
  { id: 'CPLM-060', category: 'Oscillation', field: 'horch_oddness', name: 'Horch oddness', gate: 'G8', unit: 'score', source: 'long', description: 'Odd-symmetry of the PV–OP cross-correlation.' },
  // P2-4: raw is noise-sensitive (near 0.9+ even on healthy 5s data) and the
  // qualified variant reads 0.0 on the stiction reference loop, so NEITHER is a
  // trustworthy headline alone - say so instead of pretending.
  { id: 'CPLM-070', category: 'Oscillation', field: 'corner_score', name: 'Phase-portrait corner score (raw)', gate: 'G9', unit: 'score', source: 'long', description: 'Sharp-corner evidence in the PV–OP phase plot. CAUTION: the raw statistic reads high (~0.9) even on healthy noisy data; treat it only alongside the G9 verdict and phase-area band, never alone.' },
  { id: 'CPLM-090', category: 'Decision', field: 'confidence', name: 'Fused evidence score', gate: 'G15', unit: 'score', source: 'gate', description: 'How fully the observed symptoms match the selected family (0–1; shown 0–100). Uncalibrated — not a probability.' },
];

