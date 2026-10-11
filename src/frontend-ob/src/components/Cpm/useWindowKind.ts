/**
 * CHG-089: the fused window kind a CPM page shows — 12h by default, 24h on request — kept in the URL so a link, a
 * bookmark or a page change keeps the choice (docs/cpa-ui-fix-plan.md §2: the URL is the only selection state).
 *
 * The parameter name differs by page for reader compatibility (cpaHref.ts): Overview, KPI, Performance and Explorer
 * read `?window=`; Historical / Replay / Evidence read `?kind=` (their `?window=` is an evaluated window END);
 * Investigation reads `?profile=`. A missing or unknown value falls back to the default, never to an empty page.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The fused windows the engine serves (cplm-api WindowCatalog fusion.firesOn), default first. */
export const WINDOW_KINDS = ['12h', '24h'] as const;
export const DEFAULT_WINDOW_KIND = '12h';

/** A served kind, else the default — for a value read from a URL or an API (pure; tested). */
export const windowKindOf = (v: string | null | undefined, served: readonly string[] = WINDOW_KINDS): string =>
  v && served.includes(v) ? v : DEFAULT_WINDOW_KIND;

/** [kind, setKind]: the page's window kind from `?<param>=` and a setter that writes it back (history replace). */
export function useWindowKind(param = 'window', served: readonly string[] = WINDOW_KINDS): [string, (kind: string) => void] {
  const [params, setParams] = useSearchParams();
  const kind = windowKindOf(params.get(param), served);
  const setKind = useCallback((next: string) => {
    if (!served.includes(next)) return;
    setParams(prev => {
      const p = new URLSearchParams(prev);
      p.set(param, next);
      return p;
    }, { replace: true });
  }, [param, served, setParams]);
  return [kind, setKind];
}
