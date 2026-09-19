/** URL-owned CPA context. A window is an evaluated end; a kind is a duration. */
export function windowKind(params: URLSearchParams, fallback = '24h'): string {
  const legacy = params.get('window');
  return params.get('kind') || params.get('profile') ||
    (legacy && /^\d+(?:ms|s|m|h|d)$/.test(legacy) ? legacy : fallback);
}

export function windowEnd(params: URLSearchParams): string | undefined {
  const value = params.get('window');
  return value && !/^\d+(?:ms|s|m|h|d)$/.test(value) ? value : undefined;
}

const CONTEXT = ['loop', 'gate', 'methodRun', 'from', 'to', 'site', 'area', 'unit'] as const;
type Changes = Record<string, string | null | undefined>;

export function cpaHref(path: string, source: URLSearchParams, changes: Changes = {}): string {
  const target = new URLSearchParams();
  for (const key of CONTEXT) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
  if (source.has('kind') || source.has('profile') || source.has('window')) target.set('kind', windowKind(source));
  const end = windowEnd(source);
  if (end) target.set('window', end);
  if (changes.loop != null && changes.loop !== source.get('loop')) {
    for (const key of ['window', 'gate', 'methodRun', 'from', 'to']) target.delete(key);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value == null || value === '') target.delete(key); else target.set(key, value);
  }
  // Event IDs and mode are route-specific: never transfer them through the sidebar.
  if (path === '/cpm/evidence' && target.has('methodRun') && !target.has('mode')) target.set('mode', 'FIXED');
  if (path === '/cpm/response' && target.get('gate') !== 'G12') target.delete('methodRun');
  const search = target.toString();
  return `${path}${search ? `?${search}` : ''}`;
}

export function selectLoop(params: URLSearchParams, loop: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (next.get('loop') !== loop) {
    for (const key of ['window', 'gate', 'methodRun', 'event', 'before', 'from', 'to']) next.delete(key);
  }
  if (loop) next.set('loop', loop); else next.delete('loop');
  return next;
}

/** Explicit selections never fall back to a different evaluated window. */
export function selectedWindow<T extends { windowEnd: string | null }>(rows: T[], end?: string | null): T | undefined {
  return end ? rows.find(row => row.windowEnd != null && Date.parse(row.windowEnd) === Date.parse(end)) : rows[0];
}
