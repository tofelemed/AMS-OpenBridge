/**
 * The 12h / 24h choice travels between pages (UI-067, UI-075). Old pages use different names for it, and some use
 * `window` for an evaluated END, so only a real kind is ever read, under whichever name it sits.
 */
export type KindParam = 'window' | 'kind' | 'profile';

const isKind = (v: string | null): v is string => v === '12h' || v === '24h';

/** The choice on the address, under the name `param` first, then any other. */
export function chosenKind(p: URLSearchParams, param?: KindParam): string | undefined {
  return [param ? p.get(param) : null, p.get('window'), p.get('kind'), p.get('profile')].find(isKind);
}
