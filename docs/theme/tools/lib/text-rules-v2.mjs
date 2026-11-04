// PRM-003 Part E classifier: the first analysis's four classes plus Internal (implementation detail, CD17).
// CPA-UI-DEC-001 R2 was not on disk, so these Internal patterns were derived from the crawled text.
// Units, data-state labels, coverage, time zone, source and errors are never Remove (NEVER_REMOVE, checked by the audit).
import { classify, NEVER_REMOVE } from './text-rules.mjs';

export { NEVER_REMOVE };
const T = 'Translate'; const C = 'Collapse into Technical details'; const R = 'Remove from operator pages';

const INTERNAL = [
  [/\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/, T, 'Raw enum shown to the user'],
  [/\b(?:root\.[a-z0-9_]+\.|traverse\.[a-z]+\.|[a-z]+\.[a-z]+\.[a-z]+\.v\d)/i, C, 'Historian path or topic name'],
  [/\bjar [0-9a-f]{6,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/, C, 'Build hash or internal id'],
  [/CplmGateFusionEngine|\(Flink\)|Flink|Kafka|metrics proxy|supervisor|Watermark|checkpoint/i, C, 'Pipeline term'],
  [/factory layer|class pack|worker\(s\)|workers on one|\bbundle\b/i, T, 'Configuration engine term'],
  [/\bfused\b|fusion tier|Evidence fusion|method run|\bA8\b|engine trace|raw codes/i, T, 'Engine term'],
  [/\bargmax\b|additive waterfall|LTTB/i, C, 'Algorithm note'],
  [/docs\/[\w./-]+\.md/, R, 'Repository file path'],
];

/** CD18: name first. A block led by a bare gate code needs the gate name in front of it. */
const GATE_FIRST = /^G\d{1,2}r?\b(?!\s*[·:-]?\s*[A-Z][a-z])/;

const ROUTE_AUDIENCE = [
  [/^(overview|performance|events|explorer|trend)/, ['Operator', 'Engineer']],
  [/^(investigation)/, ['Engineer', 'Reliability']],
  [/^(kpi)/, ['Operator', 'Engineer', 'Reliability']],
  [/^(historical|evidence|replay|windows|calculations|response)/, ['Engineer']],
  [/^(registry|config|pipeline|governance|admin)/, ['Admin']],
];

export function audienceFor(slug, text, cls) {
  const base = ROUTE_AUDIENCE.find(([re]) => re.test(slug))?.[1] ?? ['Engineer'];
  const set = new Set(base);
  if (/valve|actuator|stiction|NE ?107|transmitter|instrument/i.test(text)) set.add('Reliability');
  if (cls === 'Internal') { set.delete('Operator'); set.delete('Reliability'); set.add('Engineer'); }
  return [...set];
}

export function classifyV2(block, slug = '') {
  for (const [re, disposition, why] of INTERNAL) {
    if (re.test(block.text)) {
      // Window labels and state sentences stay on the page in plain words; they are never collapsed away.
      const d = NEVER_REMOVE.test(block.text) || /window|sample|verdict/i.test(block.text) ? T : disposition;
      return { cls: 'Internal', disposition: d, to: d, why };
    }
  }
  if (GATE_FIRST.test(block.text) && block.kind !== 'data') {
    return { cls: 'Shorten', to: 'Gate name first, code in brackets', why: 'CD18 gate names: name first' };
  }
  return classify(block, slug);
}

export function savedV2(block, c, countWords) {
  // Translating keeps the sentence, so it saves nothing. Only collapsed or removed text leaves the page.
  if (c.cls === 'Internal') return c.disposition === T ? 0 : block.words * block.n;
  if (c.cls === 'Remove' || c.cls === 'Move to help') return block.words * block.n;
  if (c.cls === 'Shorten') return Math.max(0, block.words - countWords(c.to ?? '')) * block.n;
  return 0;
}
