/**
 * CHG-201 (owner, 15 Nov 2026): what the Loop Registry list and the Loop detail page read from one loop record, in the user's
 * words. The description without the tag ("Flow controller · FCS0101"), the control station, the plant names from the asset
 * model (the slugs are never shown), the valve position word and each signal's source tag (never its path). Pure.
 */
import type { CpmLoop } from '../../../api/cpmApi';
import { serviceName } from '../loopName';
import { inputContextOf } from '../optionalInputs';

const STATION = /\s*\(([^()]+)\)\s*$/;

/** The description without the tag; a trailing "(FCS0101)" reads " · FCS0101". Empty when the description is only the tag. */
export function describeLoop(loop: Pick<CpmLoop, 'loopId' | 'displayName'>): string {
  const text = serviceName(loop);
  if (!text || text.toUpperCase() === loop.loopId.toUpperCase()) return '';
  const station = STATION.exec(text);
  if (!station) return text;
  const rest = text.slice(0, station.index).trim();
  return rest ? `${rest} · ${station[1].trim()}` : station[1].trim();
}

/** The control station: the trailing "(FCS0101)" of the description, or null. */
export function controlStation(loop: Pick<CpmLoop, 'displayName'>): string | null {
  return STATION.exec(loop.displayName ?? '')?.[1].trim() || null;
}

/** An asset name as people read it: "6002-Pellet Homogenization II" → "6002 · Pellet Homogenization II". */
export const plantName = (name: string): string => name.trim().replace(/^(\d+)\s*-\s*/, '$1 · ');

interface Named { contextualPath: string; name: string }
export interface PlantLocations { sites: Named[]; areas: Named[]; units: Named[] }
export interface Place { plant: string | null; area: string | null; unit: string | null }

export const NOT_IN_MODEL = 'Not in the plant model';

/**
 * The loop's plant, area and unit by their asset-model names. Null for a level the loop does not have, or before the model is
 * read; "Not in the plant model" for a level the model does not hold. Never the slug.
 */
export function placeOf(locations: PlantLocations | undefined, loop: Pick<CpmLoop, 'site' | 'area' | 'unit'>): Place {
  if (!locations) return { plant: null, area: null, unit: null };
  const find = (list: Named[], path: string) => {
    const hit = list.find(n => n.contextualPath.toLowerCase() === path.toLowerCase());
    return hit ? plantName(hit.name) : NOT_IN_MODEL;
  };
  const site = loop.site?.trim();
  const area = loop.area?.trim();
  const unit = loop.unit?.trim();
  return {
    plant: site ? find(locations.sites, site) : null,
    area: site && area ? find(locations.areas, `${site}/${area}`) : null,
    unit: site && unit ? find(locations.units, [site, area, unit].filter(Boolean).join('/')) : null,
  };
}

export interface Word { label: string; tone: 'plain' | 'warn' | 'muted'; glyph?: string }

/** The valve position in one word: Connected, Not connected (amber !), Not fitted or Not applicable. */
export function vpWord(loop: Pick<CpmLoop, 'engineering' | 'model' | 'tags'>): Word {
  const c = inputContextOf(loop)!;
  if (c.vpMapped) return { label: 'Connected', tone: 'plain' };
  if (c.vp === 'NOT_INSTALLED') return { label: 'Not fitted', tone: 'muted', glyph: '—' };
  if (c.vp === 'NOT_APPLICABLE') return { label: 'Not applicable', tone: 'muted', glyph: '—' };
  return { label: 'Not connected', tone: 'warn', glyph: '!' };
}

const pathOf = (loop: Pick<CpmLoop, 'tags'>, role: string): string | null => {
  const key = Object.keys(loop.tags ?? {}).find(k => k.toUpperCase() === role.toUpperCase());
  const path = key ? loop.tags[key]?.trim() : '';
  return path || null;
};

/** A role is connected when the loop maps a path to it. */
export const isMapped = (loop: Pick<CpmLoop, 'tags'>, role: string): boolean => pathOf(loop, role) !== null;

/**
 * The signal's tag in the control system: the source tag the tag map records, else the signal name, the path's last part
 * upper-cased ("…/fic10401.pv" → "FIC10401.PV"); null when the role is not connected. Never the path.
 */
export function sourceTagOf(loop: Pick<CpmLoop, 'tags' | 'sourceTags'>, role: string): string | null {
  const path = pathOf(loop, role);
  if (!path) return null;
  const recorded = Object.entries(loop.sourceTags ?? {}).find(([k]) => k.toUpperCase() === role.toUpperCase())?.[1]?.trim();
  if (recorded) return recorded;
  const parts = path.split('/').filter(Boolean);
  return (parts[parts.length - 1] ?? path).toUpperCase();
}
