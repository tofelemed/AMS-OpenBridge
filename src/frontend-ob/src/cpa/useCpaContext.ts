/**
 * The one reader of the global URL context (SPEC §2.2, DEC-002 RD3 and RD5): plant scope, time
 * range, window kind, loop and the site zone. Pages take these from here. Links go through cpaHref.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getFleetKpiTrend } from '../api/cpm/fleetKpis';
import { isValidZone } from '../components/Cpm/evidence/timezone';
import { useCpmScope, type CpmScope } from '../components/Cpm/plantScope';
import { useCpmLoops } from '../hooks/useCpm';
import { useAuthStore } from '../store/authStore';
import { browserZoneName, zoneAbbr } from './siteTime';

export const RANGE_OPTIONS = [
  { key: '8h', label: '8 h' },
  { key: '24h', label: '24 h' },
  { key: '7d', label: '7 d' },
  { key: '30d', label: '30 d' },
  { key: 'custom', label: 'Custom' },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]['key'];
export type WindowKind = '12h' | '24h';

export const DEFAULT_RANGE: RangeKey = '24h';

export interface CpaRange {
  key: RangeKey;
  from: string | null;
  to: string | null;
}

/** A custom range without both ends is not a range, so it falls back to the default. */
export function readRange(q: URLSearchParams): CpaRange {
  const from = q.get('from');
  const to = q.get('to');
  const key = q.get('range');
  if (from && to && (key === 'custom' || key == null)) return { key: 'custom', from, to };
  const preset = RANGE_OPTIONS.find(o => o.key === key && o.key !== 'custom');
  return { key: preset?.key ?? DEFAULT_RANGE, from: null, to: null };
}

export interface SiteZone {
  id: string;
  abbr: string;
}

/**
 * RD5: the loop's zone, otherwise the zone of the loops in scope, otherwise the plant setting
 * (Cpm:PlantTimeZone). Resolved once per page; UTC only when nothing declares a zone.
 */
export function pickZone(
  loopZone: string | null | undefined, scopeZone: string | null | undefined, plantZone: string | null | undefined,
): string {
  return [loopZone, scopeZone, plantZone].map(browserZoneName).find(isValidZone) ?? 'UTC';
}

function useSiteZone(loopId: string, scope: CpmScope): SiteZone {
  const canRead = useAuthStore(s => s.hasPermission('analytics.view'));
  const loops = useCpmLoops();
  const plant = useQuery({
    queryKey: ['cpa', 'plant-zone'],
    queryFn: ({ signal }) => getFleetKpiTrend(undefined, 1, signal),
    select: d => d.plantDay?.zone ?? null,
    enabled: canRead,
    staleTime: Infinity,
  });
  const list = loops.data?.loops;
  const id = useMemo(() => {
    const wanted = loopId.toLowerCase();
    const selected = list?.find(l => l.loopId.toLowerCase() === wanted);
    const inScope = list?.find(l => scope.matches(l) && isValidZone(l.timezone));
    return pickZone(selected?.timezone, inScope?.timezone, plant.data);
  }, [list, loopId, scope, plant.data]);
  return useMemo(() => ({ id, abbr: zoneAbbr(id) }), [id]);
}

export interface CpaContext {
  scope: CpmScope;
  range: CpaRange;
  /** Null until a page's segmented control sets it. Pages apply their own default. */
  window: WindowKind | null;
  loop: string;
  zone: SiteZone;
  setRange: (next: CpaRange) => void;
}

export function useCpaContext(): CpaContext {
  const [params, setParams] = useSearchParams();
  const scope = useCpmScope();
  const loop = params.get('loop')?.trim() ?? '';
  const zone = useSiteZone(loop, scope);

  const rangeKey = params.get('range');
  const from = params.get('from');
  const to = params.get('to');
  const range = useMemo(() => readRange(new URLSearchParams({
    ...(rangeKey ? { range: rangeKey } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}),
  })), [rangeKey, from, to]);

  const setRange = useCallback((next: CpaRange) => {
    setParams(p => {
      p.set('range', next.key);
      if (next.key === 'custom' && next.from && next.to) { p.set('from', next.from); p.set('to', next.to); }
      else { p.delete('from'); p.delete('to'); }
      return p;
    }, { replace: true });
  }, [setParams]);

  const kind = params.get('window');
  const window: WindowKind | null = kind === '12h' || kind === '24h' ? kind : null;
  return useMemo(() => ({ scope, range, window, loop, zone, setRange }), [scope, range, window, loop, zone, setRange]);
}
