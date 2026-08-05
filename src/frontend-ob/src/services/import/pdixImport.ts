// Phase I — AVEVA PI Vision .pdix importer.
// Lifted + adapted from the legacy ScreeN-Import app's ScreenImportService.ts: same parse approach
// (JSZip → display_json → symbol scene-graph) but emitting THIS repo's CanvasItem shape, with
// mapPdixType re-pointed to our OpenBridge symbol ids and the previously-dropped fields (rules,
// multiState, nav, secondary bindings) fillable. Symbols that don't map cleanly are surfaced in
// `unmapped` (never silently dropped).
//
// P0 (gap-analysis 04): failures are now LOUD end to end — unmapped symbols render as a visible,
// self-describing `import.unmapped` placeholder (not an invisible 1px outline), the full report is
// persisted onto `settings.importReport` so it survives Save, structural `group` drops are recorded,
// and a one-line summary is logged.
import JSZip from 'jszip';
import type { CanvasItem } from '../../components/Designer/types';

/** One symbol the importer could not render natively — surfaced for manual mapping. */
export interface UnmappedSymbol { id: string; name: string; piType: string; reason: string; ref?: string }

/** Persisted with the display (`settings.importReport`) so re-opening it shows what was lost. */
export interface ImportReport {
  source: 'pdix';
  productVersion?: string;
  importedAt?: string;              // stamped by the caller at save time (importer avoids Date.now)
  total: number;                    // symbols in the source file
  rendered: number;                 // imported as a native, renderable symbol
  placeholders: number;             // imported as a visible import.unmapped placeholder
  bindingsTotal: number;            // data-bound symbols
  bindingsUnresolved: number;       // …UNS-normalized but not yet verified against the Asset Model
  multiStateDropped: number;        // symbols whose PI MultiState dynamics could not be reconstructed
  navImported: number;              // symbols whose LinkURL navigation was carried
  navNeedsRemap: number;            // …of those, internal PI routes that need repointing to an AMS display
  byType: Record<string, number>;   // source SymbolType → count
  unmapped: UnmappedSymbol[];
  notes: string[];
}

export interface ImportedDisplay {
  name: string;
  items: CanvasItem[];
  settings: {
    canvasWidth: number; canvasHeight: number; backgroundColor: string; gridSize: number; showGrid: boolean;
    /** P0 — the import report travels with the display so nothing is silently lost on Save. */
    importReport?: ImportReport;
  };
  unmapped: UnmappedSymbol[];
  stats: Record<string, number>;
  report: ImportReport;
}

// PI Vision SymbolType (lowercased) → our symbol type id. Re-pointed to OpenBridge/AMS ids.
const TYPE_MAP: Record<string, string> = {
  rectangle: 'shape.rect', simplerectangle: 'shape.rect', rect: 'shape.rect',
  line: 'shape.line', simpleline: 'shape.line',
  ellipse: 'shape.circle', circle: 'shape.circle', simplecircle: 'shape.circle',
  polygon: 'shape.polygon',
  statictext: 'shape.label', text: 'shape.label', label: 'shape.label', simpletext: 'shape.label',
  value: 'obc.readout-unit', numeric: 'obc.readout-unit', indicator: 'obc.readout-unit',
  trend: 'chart.trend', chart: 'chart.trend',
  // Gauge variants map to ind.gauge — a renderable custom gauge. (ind.radial/ind.bar/ind.vbar
  // have NO renderer and previously imported as silent "❓" boxes.)
  radial: 'ind.gauge', radialgauge: 'ind.gauge', gauge: 'ind.gauge',
  bargauge: 'ind.gauge', verticalgauge: 'ind.gauge',
  // Native data-view symbols our app already renders. These did not appear in the 301-Kiln sample but
  // are common in other PI Vision displays; without them they'd import as caution placeholders even
  // though a renderer exists. (Container/criteria types render an "empty — configure" state when their
  // criteria didn't round-trip, so mapping is safe.) See docs/migration/04-pdix-import-gap-analysis.md §4.
  table: 'table.value', valuetable: 'table.value',
  timeseries: 'table.timeseries', timeseriestable: 'table.timeseries',
  xyplot: 'chart.xy', scatter: 'chart.xy',
  barchart: 'chart.bar', bar: 'chart.bar', horizontalstackedbar: 'chart.bar',
  assetcomparisontable: 'table.compare', comparisontable: 'table.compare',
  collection: 'collection.container', symbolcollection: 'collection.container',
  eventtable: 'alarm.table', eventframetable: 'alarm.table', events: 'alarm.table',
};

// PI Vision Configuration.DataShape (lowercased) → our type. DataShape is the more stable discriminator
// across PI Vision versions (SymbolType strings drift), so it is consulted FIRST when present.
const DATASHAPE_MAP: Record<string, string> = {
  value: 'obc.readout-unit',
  trend: 'chart.trend',
  table: 'table.value',
  timeseries: 'table.timeseries', timeseriestable: 'table.timeseries',
  xyplot: 'chart.xy',
  gauge: 'ind.gauge', radialgauge: 'ind.gauge', verticalgauge: 'ind.gauge',
  bar: 'chart.bar', horizontalstackedbar: 'chart.bar',
  assetcomparisontable: 'table.compare',
  collection: 'collection.container', symbolcollection: 'collection.container',
};

// Every type the mapping is allowed to emit MUST have a renderer (SymbolRenderer/CustomSymbols).
// A mapping to anything outside this set is surfaced in `unmapped` rather than rendering a
// silent "❓" — the importer is the migration front door, so failures must be visible.
const RENDERABLE_MAPPED_TYPES = new Set<string>([
  'shape.rect', 'shape.line', 'shape.circle', 'shape.polygon', 'shape.label',
  'obc.readout-unit', 'chart.trend', 'ind.gauge',
  'table.value', 'table.timeseries', 'table.compare', 'chart.xy', 'chart.bar', 'collection.container', 'alarm.table',
]);

// External symbol-library graphic (DirectoryKey/FileKey) → a native AMS equipment symbol, matched by
// keyword. PI Vision's BUILT-IN library uses recognisable names ("Centrifugal Pump", "Gate Valve",
// "Motor"), so those map to a real icon instead of a placeholder. Custom libraries with opaque names
// (e.g. "Margoon Cement / Group 486") match nothing and correctly stay visible placeholders.
// Order matters — more specific patterns first. Every target must be a renderable equip.* type.
const GRAPHIC_KEYWORD_MAP: Array<[RegExp, string]> = [
  [/on[\s_/-]?off\s*valve|solenoid\s*valve/i, 'equip.valve-onoff'],
  [/valve|butterfly|\bball\b|\bgate\b|globe/i, 'equip.valve'],
  // Compressor/fan before pump so "centrifugal fan/compressor" don't fall through to the pump noun.
  [/compressor/i, 'equip.compressor'],
  [/\bfan\b|blower/i, 'equip.fan'],
  [/\bpump\b|slurry/i, 'equip.pump'],
  [/\bmotor\b/i, 'equip.motor'],
  [/heat[\s_-]?exchanger|\bhx\b/i, 'equip.hx'],
  [/agitator|mixer|stirrer/i, 'equip.agitator'],
  [/conveyor/i, 'equip.conveyor'],
  [/\btank\b|vessel|silo|\bdrum\b|hopper/i, 'equip.tank'],
];

// A library graphic this large is a background schematic / P&ID drawing, never a single piece of
// equipment — don't let a stray keyword turn the whole-plant SVG into a pump icon.
const GRAPHIC_ICON_MAX_PX = 600;

/** Match an external graphic to a native equipment symbol by DirectoryKey/FileKey keyword. */
function mapGraphicSymbol(dirKey: unknown, fileKey: unknown, width: number, height: number): string | undefined {
  if (width >= GRAPHIC_ICON_MAX_PX || height >= GRAPHIC_ICON_MAX_PX) return undefined;
  const hay = `${dirKey ?? ''} ${fileKey ?? ''}`;
  for (const [re, type] of GRAPHIC_KEYWORD_MAP) if (re.test(hay)) return type;
  return undefined;
}

/** PI Vision numeric FormatType ("N0"/"N2"/"P1"/…) → decimal places. */
function decimalsFromFormat(ft: unknown): number | undefined {
  if (typeof ft !== 'string') return undefined;
  const m = ft.match(/^[NFPnfp](\d+)$/);
  return m ? Number(m[1]) : undefined;
}

/** PI Vision LinkURL → a NavigationLink. Absolute https (and same-origin '/') links are functional at
 *  runtime; internal PI routes ('./#/Displays/<piId>/<name>') can't resolve to an AMS display and are
 *  carried for the author to repoint. Returns whether the link works as-is. */
function navFromLinkUrl(lu: unknown): { link: NonNullable<CanvasItem['navigationLink']>; functional: boolean } | undefined {
  const raw = String(lu ?? '').trim();
  if (!raw) return undefined;
  const seg = raw.split(/[/\\]/).filter(Boolean).pop() ?? raw;
  let label: string | undefined;
  try { label = decodeURIComponent(seg); } catch { label = seg; }
  label = label.replace(/[#?].*$/, '').replace(/[_-]{1,}/g, ' ').trim() || undefined;
  const functional = /^https:/i.test(raw) || (raw.startsWith('/') && !raw.startsWith('//'));
  return { link: { targetUrl: raw, label, openMode: 'replace' }, functional };
}

/** The dedicated, visible placeholder type for anything that couldn't map (see CustomSymbols). */
export const IMPORT_PLACEHOLDER_TYPE = 'import.unmapped';

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** ARGB int / rgba() / #hex / transparent → CSS color (or 'none'). */
function convertColor(c: unknown): string | undefined {
  if (c == null || c === '') return undefined;
  if (typeof c === 'number') {
    const a = (c >>> 24) & 0xff;
    if (a === 0) return 'none';
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
    return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
  }
  const s = String(c).trim();
  if (s.toLowerCase() === 'transparent' || s === 'rgba(0,0,0,0)' || s === 'rgba(255,255,255,0)') return 'none';
  return s;
}

/** UNS naming rules (uns-namespace-spec §5): lowercase, non-alphanumerics → underscore, collapsed. */
function slug(seg: string): string {
  return seg.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * pi:\\SRV?guid\PATH#Value?id  /  af:\\SRV\A\B?guid|ATTR?id  →  a UNS contextual path the Binding
 * Resolver can parse: `site/[…/]device.measurement`, lowercase + underscored (uns-namespace-spec §4).
 *
 * Best-effort — a raw PI tag carries no site/unit, so the transform preserves the source hierarchy
 * (PI/AF server → site) rather than inventing one. The path is SHAPE-correct (resolver returns a
 * Sparkplug topic/metric and resolved:true); live data flows once the referenced asset actually exists
 * in the Asset Model, or an alias_mapping row points at it. A '/' is always kept so a trend pen (which
 * treats a slash as "this is a real path") survives.
 */
function normalizeBinding(raw: unknown): string | undefined {
  if (!raw) return undefined;
  let s = String(raw);
  s = s.replace(/^(pi|af):\\\\/i, '');
  s = s.replace(/\?[0-9a-f-]{8,}/gi, '');   // strip GUID query segments
  s = s.split('#')[0];                       // drop #Value etc.
  const segs = s.split(/[\\/|]/).map(slug).filter(Boolean);
  if (segs.length === 0) return undefined;
  if (segs.length === 1) return segs[0];                                   // device only
  if (segs.length === 2) return `${segs[0]}/${segs[1]}`;                   // site/device (no measurement)
  // ≥3: …/device.measurement (last = measurement, previous = device), rest = site/[area/]unit.
  return `${segs.slice(0, -2).join('/')}/${segs[segs.length - 2]}.${segs[segs.length - 1]}`;
}

function firstBinding(sym: Record<string, unknown>): string | undefined {
  const ds = (sym.DataSources ?? sym.MSDataSources ?? []) as unknown[];
  return ds.length ? normalizeBinding(ds[0]) : undefined;
}

/** Does this source symbol carry a PI MultiState definition we do not yet translate? */
function hasMultiState(sym: Record<string, unknown>): boolean {
  const ms = sym.MSSymbolsIds as unknown[] | undefined;
  const md = sym.MSDataSources as unknown[] | undefined;
  return (Array.isArray(ms) && ms.length > 0) || (Array.isArray(md) && md.length > 0);
}

export async function importPdix(file: File | Blob): Promise<ImportedDisplay> {
  const zip = await JSZip.loadAsync(file);
  const displayEntry = zip.file('display_json') ?? zip.file(/display_json/i)[0];
  if (!displayEntry) throw new Error('Not a .pdix: no display_json entry');
  const display = JSON.parse(await displayEntry.async('string'));
  const symbols: Array<Record<string, unknown>> = display.Symbols ?? display.symbols ?? [];

  const items: CanvasItem[] = [];
  const unmapped: UnmappedSymbol[] = [];
  const stats: Record<string, number> = {};
  const notes: string[] = [];
  let maxX = 0, maxY = 0;
  let multiStateDropped = 0, navImported = 0, navNeedsRemap = 0, bindingsTotal = 0, groups = 0;

  /** Emit a visible, self-describing placeholder AND record it in `unmapped`. */
  const placeholder = (
    id: string, name: string, piType: string, reason: string,
    x: number, y: number, width: number, height: number, rotation: number, ref?: string,
  ) => {
    unmapped.push({ id, name, piType, reason, ref });
    items.push({
      id, type: IMPORT_PLACEHOLDER_TYPE, position: { x, y }, size: { width, height }, rotation,
      label: `⚠ ${ref || piType}`,
      // The full reason rides along for the render tooltip (no new CanvasItem field needed).
      textProps: { text: `${piType}${ref ? ` · ${ref}` : ''} — ${reason}` },
    });
  };

  symbols.forEach((sym, idx) => {
    const piType = String(sym.SymbolType ?? sym.Type ?? '?').toLowerCase();
    stats[piType] = (stats[piType] ?? 0) + 1;
    const cfg = (sym.Configuration ?? {}) as Record<string, unknown>;
    const id = `pdix-${idx}`;
    const name = String(sym.Name ?? id);
    const x = num(cfg.Left), y = num(cfg.Top);
    const width = num(cfg.Width, piType === 'value' || piType === 'statictext' ? 90 : 40);
    const height = num(cfg.Height, 24);
    const rotation = num(cfg.Rotation);
    maxX = Math.max(maxX, x + width); maxY = Math.max(maxY, y + height);

    // Structural group container: PI Vision stores its children as top-level symbols, so they import
    // on their own — the group itself is not drawable. Recorded (not silently swallowed).
    if (piType === 'group') { groups++; return; }

    // External SVG symbol-library graphic (DirectoryKey/FileKey). The artwork lives on the PI server,
    // not in the .pdix — but if the library name identifies a known equipment kind (pump/valve/…), map
    // it to a native AMS symbol. Otherwise it can't round-trip → a visible placeholder to rebuild.
    if (piType === 'graphic') {
      if (hasMultiState(sym)) multiStateDropped++;
      const equip = mapGraphicSymbol(cfg.DirectoryKey, cfg.FileKey, width, height);
      if (equip) {
        const item: CanvasItem = {
          id, type: equip, position: { x, y }, size: { width, height }, rotation,
          label: String(cfg.FileKey ?? ''),
        };
        // The graphic's driver tag (its run signal / MultiState source) → the status slot so the
        // equipment shows running state live once resolved.
        const driver = firstBinding(sym);
        if (driver) { item.bindings = { status: driver }; bindingsTotal++; }
        items.push(item);
        return;
      }
      placeholder(id, name, piType,
        'External SVG symbol (DirectoryKey/FileKey) — no local equivalent; rebuild from the AMS catalog',
        x, y, width, height, rotation, `${cfg.DirectoryKey ?? ''}/${cfg.FileKey ?? ''}`.replace(/^\/|\/$/g, ''));
      return;
    }

    // DataShape (stable across versions) wins over SymbolType (drifts) when present.
    const dataShape = String(cfg.DataShape ?? '').toLowerCase();
    const mapped = DATASHAPE_MAP[dataShape] ?? TYPE_MAP[piType];
    if (!mapped || !RENDERABLE_MAPPED_TYPES.has(mapped)) {
      placeholder(id, name, piType,
        mapped ? `Mapped type '${mapped}' has no renderer` : 'Unknown PI Vision symbol type',
        x, y, width, height, rotation);
      return;
    }

    const item: CanvasItem = {
      id, type: mapped, position: { x, y }, size: { width, height }, rotation,
      style: {
        fill: convertColor(cfg.Fill),
        stroke: convertColor(cfg.Stroke),
        strokeWidth: num(cfg.StrokeWidth, 1),
        fontSize: num(cfg.FontSize) || undefined,
      },
    };
    if (mapped === 'shape.label') item.label = String(cfg.StaticText ?? cfg.Text ?? sym.Name ?? '');

    // Bindings. A trend carries a pen per DataSource (E1 parity); everything else takes its first
    // source. TrendChart.pensFromItem turns every binding slot with a path into a pen.
    if (mapped === 'chart.trend') {
      const ds = (sym.DataSources ?? []) as unknown[];
      const b: Record<string, string> = {};
      ds.forEach((raw, i) => { const p = normalizeBinding(raw); if (p) b[i === 0 ? 'value' : `pen${i + 1}`] = p; });
      if (Object.keys(b).length) { item.bindings = b; bindingsTotal++; }
    } else {
      const binding = firstBinding(sym);
      if (binding) { item.bindings = { value: binding }; bindingsTotal++; }
    }

    // Readout formatting from PI Vision Configuration: decimals from FormatType (N0→0, N2→2, …) and
    // unit visibility from ShowUOM, instead of the previous hardcoded decimals:1 / showUnit:true.
    if (mapped === 'obc.readout-unit') {
      const dec = decimalsFromFormat(cfg.FormatType);
      item.formatting = { decimals: dec ?? 1, showUnit: cfg.ShowUOM === true };
    }

    // Navigation (LinkURL) → NavigationLink (Phase D runtime honours this). Absolute https links work
    // as-is; internal PI routes are carried but flagged for repointing to the matching AMS display.
    const nav = navFromLinkUrl(cfg.LinkURL);
    if (nav) { item.navigationLink = nav.link; navImported++; if (!nav.functional) navNeedsRemap++; }

    // PI MultiState dynamics (colour/visibility-by-value) cannot be reconstructed: PI Vision does not
    // export the state definitions (thresholds/colours) in the .pdix — only an opaque MSSymbolsIds
    // reference. Counted so the report is honest; re-author in the designer.
    if (hasMultiState(sym)) multiStateDropped++;

    items.push(item);
  });

  if (bindingsTotal) notes.push(`${bindingsTotal} tag binding(s) imported and normalized to UNS paths; they resolve to live data once the referenced assets exist in the Asset Model (or an alias mapping is added).`);
  if (groups) notes.push(`${groups} group container(s) skipped — their children import individually.`);
  if (multiStateDropped) notes.push(`${multiStateDropped} symbol(s) had PI MultiState dynamics (colour/visibility-by-value) that PI Vision does not export in the .pdix — re-author them in the designer.`);
  if (navImported) notes.push(
    `${navImported} navigation link(s) imported` +
    (navNeedsRemap ? ` — ${navNeedsRemap} point to internal PI Vision displays and need repointing to the matching AMS display; the rest open as external links.` : ' as external links.'));

  // NOTE: there used to be a `demoLiveTag` option here that rebound the first value symbol of the
  // imported display to a hardcoded UNS tag and appended "(live)" to its label. It existed to prove a
  // Phase-I gate ("an imported binding resolves to live data") and the import page passed it on every
  // real import — silently corrupting one symbol of every customer display that came through. An import
  // must reproduce the source faithfully; bind tags in the designer afterwards. Removed deliberately.

  const report: ImportReport = {
    source: 'pdix',
    productVersion: display.ProductVersion ? String(display.ProductVersion) : undefined,
    total: symbols.length,
    rendered: items.length - unmapped.length,
    placeholders: unmapped.length,
    bindingsTotal,
    bindingsUnresolved: bindingsTotal,   // no UNS resolver yet — every binding is unresolved (P1)
    multiStateDropped,
    navImported,
    navNeedsRemap,
    byType: stats,
    unmapped,
    notes,
  };

  // One-line summary so a drop is never zero-trace, even headless.
   
  console.warn(
    `[pdixImport] ${report.total} symbols → ${report.rendered} rendered, ${report.placeholders} placeholders, ` +
    `${report.bindingsUnresolved}/${report.bindingsTotal} bindings unresolved` +
    (notes.length ? ` · ${notes.length} note(s)` : ''),
  );

  return {
    name: String(display.Name ?? 'Imported PI Vision Display'),
    items,
    settings: {
      canvasWidth: Math.ceil(maxX + 40) || 1920,
      canvasHeight: Math.ceil(maxY + 40) || 1080,
      backgroundColor: 'var(--ams-canvas-bg)',
      gridSize: 10, showGrid: true,
      importReport: report,
    },
    unmapped, stats, report,
  };
}
