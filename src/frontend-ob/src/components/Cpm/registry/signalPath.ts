/**
 * The editor's short form of a signal path (CHG-168): under the loop's plant path it reads "…/fic10401.pv" (the plant path is said
 * once, in its own field); a path elsewhere stays whole. CHG-201: moved here from the side panel's facts, which went with the
 * panel; the editor (wizard/SignalsTab, wizard/ReviewStep) is its only user.
 */
import type { CpmLoop } from '../../../api/cpmApi';

export function shortPath(path: string, loop: Pick<CpmLoop, 'site' | 'area' | 'unit'>): string {
  const prefix = `${[loop.site, loop.area, loop.unit].filter(Boolean).join('/')}/`;
  return prefix.length > 1 && path.toLowerCase().startsWith(prefix.toLowerCase()) ? `…/${path.slice(prefix.length)}` : path;
}
