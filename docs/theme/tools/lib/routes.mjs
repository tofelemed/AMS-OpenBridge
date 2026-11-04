// Route inventory for the CPA capture. Source of truth: src/frontend-ob/src/App.tsx, productSlice.ts,
// components/nav/navItems.ts and components/Administration/Administration.tsx.
// `loop` is a real lab loop with fresh gate results. Override with CPA_LOOP when capturing elsewhere.
export const LOOP = process.env.CPA_LOOP ?? 'FIC10401';
const L = encodeURIComponent(LOOP);

// nav: linked from the sidebar. key: also captured at 1366x768 and 1920x1080.
export const ROUTES = [
  { slug: 'overview', url: '/cpm', nav: true, key: true, page: 'Overview' },
  { slug: 'performance', url: '/cpm/performance', nav: true, key: true, page: 'Performance (ranking)' },
  { slug: 'events', url: '/cpm/events', nav: true, page: 'Loop Events' },
  { slug: 'explorer', url: `/cpm/explorer?loop=${L}`, nav: true, key: true, page: 'Loop Explorer: Summary' },
  { slug: 'explorer-signals', url: `/cpm/explorer?loop=${L}&tab=Signals`, nav: false, page: 'Loop Explorer: Signals' },
  { slug: 'explorer-calculations', url: `/cpm/explorer?loop=${L}&tab=Calculations`, nav: false, page: 'Loop Explorer: Calculations' },
  { slug: 'explorer-relationships', url: `/cpm/explorer?loop=${L}&tab=Relationships`, nav: false, page: 'Loop Explorer: Relationships' },
  { slug: 'explorer-history', url: `/cpm/explorer?loop=${L}&tab=History`, nav: false, page: 'Loop Explorer: History' },
  { slug: 'historical', url: `/cpm/historical?loop=${L}`, nav: true, key: true, page: 'Historical' },
  { slug: 'investigation', url: `/cpm/investigation?loop=${L}`, nav: true, page: 'Investigation' },
  { slug: 'evidence', url: `/cpm/evidence?loop=${L}`, nav: true, page: 'Evidence Workbench' },
  { slug: 'replay', url: `/cpm/replay?loop=${L}`, nav: true, page: 'Evidence Replay' },
  { slug: 'windows', url: `/cpm/windows?loop=${L}`, nav: true, page: 'Window Inspector' },
  { slug: 'calculations', url: `/cpm/calculations?loop=${L}`, nav: true, page: 'Calculations' },
  { slug: 'response', url: `/cpm/response?loop=${L}`, nav: true, page: 'System Response' },
  { slug: 'registry', url: '/cpm/registry', nav: true, page: 'Loop Registry' },
  { slug: 'config', url: '/cpm/config', nav: true, page: 'Engineering: overview' },
  { slug: 'config-effective', url: `/cpm/config?loop=${L}&view=effective`, nav: false, page: 'Engineering: Effective' },
  { slug: 'config-bundles', url: `/cpm/config?loop=${L}&view=bundles`, nav: false, page: 'Engineering: Bundles' },
  { slug: 'kpi', url: '/cpm/kpi?kpi=acceptable', nav: false, key: true, hidden: true, page: 'KPI drill-down (report)' },
  { slug: 'trend', url: '/trend', nav: true, page: 'Trend', tagsFor: 'trend' },
  { slug: 'admin-users', url: '/admin/users', nav: true, page: 'Admin: Users' },
  { slug: 'admin-roles', url: '/admin/roles', nav: true, page: 'Admin: Roles' },
  { slug: 'admin-data-sources', url: '/admin/data-sources', nav: true, page: 'Admin: Data Sources' },
  { slug: 'admin-plant-model', url: '/admin/plant-model', nav: true, page: 'Admin: Plant Model' },
  { slug: 'admin-aliases', url: '/admin/aliases', nav: true, page: 'Admin: Tag Aliases' },
  { slug: 'admin-audit', url: '/admin/audit', nav: true, page: 'Admin: Audit Log' },
  { slug: 'admin-system', url: '/admin/system', nav: true, page: 'Admin: System Settings' },
  // Need system.manage. Expected to redirect for an Admin session; recorded as a failure, never forced.
  { slug: 'pipeline', url: '/cpm/pipeline', nav: false, hidden: true, page: 'Pipeline', permission: 'system.manage' },
  { slug: 'governance', url: '/cpm/governance', nav: false, hidden: true, page: 'Governance', permission: 'system.manage' },
];

export const THEMES = (process.env.CPA_THEMES ?? 'day,bright,night').split(',');
export const VIEWPORTS = { reference: [1440, 1024], laptop: [1366, 768], wide: [1920, 1080] };
export const vpName = ([w, h]) => `${w}x${h}`;
