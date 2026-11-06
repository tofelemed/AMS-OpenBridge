/**
 * The 17 CPA pages under six headings (design 2026-11-06, section 3), on the addresses the plant uses.
 * Plain data: the sidebar, the palette, links and the tests all read this one list.
 */
import type { KindParam } from './tabKind';

/** Who may open Administration today: the /admin/* route guard. */
export const ADMIN_PERMISSIONS: readonly string[] = ['admin.users.edit', 'admin.audit.view', 'rbac.manage', 'ingestion.view', 'ingestion.manage'];

export type NavGroup = 'Find problems' | 'Check a loop' | 'Understand the cause' | 'Set up' | 'Engineering' | 'System';

export type DestinationId =
  | 'overview' | 'performance' | 'events' | 'explorer' | 'historical' | 'investigation' | 'workbench' | 'replay' | 'windows'
  | 'calculations' | 'response' | 'registry' | 'config' | 'trend' | 'pipeline' | 'administration' | 'governance';

export interface Destination {
  id: DestinationId;
  label: string;
  group: NavGroup;
  path: string;
  /** What the page answers. The page itself carries no purpose sentence (SPEC §3). */
  purpose: string;
  /** Shown in the sidebar to holders of any of these. Equals the page's route guard. */
  showTo: readonly string[];
  /** Older routes that belong to this page, for the selected state. */
  covers: readonly string[];
  /** Which pages the selected loop and the 12h / 24h choice travel to. */
  carriesLoop: boolean;
  carriesWindow: boolean;
  /** Where this page reads the 12h / 24h choice. Without one, the choice travels as `kind`. */
  kindParam?: KindParam;
  /** The page reads `window` as an evaluated END, so a kind must not reach it there. */
  windowIsEnd?: boolean;
}

const READ = ['analytics.view'] as const;

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'overview', label: 'Overview', group: 'Find problems', path: '/cpm',
    purpose: 'Which loops need review now, why, and how much of the fleet is assessed',
    showTo: READ, covers: ['/cpm/kpi'], carriesLoop: false, carriesWindow: true, kindParam: 'window',
  },
  {
    id: 'performance', label: 'Performance', group: 'Find problems', path: '/cpm/performance',
    purpose: 'Compare loops gate by gate and see which checks hold the fleet back',
    showTo: READ, covers: [], carriesLoop: false, carriesWindow: true, kindParam: 'window',
  },
  {
    id: 'events', label: 'Loop Events', group: 'Find problems', path: '/cpm/events',
    purpose: 'Review, acknowledge and shelve diagnosis episodes',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'window',
  },
  {
    id: 'explorer', label: 'Loop Explorer', group: 'Check a loop', path: '/cpm/explorer',
    purpose: 'One loop now: signals, KPIs and gates',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'window',
  },
  {
    id: 'historical', label: 'Historical', group: 'Check a loop', path: '/cpm/historical',
    purpose: 'One loop over time: signals, mode and evaluated windows',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'kind', windowIsEnd: true,
  },
  {
    id: 'investigation', label: 'Investigation', group: 'Understand the cause', path: '/cpm/investigation',
    purpose: 'Why this result, what is still unconfirmed, and what to check next',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'profile', windowIsEnd: true,
  },
  {
    id: 'workbench', label: 'Evidence Workbench', group: 'Understand the cause', path: '/cpm/evidence',
    purpose: 'One evaluated run, gate by gate',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'kind',
  },
  {
    id: 'replay', label: 'Evidence Replay', group: 'Understand the cause', path: '/cpm/replay',
    purpose: 'The raw signals behind one evaluated window',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'kind', windowIsEnd: true,
  },
  {
    id: 'windows', label: 'Window Inspector', group: 'Understand the cause', path: '/cpm/windows',
    purpose: 'Every window the engine emitted, with its sample count',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, windowIsEnd: true,
  },
  {
    id: 'calculations', label: 'Calculations', group: 'Understand the cause', path: '/cpm/calculations',
    purpose: 'Every stored value for one evaluated window',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true, kindParam: 'kind', windowIsEnd: true,
  },
  {
    id: 'response', label: 'System Response', group: 'Understand the cause', path: '/cpm/response',
    purpose: 'Response events and the loop model built from them',
    showTo: READ, covers: [], carriesLoop: true, carriesWindow: true,
  },
  {
    id: 'registry', label: 'Loop Registry', group: 'Set up', path: '/cpm/registry',
    purpose: 'Every registered loop and its configuration',
    showTo: READ, covers: [], carriesLoop: false, carriesWindow: false,
  },
  {
    id: 'config', label: 'Gate Configuration', group: 'Set up', path: '/cpm/config',
    purpose: 'What each loop runs under, and the bundles that change it',
    showTo: ['cpm.config.read'], covers: [], carriesLoop: true, carriesWindow: false,
  },
  {
    id: 'trend', label: 'Trend', group: 'Engineering', path: '/trend',
    purpose: 'Any tags on one chart',
    showTo: ['historian.view'], covers: [], carriesLoop: false, carriesWindow: false,
  },
  {
    id: 'pipeline', label: 'Pipeline Health', group: 'System', path: '/cpm/pipeline',
    purpose: 'Whether the analysis engine is running',
    showTo: ['system.manage'], covers: [], carriesLoop: false, carriesWindow: false,
  },
  {
    id: 'administration', label: 'Administration', group: 'System', path: '/admin',
    purpose: 'Users, roles, data sources, plant model, tag aliases and settings',
    showTo: ADMIN_PERMISSIONS, covers: [], carriesLoop: false, carriesWindow: false,
  },
  {
    id: 'governance', label: 'Governance', group: 'System', path: '/cpm/governance',
    purpose: 'Who changed what, and the audit trail',
    showTo: ['system.manage', ...ADMIN_PERMISSIONS], covers: [], carriesLoop: false, carriesWindow: false,
  },
];

/** The page that owns a path, or undefined for a path outside CPA. */
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
