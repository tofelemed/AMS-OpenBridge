/**
 * Task 20: how each of the 19 stored metrics is computed, one formula and one plain sentence. Written from the engine
 * (src/flink/.../cplm/engine: ShortFeatureCalculator, SignalMath, OscillationMath, ShapeMath; fusion for CPLM-090), not
 * from the prototype: its CPLM-020 text, "OP travel / corrected error", is not what the engine computes, and its
 * CPLM-003 and CPLM-014 read as time fractions where the engine counts samples.
 * "error" is SP − PV. Thresholds are the run's profile and are not repeated here.
 */
export interface CalcMethod { formula: string; text: string }

const METHODS: Record<string, CalcMethod> = {
  'CPLM-001': {
    formula: 'samples received ÷ samples expected',
    text: 'Expected samples are the window length divided by the declared sample period, rounded. It is not capped at 1: above 1 means more samples arrived than the grid expects.',
  },
  'CPLM-002': {
    formula: 'n samples in the window',
    text: 'A count of the samples the window evaluated. It does not say the instruments are healthy.',
  },
  'CPLM-003': {
    formula: 'samples in AUTO ÷ samples',
    text: 'Counts samples, not elapsed time. Gate G1 judges it against the AUTO fractions of the run’s profile.',
  },
  'CPLM-010': {
    formula: 'mean(|SP − PV|)',
    text: 'Mean size of the control error per sample, in PV units. Not weighted by time, and not a cause.',
  },
  'CPLM-011': {
    formula: '√mean((SP − PV)²)',
    text: 'Per-sample root mean square of the error, in PV units. Large errors count for more than in the mean absolute error.',
  },
  'CPLM-012': {
    formula: 'Σ |SP − PV| · Δt',
    text: 'The error summed over the real gap to the next sample; the last sample takes the median gap. It grows with the window length.',
  },
  'CPLM-013': {
    formula: 'Σ (SP − PV)² · Δt',
    text: 'The squared error summed over the same gaps. It stresses large deviations and grows with the window length.',
  },
  'CPLM-014': {
    formula: 'samples inside the band ÷ samples',
    text: 'Counts samples whose error is within the good-error band: 0.5 % of the declared PV span, or 0.5 PV units when no span is declared. 0 is a measured result.',
  },
  'CPLM-020': {
    formula: 'std(OP) ÷ std(PV)',
    text: 'Population standard deviation of the output over that of the process value, with OP on 0–100 % when its range is declared. It reads 0 when PV does not move.',
  },
  'CPLM-021': {
    formula: 'Σ |ΔOP| × 24 ÷ window hours',
    text: 'The output’s total travel in the window, scaled linearly to a day. It is not a measured full day.',
  },
  'CPLM-022': {
    formula: 'direction changes of OP ÷ window hours',
    text: 'A change is a sign flip of the output step. Steps of 1e-9 or less are ignored.',
  },
  'CPLM-030': {
    formula: 'median of 2 × zero-crossing spacing × Δt',
    text: 'Read from where the autocorrelation of the detrended OP crosses zero (PV on an integrating loop). 0 s means no period was found; it is not an oscillation of zero seconds.',
  },
  'CPLM-031': {
    formula: 'min(1, period ÷ (3 × std of the periods))',
    text: 'How steady the zero-crossing periods are, from 0 to 1. A low value is a real result: not regular. It is 1 when the periods do not spread (std of 1e-9 or less).',
  },
  'CPLM-040': {
    formula: '(A2 + A3 + A5) ÷ A1',
    text: 'Spectrum amplitude at 2×, 3× and 5× the dominant frequency over the amplitude at the dominant frequency.',
  },
  'CPLM-041': {
    formula: '(A2² + A3² + A5²) ÷ A1²',
    text: 'The same harmonics as an energy ratio against the dominant frequency.',
  },
  'CPLM-050': {
    formula: 'mean over valid cycles of SSEsine ÷ (SSEsine + SSEtriangle)',
    text: 'Per cycle, the fit error of a sine against the fit error of a triangle wave. It needs a valid period and reads 0 with no valid cycle.',
  },
  'CPLM-060': {
    formula: 'Σ |φ₊ − φ₋| ÷ (Σ |φ₊ − φ₋| + Σ |φ₊ + φ₋|)',
    text: 'Odd symmetry of the standardised OP–PV cross-correlation, over up to 200 lags, or a quarter of the samples if fewer.',
  },
  'CPLM-070': {
    formula: 'turning angle at sharp corners ÷ total turning angle',
    text: 'On the PV–OP plane, the share of the turning angle at vertices sharper than the profile’s corner angle. It is the raw score: read it with the G9 result and the phase-area band, never alone.',
  },
  'CPLM-090': {
    formula: 'min(selected family score, G14 cap)',
    text: 'Detector score times the class prior for the leading family. The cap is 0.89 without a mapped valve position, and 0.54 when the family has not persisted across recent windows. A score, not a probability.',
  },
};

export const calcMethod = (id: string): CalcMethod => METHODS[id] ?? { formula: '', text: '' };
