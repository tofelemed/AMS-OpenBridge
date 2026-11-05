/**
 * What crosses between the tabs of one page (UI-067, UI-075). They share one address, and old pages use
 * the same names for different things, so a tab change translates the address:
 * - The 12h / 24h choice travels. Old pages name it `window`, `kind` or `profile` (useWindowKind.ts).
 * - A selection stays on its tab. Otherwise another tab reads it as its own, or shows it for a loop
 *   chosen since: `methodRun` is one loop's evidence. Browser Back returns to it.
 */
export type KindParam = 'window' | 'kind' | 'profile';

export interface KindTab {
  /** Where this tab's page reads the choice. A tab without one shows no 12h / 24h choice. */
  kindParam?: KindParam;
  /** The page reads `window` as an evaluated END, so a kind must not reach it. */
  windowIsEnd?: boolean;
  /** Parameters that mean something only here. A tab change carries them neither in nor out. */
  own?: readonly string[];
}

const isKind = (v: string | null): v is string => v === '12h' || v === '24h';

/** The choice on the address, under the name `param` first, then any other. */
export function chosenKind(p: URLSearchParams, param?: KindParam): string | undefined {
  return [param ? p.get(param) : null, p.get('window'), p.get('kind'), p.get('profile')].find(isKind);
}

/** A kind sits in `window` on a tab that reads it elsewhere: a link or the menu brought it. */
export const misplacedKind = (p: URLSearchParams, tab: KindTab): boolean =>
  isKind(p.get('window')) && (!!tab.windowIsEnd || (!!tab.kindParam && tab.kindParam !== 'window'));

/** Moves that kind where the tab reads it. A value the link set itself wins. */
export function settleKind(p: URLSearchParams, tab: KindTab): void {
  const kind = p.get('window');
  if (kind && tab.kindParam && !p.has(tab.kindParam)) p.set(tab.kindParam, kind);
  p.delete('window');
}

/** The address for the tab being opened. */
export function carryKind(p: URLSearchParams, from: KindTab, to: KindTab): void {
  const kind = chosenKind(p, from.kindParam);
  for (const key of [...(from.own ?? []), ...(to.own ?? [])]) p.delete(key);
  if (kind) p.set(to.kindParam ?? 'kind', kind);
  if (misplacedKind(p, to)) p.delete('window');
}
