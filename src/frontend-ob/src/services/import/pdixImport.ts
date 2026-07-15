// Phase I — AVEVA PI Vision .pdix importer.
// Lifted + adapted from the legacy ScreeN-Import app's ScreenImportService.ts: same parse approach
// (JSZip → display_json → symbol scene-graph) but emitting THIS repo's CanvasItem shape, with
// mapPdixType re-pointed to our OpenBridge symbol ids and the previously-dropped fields (rules,
// multiState, nav, secondary bindings) fillable. Symbols that don't map cleanly are surfaced in
// `unmapped` (never silently dropped).
import JSZip from 'jszip';
import type { CanvasItem } from '../../components/Designer/types';

export interface ImportedDisplay {
  name: string;
  items: CanvasItem[];
  settings: { canvasWidth: number; canvasHeight: number; backgroundColor: string; gridSize: number; showGrid: boolean };
  unmapped: Array<{ id: string; name: string; piType: string; reason: string; ref?: string }>;
  stats: Record<string, number>;
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
};

// Every type TYPE_MAP is allowed to emit MUST have a renderer (SymbolRenderer/CustomSymbols).
// A mapping to anything outside this set is surfaced in `unmapped` rather than rendering a
// silent "❓" — the importer is the migration front door, so failures must be visible.
const RENDERABLE_MAPPED_TYPES = new Set<string>([
  'shape.rect', 'shape.line', 'shape.circle', 'shape.polygon', 'shape.label',
  'obc.readout-unit', 'chart.trend', 'ind.gauge',
]);

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

/** pi:\\SRV?guid\PATH#Value?id  /  af:\\SRV\A\B?guid|ATTR?id  → a readable contextual path. */
function normalizeBinding(raw: unknown): string | undefined {
  if (!raw) return undefined;
  let s = String(raw);
  s = s.replace(/^(pi|af):\\\\/i, '');
  s = s.replace(/\?[0-9a-f-]{8,}/gi, '');   // strip GUID query segments
  s = s.split('#')[0];                       // drop #Value etc.
  s = s.replace(/\|/g, '/').replace(/\\/g, '/');
  return s || undefined;
}

function firstBinding(sym: Record<string, unknown>): string | undefined {
  const ds = (sym.DataSources ?? sym.MSDataSources ?? []) as unknown[];
  return ds.length ? normalizeBinding(ds[0]) : undefined;
}

export async function importPdix(file: File | Blob): Promise<ImportedDisplay> {
  const zip = await JSZip.loadAsync(file);
  const displayEntry = zip.file('display_json') ?? zip.file(/display_json/i)[0];
  if (!displayEntry) throw new Error('Not a .pdix: no display_json entry');
  const display = JSON.parse(await displayEntry.async('string'));
  const symbols: Array<Record<string, unknown>> = display.Symbols ?? display.symbols ?? [];

  const items: CanvasItem[] = [];
  const unmapped: ImportedDisplay['unmapped'] = [];
  const stats: Record<string, number> = {};
  let maxX = 0, maxY = 0;

  symbols.forEach((sym, idx) => {
    const piType = String(sym.SymbolType ?? sym.Type ?? '?').toLowerCase();
    stats[piType] = (stats[piType] ?? 0) + 1;
    const cfg = (sym.Configuration ?? {}) as Record<string, unknown>;
    const id = `pdix-${idx}`;
    const x = num(cfg.Left), y = num(cfg.Top);
    const width = num(cfg.Width, piType === 'value' || piType === 'statictext' ? 90 : 40);
    const height = num(cfg.Height, 24);
    maxX = Math.max(maxX, x + width); maxY = Math.max(maxY, y + height);

    // Not-cleanly-mappable → surface for manual mapping, but still place a labelled placeholder.
    if (piType === 'graphic') {
      unmapped.push({ id, name: String(sym.Name ?? id), piType, reason: 'External SVG symbol (DirectoryKey/FileKey) — no local registry match', ref: `${cfg.DirectoryKey ?? ''}/${cfg.FileKey ?? ''}` });
      items.push({ id, type: 'shape.rect', position: { x, y }, size: { width, height }, rotation: num(cfg.Rotation),
        label: `⚠ ${cfg.FileKey ?? 'graphic'}`,
        style: { fill: 'none', stroke: 'var(--ams-warn)', strokeWidth: 1 } });
      return;
    }
    if (piType === 'group') { stats.group = stats.group; return; } // structural container, not a drawable

    const mapped = TYPE_MAP[piType];
    if (!mapped || !RENDERABLE_MAPPED_TYPES.has(mapped)) {
      unmapped.push({
        id, name: String(sym.Name ?? id), piType,
        reason: mapped ? `Mapped type '${mapped}' has no renderer` : 'Unknown PI Vision symbol type',
      });
      items.push({ id, type: 'shape.rect', position: { x, y }, size: { width, height }, label: `⚠ ${piType}`,
        style: { fill: 'none', stroke: 'var(--ams-warn)', strokeWidth: 1 } });
      return;
    }

    const item: CanvasItem = {
      id, type: mapped, position: { x, y }, size: { width, height }, rotation: num(cfg.Rotation),
      style: {
        fill: convertColor(cfg.Fill),
        stroke: convertColor(cfg.Stroke),
        strokeWidth: num(cfg.StrokeWidth, 1),
        fontSize: num(cfg.FontSize) || undefined,
      },
    };
    if (mapped === 'shape.label') item.label = String(cfg.StaticText ?? cfg.Text ?? sym.Name ?? '');
    const binding = firstBinding(sym);
    if (binding) item.bindings = { value: binding };
    if (mapped === 'obc.readout-unit') item.formatting = { decimals: 1, showUnit: true };

    items.push(item);
  });

  // NOTE: there used to be a `demoLiveTag` option here that rebound the first value symbol of the
  // imported display to a hardcoded UNS tag and appended "(live)" to its label. It existed to prove a
  // Phase-I gate ("an imported binding resolves to live data") and the import page passed it on every
  // real import — silently corrupting one symbol of every customer display that came through. An import
  // must reproduce the source faithfully; bind tags in the designer afterwards. Removed deliberately.

  return {
    name: String(display.Name ?? 'Imported PI Vision Display'),
    items,
    settings: {
      canvasWidth: Math.ceil(maxX + 40) || 1920,
      canvasHeight: Math.ceil(maxY + 40) || 1080,
      backgroundColor: 'var(--ams-canvas-bg)',
      gridSize: 10, showGrid: true,
    },
    unmapped, stats,
  };
}
