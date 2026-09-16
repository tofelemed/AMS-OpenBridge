/**
 * v2.5 Task 1E.2 (spec v6 R02) — the fusion v2 verdict as served by cplm-api under
 * `verdictV2` on every gate matrix (gates/latest and the gate history).
 *
 * Three things the engine keeps apart, and the UI must too:
 *   observations — what was SEEN, with the method that saw it (a symptom is not a cause);
 *   hypotheses   — what could EXPLAIN it, each with the evidence groups for and against;
 *   confirmation — the one FAULT-SCOPED claim this release can confirm
 *                  (FINAL_ELEMENT_NON_FOLLOWING), needing positive measured evidence.
 * Scores are evidence scores, uncalibrated — never probabilities (`scoreSemantics`).
 * A row written before v2.5 is served with `legacy: true` and is never re-interpreted.
 */

export type ObservationRole = 'PRIMARY' | 'SUPPORTING' | 'DISPLAY_ONLY' | string;

export interface CpmObservation {
  present: boolean;
  /** 0..1 evidence score (uncalibrated). */
  score: number;
  /** e.g. G7.SINE_TRIANGLE_SHAPE, XCORR_ASYMMETRY_V1, G5.ACF_OSCILLATION|G6.FFT_SPECTRAL */
  methodId: string;
  role: ObservationRole;
  /** The gate statuses it came from, e.g. "G7=STRONG". */
  basis: string;
}

export type HypothesisState = 'QUALIFIED' | 'DISQUALIFIED' | 'NOT_ASSESSED' | string;

export interface CpmHypothesis {
  score: number;
  state: HypothesisState;
  /** Observation ids that support it. */
  evidenceGroups: string[];
  /** Evidence that argues against it (VP_TRACKING_HEALTHY, DISTURBANCE_CONTEXT, …). */
  contradictions: string[];
  /** Why it was not qualified (NO_SHAPE_EVIDENCE, …). */
  disqualifiers: string[];
}

export type ConfirmationState =
  | 'CONFIRMED' | 'NOT_CONFIRMED' | 'CONTRADICTED' | 'NOT_APPLICABLE' | 'LEGACY_FLAG_ONLY' | string;

export interface CpmConfirmation {
  claimType: string;
  state: ConfirmationState;
  /** NO_VP | NO_POSITIVE_EVIDENCE | VP_TRACKING_HEALTHY | NON_FOLLOWING_DWELL | NOT_A_FINAL_ELEMENT_CLAIM | PRE_V25_ROW */
  reason: string;
  positiveEvidenceIds: string[];
  contradictions: string[];
  scope: string;
  nonFollowingDwellS: number;
  trackingErrorP95Pp: number;
  confirmedAtMs: number;
}

export type LeadingHypothesis =
  | 'STICTION' | 'OSCILLATION_TUNING' | 'EXTERNAL_DISTURBANCE' | 'EXCESSIVE_EFFORT'
  | 'ACTUATOR_LIMIT' | 'SENSOR' | 'NONE' | string;

export interface CpmVerdictV2 {
  /** True for a row written before v2.5: no observations/hypotheses, G14 was a VP-presence flag. */
  legacy: boolean;
  observations: Record<string, CpmObservation>;
  hypotheses: Record<string, CpmHypothesis>;
  leadingHypothesis: LeadingHypothesis | null;
  confirmation: CpmConfirmation;
  scoreSemantics: string;
  resultRevision: number;
}

/** Hypothesis ids in the order the engine ranks them for display. */
export const HYPOTHESIS_ORDER: LeadingHypothesis[] = [
  'STICTION', 'OSCILLATION_TUNING', 'EXTERNAL_DISTURBANCE', 'EXCESSIVE_EFFORT', 'ACTUATOR_LIMIT', 'SENSOR',
];

export const HYPOTHESIS_LABEL: Record<string, string> = {
  STICTION: 'Final element (stiction / nonlinearity)',
  OSCILLATION_TUNING: 'Oscillation — tuning',
  EXTERNAL_DISTURBANCE: 'External disturbance',
  EXCESSIVE_EFFORT: 'Excessive actuator effort',
  ACTUATOR_LIMIT: 'Actuator at a limit',
  SENSOR: 'Sensor / measurement',
  NONE: 'No mechanism qualified',
};

export const OBSERVATION_LABEL: Record<string, string> = {
  OSCILLATION: 'Sustained oscillation',
  SHAPE_TRIANGULARITY: 'Triangular OP waveform',
  LAG_ASYMMETRY: 'Cross-correlation asymmetry',
  PHASE_GEOMETRY: 'Phase-portrait geometry',
  ACTUATOR_STRESS: 'Actuator stress',
  LIMIT_OCCUPANCY: 'Output at a limit',
  FREEZE: 'PV freeze',
  PEER_LINKS: 'Peer links declared',
};
