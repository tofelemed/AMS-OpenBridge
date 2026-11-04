// Shared colour vocabulary for the CPA source inventory. Regexes only: no file IO.
export const HEX = /(?<![\w#&/=-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
export const RGB = /\brgba?\(/gi;
export const HSL = /\bhsla?\(/gi;
export const OK = /\b(?:oklch|oklab|lch|lab|hwb|color)\(/gi;
export const MIX = /\bcolor-mix\(/gi;
export const VAR = /var\(\s*(--[\w-]+)/g;

// CSS named colours that really appear as literals. transparent, currentColor, inherit are keywords, not palette values.
export const NAMED = /(?<![\w-])(white|black|red|green|blue|yellow|orange|purple|grey|gray|silver|navy|teal|cyan|magenta|lime|pink|gold|crimson|tomato|maroon|olive)(?![\w-])/gi;

// Declarations that carry colour. Layout longhands such as border-radius are excluded on purpose.
export const CSS_COLOUR_PROP = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)|border-(top|right|bottom|left)-color|border-color|border-block(-start|-end)?|border-inline(-start|-end)?|outline|outline-color|fill|stroke|stop-color|box-shadow|text-shadow|caret-color|accent-color|text-decoration|text-decoration-color|column-rule|column-rule-color|scrollbar-color|-webkit-text-fill-color)$/i;
export const TS_COLOUR_KEY = /^(color|textColor|background|backgroundColor|border|borderColor|borderTop|borderRight|borderBottom|borderLeft|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|borderBlock|borderInline|outline|outlineColor|fill|stroke|stopColor|boxShadow|shadowColor|textShadow|caretColor|accentColor|textDecorationColor|areaColor|lineColor)$/;

export const count = (re, s) => (s.match(re) ?? []).length;

/** All literal colours in a value string, in order. Named colours count only when asked. */
export function literalsIn(value, { named = false } = {}) {
  const hits = [];
  for (const re of [HEX, RGB, HSL, OK]) {
    for (const m of value.matchAll(re)) hits.push(m[0].toLowerCase());
  }
  if (named) for (const m of value.matchAll(NAMED)) hits.push(m[0].toLowerCase());
  return hits;
}

/** Removes var(--x, fallback) fallbacks. Returns [value without fallbacks, literal colours found in fallbacks]. */
export function splitVarFallbacks(value) {
  const fallbacks = [];
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (!value.startsWith('var(', i)) { out += value[i]; continue; }
    let depth = 0; let j = i; let comma = -1;
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++;
      else if (value[j] === ')') { depth--; if (depth === 0) break; }
      else if (value[j] === ',' && depth === 1 && comma < 0) comma = j;
    }
    if (comma > 0) {
      fallbacks.push(...literalsIn(value.slice(comma + 1, j)));
      out += value.slice(i, comma) + ')';
    } else out += value.slice(i, j + 1);
    i = j;
  }
  return [out, fallbacks];
}

/** literal | mixed | token | keyword for one declaration value. */
export function classifyValue(value, { named = true } = {}) {
  const [core, fallbacks] = splitVarFallbacks(value);
  const lits = literalsIn(core, { named });
  const tokens = [...core.matchAll(VAR)].map(m => m[1]);
  const mix = count(MIX, core) > 0;
  let kind = 'keyword';
  if (lits.length && tokens.length) kind = 'mixed';
  else if (lits.length) kind = 'literal';
  else if (tokens.length || mix) kind = 'token';
  return { kind, lits, tokens, fallbacks, mix };
}
