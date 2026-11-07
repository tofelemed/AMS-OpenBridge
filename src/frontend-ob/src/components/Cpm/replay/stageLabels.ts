/**
 * The five stages the evidence passed through, as tab labels, and the pinned long forms (a test pins the grid wording).
 * A missing or zero grid is "not reported", never "0 s" or an assumed 5 s (CHG-065).
 */
export const gridText = (gridS: number | null): string | null =>
  gridS != null && gridS > 0 ? `${gridS % 1 === 0 ? gridS : gridS.toFixed(1)} s grid` : null;

export const stageLabels = (gridS: number | null) => [
  'Raw historian',
  `Normalize (${gridText(gridS) ?? 'grid not reported'})`,
  'Feature windows',
  'Gate evaluation',
  'Fusion (G15)',
];

export const STAGE_TABS = [
  { value: 'raw', label: 'Raw historian' },
  { value: 'normalize', label: 'Normalize' },
  { value: 'features', label: 'Features' },
  { value: 'gates', label: 'Gate checks' },
  { value: 'fusion', label: 'Fusion' },
] as const;

export type Stage = (typeof STAGE_TABS)[number]['value'];
