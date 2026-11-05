/**
 * The 12h / 24h choice across the tabs of one page (UI-067). Old pages name it `window`, `kind` or
 * `profile` (useWindowKind.ts), and on some `window` is an evaluated end, so tabs that share one
 * address translate it when the tab changes. Without this, a 24h choice fell back to 12h.
 */
export type KindParam = 'window' | 'kind' | 'profile';

export interface KindTab {
  /** Where this tab's page reads the choice. A tab without one shows no 12h / 24h choice. */
  kindParam?: KindParam;
  /** The page reads `window` as an evaluated END, so a kind must not reach it. */
  windowIsEnd?: boolean;
}

const isKind = (v: string | null): v is string => v === '12h' || v === '24h';

/** The choice on the address, under the name `param` first, then any other. */
export function chosenKind(p: URLSearchParams, param?: KindParam): string | undefined {
  return [param ? p.get(param) : null, p.get('window'), p.get('kind'), p.get('profile')].find(isKind);
}

/** Writes the choice on `p` under the name the tab being opened reads. */
export function carryKind(p: URLSearchParams, from: KindTab, to: KindTab): void {
  const kind = chosenKind(p, from.kindParam);
  if (kind && to.kindParam) p.set(to.kindParam, kind);
  if (to.windowIsEnd && isKind(p.get('window'))) p.delete('window');
}
