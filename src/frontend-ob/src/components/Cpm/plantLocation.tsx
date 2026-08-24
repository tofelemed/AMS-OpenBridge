'use client';

/**
 * Plant location (site / area / unit) selection for the loop registry.
 *
 * Why this exists: site/area/unit were free-text inputs, and those strings are
 * not labels — they become the loop's UNS signal paths, which the signal-asset
 * projection turns into real Measurement assets. A typo therefore creates a
 * phantom asset that resolves to nothing instead of failing loudly, and the
 * registry already carries the evidence (one loop registered under a site that
 * exists in no asset model, another with dotted IoTDB-form paths copied from a
 * placeholder). Picking from the asset model removes the whole class.
 *
 * Manual entry stays available because the UNS is often loaded AFTER the first
 * loops are onboarded — but it is an explicit opt-in, and unmodelled locations
 * are flagged rather than silently accepted.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/apiFetch';

const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';

/** asset_type in the asset model: 1=Site, 2=Area, 3=Unit, 4=Device, 5=Measurement. */
const TYPE_SITE = 1, TYPE_AREA = 2, TYPE_UNIT = 3;

export interface PlantLocation {
  site: string;
  area: string;
  unit: string;
}

interface LocationAsset {
  contextualPath: string;
  name: string;
  type: number;
}

async function fetchByType(type: number): Promise<LocationAsset[]> {
  const res = await apiFetch(`${ASSET_API}?type=${type}&take=1000`);
  if (!res.ok) throw new Error(`asset lookup failed (${res.status})`);
  const data = await res.json() as { assets?: LocationAsset[] };
  return data.assets ?? [];
}

/**
 * Sites/areas/units from the asset model. Hierarchy is derived from the
 * contextual path rather than the children endpoint — the path already encodes
 * it (`site`, `site/area`, `site/unit`, `site/area/unit`), and that avoids
 * depending on a per-node round trip.
 *
 * P5.4: the interactive picker below no longer uses this (it reads the
 * server-side /filters cascade); this whole-tree pull remains ONLY for the CSV
 * bulk-import validator, which must check arbitrary site/area/unit rows in one
 * pass and genuinely needs the full location set.
 */
export function usePlantLocations() {
  return useQuery({
    queryKey: ['cpm', 'plant-locations'],
    staleTime: 60_000,
    queryFn: async () => {
      const [sites, areas, units] = await Promise.all(
        [TYPE_SITE, TYPE_AREA, TYPE_UNIT].map(fetchByType));
      return { sites, areas, units };
    },
  });
}

// ── the /assets/filters cascade (G-05) ─────────────────────────────────────
// Narrow server-side projections: areas require a site, units require a site
// (area optional — the legacy flat site/unit layout). Options carry the human
// label (name) AND the path segment; the UI displays names, submits segments,
// because the segment is what loop_registry stores and signal paths embed.

export interface FilterNode { path: string; name: string; segment: string }

async function fetchFilter(url: string): Promise<FilterNode[]> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`filter lookup failed (${res.status})`);
  return await res.json() as FilterNode[];
}

export function useSiteFilters() {
  return useQuery({
    queryKey: ['cpm', 'filters', 'sites'],
    staleTime: 60_000,
    queryFn: () => fetchFilter(`${ASSET_API}/filters/sites`),
  });
}

export function useAreaFilters(site: string) {
  return useQuery({
    queryKey: ['cpm', 'filters', 'areas', site],
    enabled: !!site,
    staleTime: 60_000,
    queryFn: () => fetchFilter(`${ASSET_API}/filters/areas?site=${encodeURIComponent(site)}`),
  });
}

export function useUnitFilters(site: string, area: string) {
  return useQuery({
    queryKey: ['cpm', 'filters', 'units', site, area],
    enabled: !!site,
    staleTime: 60_000,
    queryFn: () => fetchFilter(
      `${ASSET_API}/filters/units?site=${encodeURIComponent(site)}${area ? `&area=${encodeURIComponent(area)}` : ''}`),
  });
}

const seg = (path: string) => path.split('/').filter(Boolean);

/** Areas directly under a site. */
export function areasOf(areas: LocationAsset[], site: string): string[] {
  if (!site) return [];
  return areas
    .filter(a => seg(a.contextualPath)[0] === site)
    .map(a => seg(a.contextualPath)[1])
    .filter((v): v is string => !!v)
    .sort();
}

/**
 * Units under a site, narrowed to an area when one is chosen. A unit modelled
 * directly under the site (`houston/crude1`, the common 3-level layout) has no
 * area, so it only appears when no area is selected.
 */
export function unitsOf(units: LocationAsset[], site: string, area: string): string[] {
  if (!site) return [];
  return units
    .filter(u => {
      const parts = seg(u.contextualPath);
      if (parts[0] !== site) return false;
      return area ? parts.length === 3 && parts[1] === area : parts.length === 2;
    })
    .map(u => seg(u.contextualPath).slice(-1)[0])
    .sort();
}

// ── loop id + signal path conventions ──────────────────────────────────────

/**
 * Loop tags are the plant's, not ours: 45FIC-109, B2-027PIC and TIC.101 are all
 * legitimate. Only characters that genuinely break something are refused —
 * whitespace (the Flink `--loop-id` argument) and anything that does not survive
 * a URL path segment. Mirrors cplm-api CpmLoopRegistryService.Validate.
 */
// Control characters are refused server-side too; \s covers what a form can produce.
const LOOP_ID_FORBIDDEN = /[\s/\\?#%&;|$"'<>`{}[\]]/;
export const LOOP_ID_HINT =
  'Any plant tag, except spaces and the characters / \\ ? # % & ; | $ " \' < > ` { } [ ]';

/** Null when acceptable, else the reason. */
export function loopIdProblem(id: string): string | null {
  const v = id.trim();
  if (!v) return null;
  if (v.length > 64) return 'Loop tag is longer than 64 characters';
  if (LOOP_ID_FORBIDDEN.test(v)) return LOOP_ID_HINT;
  return null;
}

/**
 * Mirrors IotDbWriteClient.SafeNode — the historian device node. Two loop ids
 * that differ only in punctuation sanitise to the SAME node and would merge
 * their PV/SP/OP onto one series, so this is what must be unique (not the
 * character set).
 */
export function historianNode(id: string): string {
  const s = Array.from(id.trim(), c => (/[a-zA-Z0-9]/.test(c) ? c : '_')).join('');
  return /^[0-9]/.test(s) ? `_${s}` : s;
}

export const SIGNAL_ROLES = ['pv', 'sp', 'op', 'mode', 'vp'] as const;
export type SignalRole = typeof SIGNAL_ROLES[number];

/**
 * The UNS contextual path for one loop signal:
 *   site/[area/]unit/<loopid>.<role>
 *
 * Slash-separated — NOT the dotted `root.site.unit…` IoTDB projection. The
 * binding resolver splits on '/', so a dotted path fails its shape check and
 * the signal resolves to nothing (docs/ot-data-integration/02 §2.3).
 * Lower-cased per the documented UNS naming convention.
 */
export function deriveSignalPath(loc: PlantLocation, loopId: string, role: string): string {
  const prefix = [loc.site, loc.area, loc.unit]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join('/');
  const id = loopId.trim();
  if (!prefix || !id) return '';
  return `${prefix}/${id}.${role}`.toLowerCase();
}

/** True when the path parses as a contextual path the binding resolver accepts. */
export function isResolvablePath(path: string): boolean {
  const p = path.trim();
  if (!p) return false;
  if (p.startsWith('root.')) return false;          // IoTDB projection form
  return p.split('/').filter(Boolean).length >= 2;  // site/[area/]unit/device[.measurement]
}


// ── the picker ─────────────────────────────────────────────────────────────

export const PlantLocationPicker: React.FC<{
  value: PlantLocation;
  onChange: (next: PlantLocation) => void;
  /** Render as a compact row of fields inside an existing grid. */
  disabled?: boolean;
  /** P5.3: manual entry means the location is NOT checked against the asset
   *  model — the wizard forwards that as allowUnmodelledLocation, because the
   *  server now rejects unmodelled locations without it (G-07). */
  onManualModeChange?: (manual: boolean) => void;
}> = ({ value, onChange, disabled, onManualModeChange }) => {
  // Server-side cascade (P5.4): three narrow queries instead of pulling the
  // whole tree. Values are path segments; labels are the human names.
  const sites = useSiteFilters();
  const areas = useAreaFilters(value.site);
  const units = useUnitFilters(value.site, value.area);
  const [manual, setManual] = useState(false);

  const siteOptions = sites.data ?? [];
  const areaOptions = areas.data ?? [];
  const unitOptions = units.data ?? [];

  // A location already stored on the loop may predate the asset model (or the
  // model may not be loaded yet): keep showing it, flagged, instead of silently
  // resetting the field to blank.
  const siteUnknown = !!value.site && !!sites.data && !siteOptions.some(o => o.segment === value.site);
  const unitUnknown = !!value.unit && !!units.data && !unitOptions.some(o => o.segment === value.unit);

  const modelEmpty = !!sites.data && siteOptions.length === 0;
  const useManual = manual || modelEmpty;

  // Effective mode (explicit toggle OR forced by an empty model) drives the
  // wizard's allowUnmodelledLocation, so report the derived value, not the flag.
  React.useEffect(() => { onManualModeChange?.(useManual); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useManual]);

  const setField = (k: keyof PlantLocation) => (v: string) => {
    // Changing the site (or area) invalidates the narrower selections.
    if (k === 'site') onChange({ site: v, area: '', unit: '' });
    else if (k === 'area') onChange({ ...value, area: v, unit: '' });
    else onChange({ ...value, [k]: v });
  };

  const withCurrent = (options: FilterNode[], current: string): FilterNode[] =>
    current && !options.some(o => o.segment === current)
      ? [{ path: current, name: current, segment: current }, ...options]
      : options;

  const label = (o: FilterNode) =>
    o.name === o.segment ? o.name : `${o.name} (${o.segment})`;

  return (
    <>
      <label className="cpm-field">
        <span className="cpm-field__label">Site *</span>
        {useManual ? (
          <input className="cpm-input" value={value.site} disabled={disabled}
            onChange={e => setField('site')(e.target.value)} placeholder="hdpe" />
        ) : (
          <select className="cpm-select" value={value.site} disabled={disabled}
            onChange={e => setField('site')(e.target.value)}>
            <option value="">— select site —</option>
            {withCurrent(siteOptions, value.site).map(s => (
              <option key={s.segment} value={s.segment}>
                {label(s)}{siteUnknown && s.segment === value.site ? '  (not in UNS)' : ''}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="cpm-field">
        <span className="cpm-field__label">Area</span>
        {useManual ? (
          <input className="cpm-input" value={value.area} disabled={disabled}
            onChange={e => setField('area')(e.target.value)} placeholder="optional" />
        ) : (
          <select className="cpm-select" value={value.area}
            disabled={disabled || !value.site || (areaOptions.length === 0 && !value.area)}
            onChange={e => setField('area')(e.target.value)}>
            <option value="">{areaOptions.length ? '— none —' : '— no areas modelled —'}</option>
            {withCurrent(areaOptions, value.area).map(a => (
              <option key={a.segment} value={a.segment}>{label(a)}</option>
            ))}
          </select>
        )}
      </label>

      <label className="cpm-field">
        <span className="cpm-field__label">Unit</span>
        {useManual ? (
          <input className="cpm-input" value={value.unit} disabled={disabled}
            onChange={e => setField('unit')(e.target.value)} placeholder="u1001_polymerization_reactor_1" />
        ) : (
          <select className="cpm-select" value={value.unit}
            disabled={disabled || !value.site}
            onChange={e => setField('unit')(e.target.value)}>
            <option value="">{unitOptions.length ? '— select unit —' : '— no units modelled —'}</option>
            {withCurrent(unitOptions, value.unit).map(u => (
              <option key={u.segment} value={u.segment}>
                {label(u)}{unitUnknown && u.segment === value.unit ? '  (not in UNS)' : ''}
              </option>
            ))}
          </select>
        )}
      </label>

      <div className="cpm-field" style={{ gridColumn: '1 / -1' }}>
        {sites.isError && (
          <span className="cpm-field__error">
            Could not read the asset model — enter the location manually and verify it later.
          </span>
        )}
        {modelEmpty && !sites.isError && (
          <span className="cpm-copy">
            No sites exist in the asset model yet, so the location is entered manually. Load the UNS
            hierarchy to pick from a list and to have loop signals resolve against real assets.
          </span>
        )}
        {!modelEmpty && (
          <span className="cpm-copy">
            {useManual
              ? 'Manual entry — the value is not checked against the asset model, and activation will need the "allow unmodelled location" override. '
              : 'Picked from the UNS asset model, so the loop’s signal paths resolve against real assets. '}
            {!sites.isError && (
              <button type="button" className="cpm-pill cpm-pill--muted"
                style={{ cursor: 'pointer', marginLeft: 6 }}
                onClick={() => setManual(!useManual)} disabled={disabled}>
                {useManual ? 'Pick from asset model' : 'Enter manually'}
              </button>
            )}
          </span>
        )}
        {(siteUnknown || unitUnknown) && (
          <span className="cpm-copy cpm-tone-warn">
            {siteUnknown && `Site “${value.site}” `}{siteUnknown && unitUnknown && 'and '}
            {unitUnknown && `unit “${value.unit}” `}
            {siteUnknown && unitUnknown ? 'do' : 'does'} not exist in the asset model. Activation
            will reject this location unless “allow unmodelled location” is set — the signals would
            sit outside the plant tree.
          </span>
        )}
      </div>
    </>
  );
};
