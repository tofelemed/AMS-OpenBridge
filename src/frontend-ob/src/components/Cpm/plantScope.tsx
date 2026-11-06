'use client';

/**
 * Plant scope for the CPM workspace — the site/area/unit filter every fleet and
 * loop-list page shares (CPM-UX A1/A2).
 *
 * Why it exists: no CPM page could narrow to a section or unit. The fleet API
 * accepted `?site=` but every page passed undefined, and the loop picker was a
 * flat <select> of the entire fleet. At 54 demo loops that was survivable; at
 * plant scale it is not.
 *
 * Scope lives in the URL (`?site=&area=&unit=`) so it survives navigation
 * between CPM pages and a scoped view is shareable. The control that sets it is
 * the plant selector in the application header (ui/shell/PlantSelector.tsx);
 * this file holds the URL reader every page shares and the free-text loop match.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CpmLoop } from '../../api/cpmApi';

export interface CpmScope {
  site: string;
  area: string;
  unit: string;
  /** True when any level is set — pages use it to label "scoped" states. */
  active: boolean;
  /** Query-string fragment for the fleet endpoints (empty when unscoped). */
  params: { site?: string; area?: string; unit?: string };
  /** Client-side predicate for loop lists (registry, explorer, pickers). */
  matches: (loop: Pick<CpmLoop, 'site' | 'area' | 'unit'>) => boolean;
  set: (next: Partial<Pick<CpmScope, 'site' | 'area' | 'unit'>>) => void;
}

/**
 * Reads the scope from the URL. Setting a level clears the narrower ones —
 * an area from a different site is never a valid combination.
 */
export function useCpmScope(): CpmScope {
  const [params, setParams] = useSearchParams();
  const site = params.get('site') ?? '';
  const area = params.get('area') ?? '';
  const unit = params.get('unit') ?? '';

  return useMemo(() => {
    const write = (next: Partial<{ site: string; area: string; unit: string }>) => {
      setParams(p => {
        const apply = (k: 'site' | 'area' | 'unit', v: string) => {
          if (v) p.set(k, v); else p.delete(k);
        };
        if (next.site !== undefined) { apply('site', next.site); p.delete('area'); p.delete('unit'); }
        if (next.area !== undefined) { apply('area', next.area); p.delete('unit'); }
        if (next.unit !== undefined) { apply('unit', next.unit); }
        return p;
      }, { replace: true });
    };
    return {
      site, area, unit,
      active: !!(site || area || unit),
      params: {
        ...(site ? { site } : {}),
        ...(area ? { area } : {}),
        ...(unit ? { unit } : {}),
      },
      matches: (l) =>
        (!site || l.site === site)
        && (!area || (l.area ?? '') === area)
        && (!unit || (l.unit ?? '') === unit),
      set: write,
    };
  }, [site, area, unit, setParams]);
}

/** Free-text match across everything a person might type to find a loop. */
export function loopMatchesQuery(l: CpmLoop, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return l.loopId.toLowerCase().includes(s)
    || l.displayName.toLowerCase().includes(s)
    || (l.area ?? '').toLowerCase().includes(s)
    || (l.unit ?? '').toLowerCase().includes(s)
    || l.site.toLowerCase().includes(s)
    || l.loopType.toLowerCase().includes(s);
}

