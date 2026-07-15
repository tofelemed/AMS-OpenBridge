// Phase 6 — Units of Measure: a real dimension-aware conversion model, replacing the regex "guess the
// unit from the tag name" that TrendCore used to do. A unit belongs to a dimension (pressure, temp…);
// values convert within a dimension via a canonical base unit (linear: value*factor + offset).
//
// This is the model half of P1–P4. The *authoritative* unit for a tag comes from the asset catalog
// (asset-model's engineering_unit, surfaced by useAssetMetadata); this module is what converts and what
// offers the compatible-unit list for the per-item UOM switch. It never guesses from a tag name.

export type Dimension =
  | 'pressure' | 'temperature' | 'flow' | 'level' | 'speed' | 'rotation' | 'velocity' | 'ratio'
  | 'current' | 'voltage' | 'power' | 'frequency' | 'length' | 'mass' | 'volume' | 'unitless';

interface UnitDef {
  /** Canonical symbol (what displays render). */
  symbol: string;
  dimension: Dimension;
  /** value_in_base = value * factor + offset. */
  factor: number;
  offset: number;
  /** Accepted spellings/aliases (lower-cased), so "degC" and "°C" resolve to the same unit. */
  aliases: string[];
}

// Base unit per dimension: Pa, K, m³/s, %, m/s, ratio, A, V, W, Hz, m, kg, m³.
const UNITS: UnitDef[] = [
  // pressure — base Pa
  { symbol: 'Pa',   dimension: 'pressure', factor: 1,        offset: 0, aliases: ['pa', 'pascal'] },
  { symbol: 'kPa',  dimension: 'pressure', factor: 1000,     offset: 0, aliases: ['kpa'] },
  { symbol: 'bar',  dimension: 'pressure', factor: 100000,   offset: 0, aliases: ['bar'] },
  { symbol: 'psi',  dimension: 'pressure', factor: 6894.757, offset: 0, aliases: ['psi', 'psig'] },
  { symbol: 'MPa',  dimension: 'pressure', factor: 1_000_000, offset: 0, aliases: ['mpa'] },
  // temperature — base K
  { symbol: '°C',   dimension: 'temperature', factor: 1,     offset: 273.15,  aliases: ['degc', 'c', '°c', 'celsius'] },
  { symbol: '°F',   dimension: 'temperature', factor: 5 / 9, offset: 255.372, aliases: ['degf', 'f', '°f', 'fahrenheit'] },
  { symbol: 'K',    dimension: 'temperature', factor: 1,     offset: 0,       aliases: ['k', 'kelvin'] },
  // flow — base m³/s
  { symbol: 'm³/h', dimension: 'flow', factor: 1 / 3600,     offset: 0, aliases: ['m3/h', 'm3/hr', 'm³/hr'] },
  { symbol: 'L/s',  dimension: 'flow', factor: 0.001,        offset: 0, aliases: ['l/s', 'lps'] },
  { symbol: 'gpm',  dimension: 'flow', factor: 6.30902e-5,   offset: 0, aliases: ['gpm', 'gal/min'] },
  // level / ratio — base %
  { symbol: '%',    dimension: 'level', factor: 1,           offset: 0, aliases: ['%', 'pct', 'percent'] },
  // speed — base m/s
  { symbol: 'm/s',  dimension: 'speed', factor: 1,           offset: 0, aliases: ['m/s', 'mps'] },
  // rotation — its OWN dimension so RPM never cross-converts with a linear speed (both had factor 1).
  { symbol: 'RPM',  dimension: 'rotation', factor: 1,        offset: 0, aliases: ['rpm'] },
  // electrical
  { symbol: 'A',    dimension: 'current',   factor: 1, offset: 0, aliases: ['a', 'amp', 'amps'] },
  { symbol: 'mA',   dimension: 'current',   factor: 0.001, offset: 0, aliases: ['ma'] },
  { symbol: 'V',    dimension: 'voltage',   factor: 1, offset: 0, aliases: ['v', 'volt', 'volts'] },
  { symbol: 'kV',   dimension: 'voltage',   factor: 1000, offset: 0, aliases: ['kv'] },
  { symbol: 'kW',   dimension: 'power',     factor: 1000, offset: 0, aliases: ['kw'] },
  { symbol: 'MW',   dimension: 'power',     factor: 1_000_000, offset: 0, aliases: ['mw'] },
  { symbol: 'Hz',   dimension: 'frequency', factor: 1, offset: 0, aliases: ['hz'] },
  { symbol: 'mm/s', dimension: 'velocity',  factor: 0.001, offset: 0, aliases: ['mm/s'] }, // vibration velocity (its own dimension)
];

const BY_KEY = new Map<string, UnitDef>();
for (const u of UNITS) {
  BY_KEY.set(u.symbol.toLowerCase(), u);
  for (const a of u.aliases) BY_KEY.set(a, u);
}

/** Resolve a free-text unit string to a known unit definition (case/alias-insensitive). */
export function resolveUnit(unit?: string | null): UnitDef | undefined {
  if (!unit) return undefined;
  return BY_KEY.get(unit.trim().toLowerCase());
}

/** The dimension a unit belongs to, or 'unitless' if unknown. */
export function dimensionOf(unit?: string | null): Dimension {
  return resolveUnit(unit)?.dimension ?? 'unitless';
}

/** Canonical display symbol for a unit string (e.g. "degC" → "°C"), or the input unchanged. */
export function canonicalUnit(unit?: string | null): string {
  return resolveUnit(unit)?.symbol ?? (unit ?? '');
}

/** Every unit compatible with (same dimension as) the given unit, for the UOM-switch dropdown. */
export function compatibleUnits(unit?: string | null): string[] {
  const dim = dimensionOf(unit);
  if (dim === 'unitless') return canonicalUnit(unit) ? [canonicalUnit(unit)] : [];
  return UNITS.filter(u => u.dimension === dim).map(u => u.symbol);
}

/** True when two units can be converted between (same known dimension). */
export function convertible(from?: string | null, to?: string | null): boolean {
  const a = resolveUnit(from), b = resolveUnit(to);
  return !!a && !!b && a.dimension === b.dimension;
}

/**
 * Convert a numeric value between two units of the same dimension. Returns the value unchanged when the
 * units are the same, unknown, or of different dimensions (never silently produces a wrong number).
 */
export function convert(value: number, from?: string | null, to?: string | null): number {
  if (!Number.isFinite(value)) return value;
  const a = resolveUnit(from), b = resolveUnit(to);
  if (!a || !b || a.dimension !== b.dimension || a.symbol === b.symbol) return value;
  const base = value * a.factor + a.offset;      // → canonical base unit
  return (base - b.offset) / b.factor;           // → target unit
}
