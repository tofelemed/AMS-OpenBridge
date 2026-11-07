/** The sample the replay cursor is on: the nearest sample to the slider's percentage over the loaded points; -1 when nothing is loaded. */
export const cursorIndex = (count: number, pct: number): number =>
  count <= 0 ? -1 : Math.min(count - 1, Math.max(0, Math.round((pct / 100) * (count - 1))));
