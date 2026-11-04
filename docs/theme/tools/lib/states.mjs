// Declarative list of the UI states the capture reaches. All of it is local to the browser or a plain GET.
import { LOOP } from './routes.mjs';

const L = encodeURIComponent(LOOP);

// Reached by URL alone: a filter or id that matches nothing, or a request the server rejects.
export const URL_STATES = [
  ['overview', 'empty', '/cpm?site=zz_none'],
  ['performance', 'empty', '/cpm/performance?site=zz_none'],
  ['performance', 'empty-filter', '/cpm/performance?fg=G99'],
  ['events', 'empty', '/cpm/events?loop=zz_none'],
  ['calculations', 'empty', `/cpm/calculations?loop=${L}&gate=G99`],
  ['historical', 'empty', `/cpm/historical?loop=${L}&from=2001-01-01T00:00:00Z&to=2001-01-02T00:00:00Z`],
  ['registry', 'empty', '/cpm/registry?site=zz_none'],
  ['kpi', 'empty', '/cpm/kpi?kpi=oscillating&site=zz_none'],
  ['trend', 'empty', '/trend'],
  ['explorer', 'empty', '/cpm/explorer?site=zz_none'],
  ['investigation', 'empty', '/cpm/investigation?site=zz_none'],
  ['explorer', 'no-selection', '/cpm/explorer'],
  ['historical', 'no-selection', '/cpm/historical'],
  ['evidence', 'no-selection', '/cpm/evidence'],
  ['replay', 'no-selection', '/cpm/replay'],
  ['windows', 'no-selection', '/cpm/windows'],
  ['calculations', 'no-selection', '/cpm/calculations'],
  ['response', 'no-selection', '/cpm/response'],
  ['investigation', 'no-selection', '/cpm/investigation'],
  ['explorer', 'missing-record', '/cpm/explorer?loop=zz_none'],
  ['events', 'missing-record', '/cpm/events?event=999999999'],
  ['overview', 'missing-record', '/cpm?loop=zz_none'],
  ['kpi', 'error-server', '/cpm/kpi?kpi=bogus'],
  ['performance', 'error-server', '/cpm/performance?health=bogus'],
  ['evidence', 'error-server', `/cpm/evidence?loop=${L}&methodRun=00000000-0000-0000-0000-000000000000&gate=G15`],
];

// Opened by a click or key press. `open` holds only controls audited as local; the write guard backs that up.
export const SURFACES = [
  { slug: 'shell', state: 'command-palette', url: '/cpm', key: 'Control+k', expect: '[aria-label="Command palette"]' },
  { slug: 'overview', state: 'loop-drawer', url: '/cpm', text: /^(Open analysis|Review evidence)/, expect: '[aria-label^="Focused analysis for"]' },
  { slug: 'performance', state: 'help-open', url: '/cpm/performance', css: '.cpm-help-toggle' },
  { slug: 'performance', state: 'gate-cell', url: '/cpm/performance?view=matrix', css: '.cpm-matrix__cell' },
  { slug: 'events', state: 'detail', url: '/cpm/events', css: '.cpm-event-row__select' },
  { slug: 'explorer', state: 'chart-tooltip', url: `/cpm/explorer?loop=${L}`, hover: 'canvas' },
  { slug: 'explorer', state: 'gate-detail', url: `/cpm/explorer?loop=${L}`, css: '.cpm-gate-chip' },
  { slug: 'historical', state: 'chart-tooltip', url: `/cpm/historical?loop=${L}`, hover: 'canvas' },
  { slug: 'calculations', state: 'drawer', url: `/cpm/calculations?loop=${L}`, css: '.cpm-calc-row' },
  { slug: 'registry', state: 'add-loop-dialog', url: '/cpm/registry', text: /^Add loop/ },
  { slug: 'registry', state: 'bulk-import-dialog', url: '/cpm/registry', text: /^Bulk import/ },
  { slug: 'kpi', state: 'picker', url: '/cpm/kpi?kpi=acceptable', text: /^Show another KPI/ },
  { slug: 'response', state: 'review-dialog', url: `/cpm/response?loop=${L}`, text: /^Review$/, expect: '[aria-label="Review system model"]' },
];

export const FIRST_VISIT = [
  ['overview', '/cpm'], ['performance', '/cpm/performance'], ['events', '/cpm/events'],
  ['explorer', `/cpm/explorer?loop=${L}`], ['historical', `/cpm/historical?loop=${L}`],
  ['investigation', `/cpm/investigation?loop=${L}`], ['evidence', `/cpm/evidence?loop=${L}`],
  ['windows', `/cpm/windows?loop=${L}`], ['calculations', `/cpm/calculations?loop=${L}`],
  ['response', `/cpm/response?loop=${L}`], ['registry', '/cpm/registry'],
  ['kpi', '/cpm/kpi?kpi=acceptable'],
];

// SuperAdmin-only routes (CHG-081). Run with --super under a SuperAdmin login.
export const SUPER_VISIT = [
  ['config', '/cpm/config'], ['config-effective', `/cpm/config?loop=${L}&view=effective`],
  ['pipeline', '/cpm/pipeline'], ['governance', '/cpm/governance'], ['admin-users', '/admin/users'], ['admin-audit', '/admin/audit'],
];
