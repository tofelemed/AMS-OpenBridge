// Phase 8 (O8/O9) — simple glob matching for tag/asset/display search.
//   *  matches any run of characters
//   ?  matches exactly one character
// Matching is case-insensitive and applied across several fields (name / path / description). A term
// with no wildcard falls back to a plain case-insensitive substring match, so existing behaviour is
// unchanged for ordinary queries.

export function hasWildcard(term: string): boolean {
  return term.includes('*') || term.includes('?');
}

export function globToRegExp(term: string): RegExp {
  // Escape every regex metachar EXCEPT * and ?, then translate those to .* and .
  const escaped = term.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(pattern, 'i');
}

/** True if any field matches the term (glob when wildcarded, else substring). */
export function matchesTerm(term: string, ...fields: Array<string | undefined | null>): boolean {
  const t = term.trim();
  if (!t) return true;
  if (hasWildcard(t)) {
    const re = globToRegExp(t);
    return fields.some(f => f != null && re.test(f));
  }
  const lc = t.toLowerCase();
  return fields.some(f => f != null && f.toLowerCase().includes(lc));
}

/** The longest literal run in a wildcard term, for a server-side substring pre-filter. */
export function literalPart(term: string): string {
  return term.split(/[*?]/).reduce((a, b) => (b.length > a.length ? b : a), '');
}
