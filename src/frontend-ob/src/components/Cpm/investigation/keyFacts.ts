/** Key facts — real stored metric fields with honest units (shared by the tiles and the delta table). */
export const KEY_FACTS: { field: string; label: string; unit: string; scale?: number }[] = [
  { field: 'stiction_score', label: 'Stiction score', unit: '' },
  { field: 'effort_ratio', label: 'Effort ratio', unit: '' },
  { field: 'triangularity', label: 'OP triangularity', unit: '' },
  { field: 'acf_period_s', label: 'Oscillation period', unit: 's' },
  { field: 'freeze_index_s', label: 'Freeze index', unit: 's' },
  // 0..1 fraction from the engine - scaled to percent by KEY_FACTS rendering.
  { field: 'good_error_pct', label: 'Good-error time', unit: '%', scale: 100 },
];

export const fmt = (v: number | undefined, digits = 2) => (v != null ? v.toFixed(digits) : '—');
