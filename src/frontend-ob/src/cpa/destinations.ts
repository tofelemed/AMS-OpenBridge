/**
 * The seven CPA destinations (SPEC §2.1, DEC-002 RD1) and the suite module order (RD4).
 * Plain data: the sidebar, the palette, links and the tests all read this one list.
 */
export type DestinationId = 'overview' | 'performance' | 'episodes' | 'loop' | 'evidence' | 'setup' | 'system';

export interface Destination {
  id: DestinationId;
  label: string;
  path: string;
  /** What the page answers. The page itself carries no purpose sentence (SPEC §3). */
  purpose: string;
  /** Shown in the sidebar to holders of any of these (RD4). Route guards are separate. */
  showTo: readonly string[];
  /** Older routes that belong to this destination, for the selected state. */
  covers: readonly string[];
  /** SPEC §2.2: which pages the selected loop and the window kind travel to. */
  carriesLoop: boolean;
  carriesWindow: boolean;
}

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'overview', label: 'Overview', path: '/cpm',
    purpose: 'Which loops need review now, why, and how much of the fleet is assessed',
    showTo: ['analytics.view'], covers: ['/cpm/kpi'], carriesLoop: false, carriesWindow: true,
  },
  {
    id: 'performance', label: 'Performance', path: '/cpm/performance',
    purpose: 'Compare loops gate by gate and see which checks hold the fleet back',
    showTo: ['analytics.view'], covers: [], carriesLoop: false, carriesWindow: true,
  },
  {
    id: 'episodes', label: 'Episodes', path: '/cpm/events',
    purpose: 'Review, acknowledge and shelve diagnosis episodes',
    showTo: ['analytics.view'], covers: [], carriesLoop: true, carriesWindow: true,
  },
  {
    id: 'loop', label: 'Loop', path: '/cpm/loop',
    purpose: 'One loop: state, aligned trend, performance, diagnosis, model and signals',
    showTo: ['analytics.view'],
    covers: ['/cpm/explorer', '/cpm/historical', '/cpm/investigation', '/cpm/response'],
    carriesLoop: true, carriesWindow: true,
  },
  {
    id: 'evidence', label: 'Evidence', path: '/cpm/evidence',
    purpose: 'One evaluated window: gates, replay, windows and calculations',
    showTo: ['analytics.view'], covers: ['/cpm/replay', '/cpm/windows', '/cpm/calculations'],
    carriesLoop: true, carriesWindow: true,
  },
  {
    id: 'setup', label: 'Setup', path: '/cpm/setup',
    purpose: 'Loop registry and gate configuration',
    showTo: ['cpm.manage', 'cpm.config.read'], covers: ['/cpm/registry', '/cpm/config'],
    carriesLoop: true, carriesWindow: false,
  },
  {
    id: 'system', label: 'System', path: '/cpm/system',
    purpose: 'Pipeline health and governance',
    showTo: ['system.manage'], covers: ['/cpm/pipeline', '/cpm/governance', '/admin'],
    carriesLoop: false, carriesWindow: false,
  },
];

/** The destination that owns a path, or undefined (Tag trend is a tool, not a destination). */
export function destinationFor(pathname: string): Destination | undefined {
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  return DESTINATIONS.find(d => d.path !== '/cpm' && under(d.path))
    ?? DESTINATIONS.find(d => d.covers.some(under))
    ?? (pathname === '/cpm' ? DESTINATIONS[0] : undefined);
}

export const visibleDestinations = (hasPermission: (p: string) => boolean): Destination[] =>
  DESTINATIONS.filter(d => d.showTo.some(hasPermission));

/** Suite order (guide p.6). A module not deployed here is hidden, not disabled (RD4). */
export const SUITE_MODULES: ReadonlyArray<{ id: string; label: string; deployed: boolean }> = [
  { id: 'overview', label: 'Overview', deployed: false },
  { id: 'truss', label: 'Truss', deployed: false },
  { id: 'cpa', label: 'CPA', deployed: true },
  { id: 'instrumental', label: 'Instrumental', deployed: false },
  { id: 'plc', label: 'PLC', deployed: false },
  { id: 'downtime', label: 'Downtime', deployed: false },
  { id: 'rca', label: 'RCA', deployed: false },
];
