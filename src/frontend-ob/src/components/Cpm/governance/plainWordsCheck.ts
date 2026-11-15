/**
 * CHG-202 (owner, 15 Nov 2026: "do we have extra or backend-type text or IDs there; we have to remove them"): what the
 * Governance page must never show its reader. The Governance tests run it over the rendered text (body text, titles,
 * aria-labels, placeholders); option values and CSV / data keys are not reader text and stay as they are.
 */
const RULES: ReadonlyArray<[name: string, pattern: RegExp]> = [
  ['GUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['hash-like hex run', /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/i],
  ['shortened id', /\b[0-9a-f]{6,}…/i],
  ['id', /\b(user )?ids?\b/i],
  ['Record details', /Record details/i],
  ['service or build name', /audit-service|cplm-api|auth-service|ingestion|display-service|\bFlink\b|CplmGate|\bjar\b|\bcommit\b/i],
  ['internal acronym', /\b(CPM|CPLM|RBAC)\b/],
  ['SCREAMING_CASE code', /\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b/],
  ['snake_case code', /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/],
  ['permission key', /\b[a-z]{2,}\.[a-z_]{2,}(?:\.[a-z_]+)*\b/],
  ['hash or payload talk', /\bhash(es|ed)?\b|re-hashed|\bpayload\b|\bthe server\b|\bserved\b|\bwalk the chain\b/i],
];

/** Each rule the text breaks, with the first offending piece: "GUID: 7c41e0d2-…". Empty when the text is plain. */
export function technicalIn(text: string): string[] {
  return RULES.flatMap(([name, pattern]) => {
    const hit = pattern.exec(text);
    return hit ? [`${name}: ${hit[0]}`] : [];
  });
}

/** Everything a reader sees or hears on the page now: the text, and every title, aria-label and placeholder. */
export function readerText(root: ParentNode = document.body): string {
  const attrs = [...root.querySelectorAll('[title],[aria-label],[placeholder]')]
    .flatMap(el => ['title', 'aria-label', 'placeholder'].map(a => el.getAttribute(a) ?? ''));
  return [(root as Element).textContent ?? '', ...attrs].join('\n');
}
