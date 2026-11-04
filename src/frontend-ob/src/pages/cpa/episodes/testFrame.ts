/** Test data only: a full episode row, with what a test cares about overridden. */
import type { CpmEventFrame } from '../../../api/cpmApi';

export const frame = (over: Partial<CpmEventFrame>): CpmEventFrame => ({
  id: 1, loop_id: 'FIC1', window_kind: '24h', family: 'OSCILLATION', opened_at: '2026-11-01T07:45:00Z', closed_at: null,
  peak_diagnosis: 'CONFIRMED_OSCILLATION', peak_confidence: 0.9, last_diagnosis: 'SUSPECTED_OSCILLATION', last_confidence: 0.7,
  severity: 'HIGH', window_count: 4, ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: 'calc-1', dynamics_profile_version: 'dyn-1', availability_state: 'OBSERVED', condition_state: 'OPEN',
  result_revision: 2, qualified_support_ms: 10_800_000, close_reason: null, shelf_state: 'NONE', shelved_by: null, shelved_at: null,
  shelve_reason: null,
  ...over,
});
