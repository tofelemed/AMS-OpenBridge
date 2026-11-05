import type { ExplorerTab } from './readinessCauses';

/** The Loop page's tab for one of the Explorer's. Relationships sit under Signals there. */
export const loopTabOf = (t: ExplorerTab): string => (t === 'Relationships' ? 'signals' : t.toLowerCase());
