// Phase 7 (T1–T9/T11) — a custom-symbol framework. Until now CustomSymbols.tsx was a hardcoded switch:
// there was no way to add a symbol without editing source. This registry lets an engineer define a
// symbol as an SVG template with named binding slots, register it, and place it like any built-in.
//
// A custom symbol is pure CONFIG (name, category, SVG template, slot list) — never process values — so
// it satisfies the config-only invariant. Definitions persist client-side here (localStorage); a
// server-side registry (so a definition is shared across users) is the next increment and would reuse
// the display-service media/upload backend. Rendering is DOM/SVG (no Konva), tokens only.

export interface CustomSlot {
  /** Slot name used in the template as {{name}} and as the binding key on a placed item. */
  name: string;
  /** 'value' binds a live scalar; 'text' a string; 'color' resolves a fill from an alarm/state. */
  kind: 'value' | 'text' | 'color';
  label?: string;
}

export interface CustomSymbolDef {
  /** Stable id; the placed item's `type` is `custom:<id>`. */
  id: string;
  name: string;
  category: string;
  /**
   * SVG markup for the symbol. Placeholders:
   *   {{slotName}}        → live value/text for that slot (formatted)
   *   {{slotName:fixedN}} → numeric value to N decimals
   *   {{style.fill}} etc. → the item's style.* value
   * The SVG should size to 100%/100% of its viewport (use a viewBox).
   */
  svgTemplate: string;
  slots: CustomSlot[];
  /** Default footprint when dropped on the canvas. */
  defaultSize?: { width: number; height: number };
  /** T11 — may be repeated inside a collection cell. */
  supportsCollections?: boolean;
}

const STORAGE_KEY = 'ams.customSymbols.v1';
const listeners = new Set<() => void>();
let cache: CustomSymbolDef[] | null = null;

function load(): CustomSymbolDef[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CustomSymbolDef[]) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function persist(defs: CustomSymbolDef[]): void {
  cache = defs;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(defs)); } catch { /* quota / disabled */ }
  listeners.forEach(l => l());
}

export function listCustomSymbols(): CustomSymbolDef[] {
  return load().slice();
}

export function getCustomSymbol(id: string): CustomSymbolDef | undefined {
  const key = id.startsWith('custom:') ? id.slice('custom:'.length) : id;
  return load().find(d => d.id === key);
}

export function isCustomSymbolType(type: string): boolean {
  return type.startsWith('custom:') && !!getCustomSymbol(type);
}

/** Register or replace a definition (by id). Returns the placed-item type string `custom:<id>`. */
export function registerCustomSymbol(def: CustomSymbolDef): string {
  // Sanitise at the registry boundary, not just in the editor UI — every write path (import, a tampered
  // localStorage blob, a future server sync) passes through here, so this is the real gate.
  if (!isSafeSvg(def.svgTemplate)) throw new Error('Custom symbol SVG contains disallowed active content');
  const defs = load().filter(d => d.id !== def.id);
  defs.push(def);
  persist(defs);
  return `custom:${def.id}`;
}

export function removeCustomSymbol(id: string): void {
  persist(load().filter(d => d.id !== id));
}

/** Subscribe to registry changes (palette/editor re-render on register/remove). */
export function subscribeCustomSymbols(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Render a definition's SVG template, substituting {{slot}} / {{slot:fixedN}} / {{style.*}} placeholders.
 * Missing values render as '--'. Returns a string safe to inject (the caller sanitises on registration).
 */
/** Escape a substituted value so a live string reading can never inject markup. */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderTemplate(
  def: CustomSymbolDef,
  values: Record<string, string | number | undefined>,
  style?: Record<string, unknown>,
): string {
  return def.svgTemplate.replace(/\{\{\s*([\w.]+)(?::fixed(\d+))?\s*\}\}/g, (_m, name: string, dec?: string) => {
    if (name.startsWith('style.')) {
      const v = style?.[name.slice('style.'.length)];
      return v == null ? '' : escapeXml(String(v));
    }
    const v = values[name];
    if (v == null) return '--';
    if (dec != null && typeof v === 'number') return escapeXml(v.toFixed(Number(dec)));
    // Live values are injected into markup that hits dangerouslySetInnerHTML — always escape.
    return escapeXml(String(v));
  });
}

/**
 * Reject active content in a user-supplied SVG template. Denylist, but broadened well past the media
 * sanitiser: ANY on*-handler attribute, script/iframe/foreignObject elements, and javascript: URLs.
 */
export function isSafeSvg(svg: string): boolean {
  const s = svg.toLowerCase();
  if (/\son[a-z]+\s*=/.test(s)) return false;           // onclick, onmouseover, onbegin, …
  if (/javascript:/.test(s)) return false;
  if (/<\s*(script|iframe|foreignobject|object|embed)\b/.test(s)) return false;
  return true;
}
