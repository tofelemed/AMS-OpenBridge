/**
 * CHG-187 (owner review 11.2): what each gate tile means, for its ? tip. The tiles are KPI cards (title, value, ?), and the
 * notes that sat as sentences in the views (on the scope, the score, the shape) moved here, said once. Keyed by the
 * provenance key the tile reads, or by the tile's own label when it is a count the page makes (Peers, Dwell events).
 */
export const TILE_TIPS: Record<string, string> = {
  // G0, G1, G2, G2r
  'Accepted samples': 'Samples that passed data qualification, over every signal of the window.',
  Roles: 'Signals qualified in this window (PV, SP, OP, VP).',
  selected: 'Whether this loop\'s output was the selected one. An unknown mapping stays unknown.',
  tracking: 'Whether the output was tracking another signal. An unknown mapping stays unknown.',
  selector_id: 'The output selector the loop passes through, when it has one.',
  trigger_threshold: 'The setpoint change that counts as an event. A ramp is not a step.',
  trigger_threshold_source: 'Where the event threshold comes from.',
  operating_regime_id: 'The operating regime the window was judged in. Out of the model domain is not a healthy process.',
  // G3, G4
  tolerance_band: 'The error band the control objective allows.',
  eligible_duration: 'Time in the window that counted towards the objective.',
  objective_id: 'The control objective applied. Without one, performance has no health pass.',
  command_total_variation: 'Total movement of the controller output over the window. OP travel is not valve travel.',
  sigma_u_norm: 'Spread of the controller output, normalised.',
  sigma_pv_norm: 'Spread of the PV, normalised.',
  baseline_activity: 'Activity ratio at which the gate pays attention. High activity alone cannot confirm friction.',
  // G5 to G11
  period_s: 'Dominant oscillation period, from the autocorrelation.',
  regularity: 'How regular the oscillation is, from 0 to 1.',
  accepted_cycles: 'Complete cycles the estimate rests on. Too few cycles or too coarse sampling reject the estimate.',
  ordinate_kind: 'What the spectrum plots. An amplitude is never relabelled as a density.',
  resolution_hz: 'Frequency step between two spectrum bins.',
  'Peak bins': 'Spectrum bins marked as peaks or harmonics.',
  noise_reference: 'Median level of the spectrum in band, the background a peak is compared with.',
  'Accepted cycles': 'Cycles whose sine and triangle fits were accepted, of all the cycles found.',
  horch_oddness: 'Odd symmetry of the PV–OP cross-correlation. A lag asymmetry index, not an odd-harmonic spectrum: supporting evidence, never decisive on its own.',
  'Cycle polygons': 'Cycles drawn as PV-against-output polygons.',
  'Mean area': 'Mean polygon area, as a fraction of the cycle range. Geometry stays supporting evidence.',
  limit_reason: 'Where the output limits come from.',
  'Dwell events': 'Episodes the output spent at a limit.',
  limit_dwell_warn_s: 'Time at a limit at which the gate pays attention.',
  noise_band: 'Three standard deviations of the PV change per sample.',
  quantization: 'Smallest PV step seen. Quality and device status stay separate; one PV cannot show a biased sensor.',
  'Freeze events': 'Episodes where the PV did not change.',
  // G12 to G15
  event_type: 'The kind of response event.',
  capture_state: 'Whether the capture of the response completed.',
  censor_reason: 'Why the capture was cut short.',
  input_sequence_count: 'Input steps in the capture.',
  state: 'The state this record ends in.',
  Peers: 'Peer loops analysed. Unmapped or unobserved peers do not rule out a disturbance.',
  lag_s: 'Lag to each peer; negative means the peer leads.',
  coherence: 'Coherence with each peer in the band. Correlation alone gives no causal certainty.',
  claim_type: 'What the confirmation is about.',
  reason: 'Why the record is in this state.',
  scope: 'The confirmed subtype cannot exceed this scope.',
  non_following_dwell_s: 'Time the valve did not follow its command.',
  leading_hypothesis: 'The leading explanation, not confirmed.',
  case_state: 'The decision for this window.',
  condition_state: 'Missing evidence does not close a condition; a disabled gate reduces assessability rather than proving health.',
  availability: 'Which inputs the decision could use.',
  qualified_support: 'Time in the window that qualified as evidence.',
};

/** G14's state tile adds what a confirmation is. */
export const G14_STATE_TIP = 'Final-element confirmation is a claim scoped to its evidence: healthy tracking contradicts non-following, and no numeric certainty curve is drawn.';
