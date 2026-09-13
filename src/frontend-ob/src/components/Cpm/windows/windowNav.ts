/**
 * CHG-025 — Window inspector navigation: list view vs. one window's sub-page.
 *
 * Rows arrive newest first. The selected window is identified by its `window_end`
 * (the `?window=` URL parameter). A selection that does not name a LOADED row falls
 * back to the list rather than silently opening a different window's page.
 */
import type { CpmKpiRow } from '../../../api/cpmApi';

export type WindowView =
  | { view: 'list' }
  | {
    view: 'detail';
    selected: CpmKpiRow;
    /** Position among the loaded rows (0 = newest). */
    index: number;
    /** The next-newer loaded window, or null at the newest. */
    newer: CpmKpiRow | null;
    /** The next-older loaded window, or null at the oldest loaded. */
    older: CpmKpiRow | null;
  };

export function resolveWindowView(rows: CpmKpiRow[], selectedEnd: string | null): WindowView {
  if (!selectedEnd) return { view: 'list' };
  const index = rows.findIndex(r => r.window_end === selectedEnd);
  if (index < 0) return { view: 'list' };
  return {
    view: 'detail',
    selected: rows[index],
    index,
    newer: index > 0 ? rows[index - 1] : null,
    older: index < rows.length - 1 ? rows[index + 1] : null,
  };
}
