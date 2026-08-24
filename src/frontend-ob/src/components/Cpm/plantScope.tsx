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
 * between CPM pages and a scoped view is shareable. Options come from the
 * asset-model cascade (the same endpoints the plant model uses), so a scope can
 * only ever name locations that exist.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CpmLoop } from '../../api/cpmApi';
import { useSiteFilters, useAreaFilters, useUnitFilters } from './plantLocation';

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

/**
 * The cascade itself. Area is disabled until a site is chosen, unit until an
 * area is — and changing a parent resets its children (the cascade contract).
 * Labels show the human name, values submit the path segment, because the
 * segment is what the registry stores.
 */
export const PlantScopeFilter: React.FC<{
  scope: CpmScope;
  /** Shown after the selects, e.g. "12 of 54 loops". */
  summary?: React.ReactNode;
}> = ({ scope, summary }) => {
  const sites = useSiteFilters();
  const areas = useAreaFilters(scope.site);
  const units = useUnitFilters(scope.site, scope.area);

  const siteOptions = sites.data ?? [];
  const areaOptions = areas.data ?? [];
  const unitOptions = units.data ?? [];

  const label = (o: { name: string; segment: string }) =>
    o.name === o.segment ? o.name : `${o.name} (${o.segment})`;

  return (
    <div className="cpm-toolbar" style={{ flexWrap: 'wrap' }}>
      <label className="cpm-field">
        <span className="cpm-field__label">Site</span>
        <select className="cpm-select" value={scope.site}
          onChange={e => scope.set({ site: e.target.value })}>
          <option value="">All sites</option>
          {siteOptions.map(s => <option key={s.segment} value={s.segment}>{label(s)}</option>)}
        </select>
      </label>

      <label className="cpm-field">
        <span className="cpm-field__label">Area</span>
        <select className="cpm-select" value={scope.area}
          disabled={!scope.site || areaOptions.length === 0}
          onChange={e => scope.set({ area: e.target.value })}>
          <option value="">{scope.site ? 'All areas' : '— select a site —'}</option>
          {areaOptions.map(a => <option key={a.segment} value={a.segment}>{label(a)}</option>)}
        </select>
      </label>

      <label className="cpm-field">
        <span className="cpm-field__label">Unit</span>
        <select className="cpm-select" value={scope.unit}
          disabled={!scope.site || unitOptions.length === 0}
          onChange={e => scope.set({ unit: e.target.value })}>
          <option value="">{scope.site ? 'All units' : '— select a site —'}</option>
          {unitOptions.map(u => <option key={u.segment} value={u.segment}>{label(u)}</option>)}
        </select>
      </label>

      {scope.active && (
        <button type="button" className="cpm-pill cpm-pill--muted"
          style={{ cursor: 'pointer', alignSelf: 'flex-end', marginBottom: 4 }}
          onClick={() => scope.set({ site: '', area: '', unit: '' })}>
          Clear scope
        </button>
      )}
      {summary && (
        <span className="cpm-copy" style={{ alignSelf: 'flex-end', marginBottom: 4 }}>{summary}</span>
      )}
    </div>
  );
};

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

/**
 * Searchable, location-grouped loop picker — replaces the flat LoopSelect on
 * Calculations / Historical / Windows / Replay. Type-ahead matches loop id,
 * service, site/area/unit and loop type; options are grouped by their location
 * so a fleet reads as a plant rather than an alphabetical list.
 *
 * A datalist-backed input keeps it a native control (keyboard, mobile, no
 * dropdown-portal machinery) while still allowing free typing.
 */
export const LoopPicker: React.FC<{
  loops: CpmLoop[];
  value: string;
  onChange: (loopId: string) => void;
  label?: string;
  /** When set, out-of-scope loops are hidden and reported as a count. */
  scope?: CpmScope;
}> = ({ loops, value, onChange, label = 'Control loop', scope }) => {
  const [query, setQuery] = useState('');
  const listId = React.useId();

  const inScope = useMemo(
    () => (scope ? loops.filter(l => scope.matches(l)) : loops),
    [loops, scope]);
  const hidden = loops.length - inScope.length;

  const grouped = useMemo(() => {
    const visible = inScope.filter(l => loopMatchesQuery(l, query));
    const byLocation = new Map<string, CpmLoop[]>();
    for (const l of visible) {
      const key = [l.site, l.area, l.unit].filter(Boolean).join(' / ') || 'Unassigned';
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(l);
    }
    return [...byLocation.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [inScope, query]);

  const total = grouped.reduce((n, [, ls]) => n + ls.length, 0);

  return (
    <label className="cpm-field" style={{ minWidth: 260 }}>
      <span className="cpm-field__label">{label}</span>
      <select
        className="cpm-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {/* The current loop always stays selectable even if the query or scope
            would hide it — otherwise typing would silently change the page. */}
        {value && !grouped.some(([, ls]) => ls.some(l => l.loopId === value)) && (
          <option value={value}>{value} (outside current filter)</option>
        )}
        {grouped.map(([location, ls]) => (
          <optgroup key={location} label={location}>
            {ls.map(l => (
              <option key={l.loopId} value={l.loopId}>
                {l.loopId} · {l.displayName} · {l.loopType}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        className="cpm-input"
        style={{ marginTop: 4 }}
        list={listId}
        placeholder="Filter by loop, service, area, unit or type…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <datalist id={listId}>
        {inScope.slice(0, 200).map(l => <option key={l.loopId} value={l.loopId} />)}
      </datalist>
      <span className="cpm-copy" style={{ fontSize: '11px' }}>
        {total} loop{total === 1 ? '' : 's'} listed
        {query ? ` matching “${query}”` : ''}
        {hidden > 0 ? ` · ${hidden} hidden by scope` : ''}
      </span>
    </label>
  );
};
