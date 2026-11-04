// Crawl entry points: every route, URL-driven view and representative-loop variant.
// deep = activate its controls. Without deep the entry is captured and measured only.
export const REP = {
  primary: 'FIC10302', // live historian, DETECTED finding on 2026-11-04, VP mapped
  confirmed: 'FIC10301', // CONFIRMED_OSCILLATION, live historian
  suspected: 'G13_LOOP_A', // SUSPECTED_FINAL_ELEMENT_NONLINEARITY, peer links
  live: 'FIC10401', // live historian, trend tags known
  notEvaluable: 'DEMO-FIC-001', // never evaluated
  stale: 'FIC00701', // stale since October
  healthy: null, // none in the lab
  cascade: null, // none in the registry
};
const q = l => encodeURIComponent(l);
const P = q(REP.primary);
const T = 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5/fic10401';

const route = (slug, url, page, extra = {}) => ({ slug, url, page, level: 'route', deep: true, ...extra });
const view = (slug, url, page, extra = {}) => ({ slug, url, page, level: 'view', deep: false, ...extra });

export const ENTRIES = [
  route('overview', '/cpm', 'Overview', { key: true }),
  view('overview-loop', `/cpm?loop=${P}`, 'Overview: loop selected', { deep: true, key: true }),
  route('performance', '/cpm/performance', 'Performance', { key: true }),
  view('performance-matrix', '/cpm/performance?view=matrix', 'Performance: matrix', { deep: true }),
  route('events', '/cpm/events', 'Loop Events'),
  route('explorer', `/cpm/explorer?loop=${P}`, 'Explorer: Summary', { key: true }),
  view('explorer-signals', `/cpm/explorer?loop=${P}&tab=Signals`, 'Explorer: Signals', { deep: true, key: true }),
  view('explorer-calculations', `/cpm/explorer?loop=${P}&tab=Calculations`, 'Explorer: Calculations', { deep: true, key: true }),
  view('explorer-relationships', `/cpm/explorer?loop=${q(REP.suspected)}&tab=Relationships`, 'Explorer: Relationships', { deep: true, key: true }),
  view('explorer-history', `/cpm/explorer?loop=${P}&tab=History`, 'Explorer: History', { deep: true, key: true }),
  route('historical', `/cpm/historical?loop=${P}`, 'Historical', { key: true }),
  route('investigation', `/cpm/investigation?loop=${P}`, 'Investigation', { key: true }),
  route('evidence', `/cpm/evidence?loop=${P}`, 'Evidence Workbench', { key: true }),
  route('replay', `/cpm/replay?loop=${P}`, 'Evidence Replay'),
  route('windows', `/cpm/windows?loop=${P}`, 'Window Inspector'),
  route('calculations', `/cpm/calculations?loop=${P}`, 'Calculations'),
  route('response', `/cpm/response?loop=${P}`, 'System Response'),
  route('registry', '/cpm/registry', 'Loop Registry'),
  view('registry-loop', `/cpm/registry?loop=${P}`, 'Loop Registry: loop', { deep: true }),
  route('config', '/cpm/config', 'Gate Configuration'),
  view('config-effective', `/cpm/config?loop=${P}&view=effective`, 'Configuration: Effective', { deep: true }),
  view('config-bundles', `/cpm/config?loop=${P}&view=bundles`, 'Configuration: Bundles', { deep: true }),
  route('kpi', '/cpm/kpi?kpi=acceptable', 'KPI drill-down', { hidden: true, key: true }),
  view('kpi-stale', '/cpm/kpi?kpi=stale', 'KPI drill-down: stale'),
  route('pipeline', '/cpm/pipeline', 'Pipeline Health'),
  route('governance', '/cpm/governance', 'Governance'),
  route('trend', `/trend?tags=${encodeURIComponent(`${T}.pv,${T}.sp,${T}.op`)}&range=8h`, 'Trend', { key: true }),
  route('admin-users', '/admin/users', 'Admin: Users'),
  route('admin-roles', '/admin/roles', 'Admin: Roles'),
  route('admin-data-sources', '/admin/data-sources', 'Admin: Data Sources'),
  route('admin-plant-model', '/admin/plant-model', 'Admin: Plant Model'),
  route('admin-aliases', '/admin/aliases', 'Admin: Tag Aliases'),
  route('admin-audit', '/admin/audit', 'Admin: Audit Log'),
  route('admin-system', '/admin/system', 'Admin: System Settings'),
];

// The other representative loops on loop-scoped pages: measured and captured, not crawled again.
const LOOP_PAGES = [['explorer', '/cpm/explorer'], ['historical', '/cpm/historical'], ['investigation', '/cpm/investigation'], ['evidence', '/cpm/evidence'], ['windows', '/cpm/windows'], ['calculations', '/cpm/calculations']];
for (const [role, id] of [['confirmed', REP.confirmed], ['suspected', REP.suspected]]) {
  for (const [slug, base] of LOOP_PAGES) ENTRIES.push(view(`${slug}--${role}`, `${base}?loop=${q(id)}`, `${slug}: ${role} loop ${id}`));
}
ENTRIES.push(view('explorer--stale', `/cpm/explorer?loop=${q(REP.stale)}`, `Explorer: stale loop ${REP.stale}`));
ENTRIES.push(view('explorer--not-evaluable', `/cpm/explorer?loop=${q(REP.notEvaluable)}`, `Explorer: never evaluated ${REP.notEvaluable}`));
