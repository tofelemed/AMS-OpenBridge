// The Navigation map as data: one entry per row (a few rows give several steps). Read by journey-walk.mjs.
//   from    a list of addresses tried in order until the control is found (fallback across data states)
//   do      clicks in order: a text (string, or regex), or {sel, text, dialog}. dialog:true searches the open dialog.
//   expect  {path, params}, {dialog: title or true or regex} or {download: true}. A param key may list alternatives
//           with "|"; a value is a string, true (present) or '$loop' (the loop under test).
const L = encodeURIComponent(process.env.CPA_LOOP ?? 'FIC10401');
const D = text => ({ text, dialog: true });
const nav = (path, params = {}) => ({ path, params });
const dlg = dialog => ({ dialog });
const lp = { loop: '$loop' };
const EXPLORER = `/cpm/explorer?loop=${L}`;
const INV = `/cpm/investigation?loop=${L}`;
const WB = `/cpm/evidence?loop=${L}`;
const EVENTS = ['/cpm/events', `/cpm/events?loop=${L}&filter=all`];
const MATRIX = [`/cpm/performance?loop=${L}&view=matrix`, '/cpm/performance?view=matrix'];
const REVIEW = /^Review\b.*→/;
const PROOF = /^(Calculation proof|G\d+ proof)/;
const CELL = { sel: 'td button, td [role="button"]' };
const KPI = { sel: '[class*="kpi" i] button, [class*="kpi" i] [role="button"]' };
const GATE = { sel: '[class*="gate" i] button, [class*="gate" i] [role="button"]' };
const WBRUN = { ...lp, methodRun: true };

export const STEPS = [
  { id: 'ov-kpi-card', row: 'Overview | KPI card', from: ['/cpm'], do: [{ sel: '.cpm-kpicards a[href*="review="], .cpm-op a[href*="review="]' }], expect: nav('/cpm', { review: true }) },
  { id: 'ov-state-bar', row: 'Overview | State bar segment', from: ['/cpm'], do: [{ sel: 'a[href*="review="][title*=" of "], a[href*="review="][title^="List these"]' }], expect: nav('/cpm', { review: true }) },
  { id: 'ov-loop-tag', row: 'Overview | Loop tag', from: ['/cpm'], do: [{ sel: '.cpm-queue-row a[href*="/cpm/investigation"], a[href*="/cpm/investigation"]' }], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'ov-review-x', row: 'Overview | Review X →', from: ['/cpm', `/cpm?loop=${L}`], do: [REVIEW], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'ov-top-finding', row: 'Overview | Top-priority finding', from: ['/cpm'], do: [{ sel: '[class*="finding" i] a[href*="/cpm/investigation"], [class*="finding" i] obc-button, [class*="finding" i] button' }], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'ov-view-all', row: 'Overview | View all →', from: ['/cpm'], do: ['View all →'], expect: nav('/cpm/performance') },
  { id: 'ov-event-row', row: 'Overview | Event row', from: ['/cpm'], do: [{ sel: '[class*="recent" i] [role="button"], [class*="recent" i] a, [class*="recent" i] tr[tabindex], [class*="recent" i] li[tabindex]' }], expect: nav('/cpm/investigation', { loop: true, window: true }) },
  { id: 'ov-all-events', row: 'Overview | All events →', from: ['/cpm'], do: ['All events →'], expect: nav('/cpm/events') },
  { id: 'ov-config', row: 'Overview | Configuration & coverage →', from: ['/cpm'], do: ['Configuration & coverage'], expect: nav('/cpm/registry') },
  { id: 'ov-basis', row: 'Overview | Calculation basis', from: ['/cpm'], do: ['Calculation basis'], expect: dlg('Calculation basis') },

  { id: 'pf-review-x', row: 'Performance | Review X →', from: [`/cpm/performance?loop=${L}`], do: [REVIEW], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'pf-review-link', row: 'Performance | Review ↗, matrix result ↗', from: ['/cpm/performance', ...MATRIX], do: [/^Review\b.*↗/], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'pf-gate-dialog', row: 'Performance | Gate chip, matrix cell', from: MATRIX, do: [CELL], expect: dlg(true) },
  { id: 'pf-gate-review', row: 'Performance | Gate dialog, then Review X →', from: MATRIX, do: [CELL, { text: REVIEW, dialog: true }], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'pf-gate-windows', row: 'Performance | Gate dialog, then Window Inspector ↗', from: MATRIX, do: [CELL, D('Window Inspector')], expect: nav('/cpm/windows', { loop: true }) },
  { id: 'pf-gate-tile', row: 'Performance | Gate summary tile', from: ['/cpm/performance'], do: [{ sel: '[class*="rollup" i] button, [class*="rollup" i] [role="button"], [class*="gate-summary" i] button' }], expect: nav('/cpm/performance', { 'fg|rows': true }) },
  { id: 'pf-kpi-tile', row: 'Performance | KPI tile', from: ['/cpm/performance'], do: [KPI], expect: dlg(true) },
  { id: 'pf-show-loops', row: 'Performance | KPI tile, then Show the loops', from: ['/cpm/performance'], do: [KPI, 'Show the loops'], expect: nav('/cpm', { review: true }) },
  { id: 'pf-how-to-read', row: 'Performance | How to read →', from: ['/cpm/performance'], do: ['How to read'], expect: dlg('How to read') },
  { id: 'pf-basis', row: 'Performance | Calculation basis', from: ['/cpm/performance'], do: ['Calculation basis'], expect: dlg('Calculation basis') },

  { id: 'ev-review-x', row: 'Loop Events | Review X →', from: EVENTS, do: [REVIEW], expect: nav('/cpm/investigation', { loop: true }) },
  { id: 'ev-period', row: 'Loop Events | Episode period ↗', from: EVENTS, do: ['Episode period'], expect: nav('/cpm/historical', { ...lp, from: true, to: true }) },
  { id: 'ev-shelve', row: 'Loop Events | Shelve… (dialog only, never confirmed)', from: EVENTS, do: [/^Shelve/], expect: dlg(true) },
  { id: 'ev-full-history', row: 'Loop Events | Full history ↗', from: EVENTS, do: ['Full history'], expect: dlg('Full history') },

  { id: 'fc-review-x', row: 'Fast conditions | Review X →', from: EVENTS, do: [{ text: 'Fast conditions', role: 'tab' }, REVIEW], expect: nav('/cpm/explorer', { loop: true, 'gate|tab': true }) },
  { id: 'fc-windows', row: 'Fast conditions | Window Inspector ↗', from: EVENTS, do: [{ text: 'Fast conditions', role: 'tab' }, 'Window Inspector'], expect: nav('/cpm/windows', { loop: true, profile: '15m' }) },

  { id: 'ex-review-evidence', row: 'Loop Explorer | Review evidence →', from: [EXPLORER], do: ['Review evidence'], expect: nav('/cpm/evidence', WBRUN) },
  { id: 'ex-model-dialog', row: 'Loop Explorer | Loop model & setup →', from: [EXPLORER], do: ['Loop model & setup'], expect: dlg(true) },
  { id: 'ex-model-registry', row: 'Loop Explorer | Loop model dialog, then Loop Registry →', from: [EXPLORER], do: ['Loop model & setup', D('Loop Registry')], expect: nav('/cpm/registry', { loop: true }) },
  { id: 'ex-model-response', row: 'Loop Explorer | Loop model dialog, then System Response ↗', from: [EXPLORER], do: ['Loop model & setup', D('System Response')], expect: nav('/cpm/response', { loop: true }) },
  { id: 'ex-historical', row: 'Loop Explorer | Historical ↗', from: [EXPLORER], do: ['Historical'], expect: nav('/cpm/historical', { ...lp, from: true, to: true }) },
  { id: 'ex-kpi-card', row: 'Loop Explorer | KPI card', from: [EXPLORER], do: [KPI], expect: dlg(true) },
  { id: 'ex-kpi-inspect', row: 'Loop Explorer | KPI card, then Inspect Gn →', from: [EXPLORER], do: [KPI, { text: /^Inspect\b/, dialog: true }], expect: nav('/cpm/calculations', { loop: true }) },
  { id: 'ex-gate-dialog', row: 'Loop Explorer | Gate tile', from: [EXPLORER], do: [GATE], expect: dlg(true) },
  { id: 'ex-gate-workbench', row: 'Loop Explorer | Gate dialog, then Evidence Workbench →', from: [EXPLORER], do: [GATE, D('Evidence Workbench')], expect: nav('/cpm/evidence', { ...WBRUN, gate: true }) },
  { id: 'ex-gate-windows', row: 'Loop Explorer | Gate dialog, then Window Inspector ↗', from: [EXPLORER], do: [GATE, D('Window Inspector')], expect: nav('/cpm/windows', { loop: true }) },
  { id: 'ex-all-calcs', row: 'Loop Explorer | All calculations →', from: [EXPLORER], do: ['All calculations'], expect: nav('/cpm/explorer', { ...lp, tab: 'Calculations' }) },
  { id: 'sg-trend', row: 'Signals | Show in trend ↗', from: [`${EXPLORER}&tab=Signals`], do: ['Show in trend'], expect: nav('/trend', { loop: true }) },
  { id: 'sg-bindings', row: 'Signals | Signal bindings →', from: [`${EXPLORER}&tab=Signals`], do: ['Signal bindings'], expect: nav('/cpm/registry', { loop: true }) },
  { id: 'ct-inspect', row: 'Calculations tab | Inspect →', from: [`${EXPLORER}&tab=Calculations`], do: [/^Inspect\b/], expect: dlg(true) },
  { id: 'ct-short', row: 'Calculations tab | Short windows ↗', from: [`${EXPLORER}&tab=Calculations`], do: ['Short windows'], expect: nav('/cpm/windows', { loop: true }) },
  { id: 'rl-registry', row: 'Relationships | Open Loop Registry →', from: [`${EXPLORER}&tab=Relationships`], do: ['Open Loop Registry'], expect: nav('/cpm/registry', { loop: true }) },
  { id: 'hi-open', row: 'History | Open Historical →', from: [`${EXPLORER}&tab=History`], do: ['Open Historical'], expect: nav('/cpm/historical', lp) },
  { id: 'hi-row', row: 'History | row', from: [`${EXPLORER}&tab=History`], do: [{ sel: 'table tbody tr[tabindex], table tbody tr[role="link"], table tbody tr[role="button"], table tbody tr a' }], expect: nav('/cpm/historical', lp) },

  { id: 'hs-explorer', row: 'Historical | Loop Explorer ↗', from: [`/cpm/historical?loop=${L}`], do: ['Loop Explorer'], expect: nav('/cpm/explorer', lp) },
  { id: 'hs-trend', row: 'Historical | Open in Trend ↗', from: [`/cpm/historical?loop=${L}`], do: ['Open in Trend'], expect: nav('/trend', { loop: true }) },
  { id: 'hs-review', row: 'Historical | Review this window →', from: [`/cpm/historical?loop=${L}`], do: ['Review this window'], expect: nav('/cpm/evidence', WBRUN) },
  { id: 'hs-package', row: 'Historical | Evidence package ↗ (a real download)', from: [`/cpm/historical?loop=${L}`], do: [/^Evidence package/], expect: { download: true } },
  { id: 'hs-export', row: 'Historical | Export (a real download)', from: [`/cpm/historical?loop=${L}`], do: [/^Export/], expect: { download: true } },

  { id: 'iv-compare', row: 'Investigation | Compare windows', from: [INV], do: ['Compare windows'], expect: dlg('Compare windows') },
  { id: 'iv-compare-open', row: 'Investigation | Compare windows, then Open →', from: [INV], do: ['Compare windows', { text: /^Open\b/, dialog: true }], expect: nav('/cpm/investigation', { ...lp, window: true }) },
  { id: 'iv-all-gates', row: 'Investigation | All 17 gate results →', from: [INV], do: ['All 17 gate results'], expect: dlg(/gate results/i) },
  { id: 'iv-all-gates-proof', row: 'Investigation | All 17 gate results, then gate proof', from: [INV], do: ['All 17 gate results', { sel: 'button, [role="button"]', dialog: true, skip: 1 }], expect: dlg('Calculation proof') },
  { id: 'iv-calc-proof', row: 'Investigation | Calculation proof ↗, Gn proof ↗', from: [INV], do: [PROOF], expect: dlg('Calculation proof') },
  { id: 'iv-proof-workbench', row: 'Investigation | Gate proof dialog, then Evidence Workbench →', from: [INV], do: [PROOF, D('Evidence Workbench')], expect: nav('/cpm/evidence', { ...WBRUN, gate: true }) },
  { id: 'iv-proof-replay', row: 'Investigation | Gate proof dialog, then Evidence Replay ↗', from: [INV], do: [PROOF, D('Evidence Replay')], expect: nav('/cpm/replay', { ...lp, window: true }) },
  { id: 'iv-replay', row: 'Investigation | Evidence Replay ↗', from: [INV], do: ['Evidence Replay'], expect: nav('/cpm/replay', { ...lp, window: true }) },
  { id: 'iv-historical', row: 'Investigation | Historical ↗', from: [INV], do: ['Historical'], expect: nav('/cpm/historical', lp) },
  { id: 'iv-related', row: 'Investigation | Related events ↗', from: [INV], do: ['Related events'], expect: nav('/cpm/events', lp) },
  { id: 'iv-hypotheses', row: 'Investigation | Hypothesis comparison ↗', from: [INV], do: ['Hypothesis comparison'], expect: dlg('Hypothesis comparison') },
  { id: 'iv-measures', row: 'Investigation | View all measures →', from: [INV], do: ['View all measures'], expect: dlg(true) },

  { id: 'wb-back', row: 'Evidence Workbench | Back to Investigation ↗', from: [WB], do: ['Back to Investigation'], expect: nav('/cpm/investigation', lp) },
  { id: 'wb-replay', row: 'Evidence Workbench | Evidence Replay ↗', from: [WB], do: ['Evidence Replay'], expect: nav('/cpm/replay', lp) },
  { id: 'wb-reconstruct', row: 'Evidence Workbench | Reconstruct evidence ↗ (dialog only, never confirmed)', from: [WB], do: ['Reconstruct evidence'], expect: dlg('Reconstruct evidence') },
  { id: 'wb-run-id', row: 'Evidence Workbench | Run id ↗', from: [WB], do: ['Run id'], expect: nav('/cpm/evidence', { sub: 'identity' }) },

  { id: 'rp-workbench', row: 'Evidence Replay | Evidence Workbench ↗', from: [`/cpm/replay?loop=${L}`], do: ['Evidence Workbench'], expect: nav('/cpm/evidence', WBRUN) },
  { id: 'rp-retained', row: 'Evidence Replay | Open retained proof ↗', from: [`/cpm/replay?loop=${L}`], do: ['Open retained proof'], expect: nav('/cpm/evidence', WBRUN) },
  { id: 'rp-details', row: 'Evidence Replay | Run details ↗', from: [`/cpm/replay?loop=${L}`], do: ['Run details'], expect: dlg('Run details') },
  { id: 'rp-package', row: 'Evidence Replay | Evidence package (a dialog)', from: [`/cpm/replay?loop=${L}`], do: [/^Evidence package/], expect: dlg('Evidence package') },
  { id: 'rp-rerun', row: 'Evidence Replay | Review re-run setup → (dialog only, never confirmed)', from: [`/cpm/replay?loop=${L}`], do: [/^Review re-?run/], expect: dlg(true) },

  { id: 'wi-pipeline', row: 'Window Inspector | Pipeline Health ↗', from: [`/cpm/windows?loop=${L}`], do: ['Pipeline Health'], expect: nav('/cpm/pipeline') },
  { id: 'wi-inspect-12h', row: 'Window Inspector | Inspect this window → (12h: Replay)', from: [`/cpm/windows?loop=${L}&profile=12h`], do: ['Inspect this window'], expect: nav('/cpm/replay', { ...lp, window: true }) },
  { id: 'wi-inspect-4h', row: 'Window Inspector | Inspect this window → (4h: own run in the Workbench)', from: [`/cpm/windows?loop=${L}&profile=4h`], do: ['Inspect this window'], expect: nav('/cpm/evidence', WBRUN) },
  { id: 'wi-inspect-15m', row: 'Window Inspector | Inspect this window → (15m: own run in the Workbench)', from: [`/cpm/windows?loop=${L}&profile=15m`], do: ['Inspect this window'], expect: nav('/cpm/evidence', WBRUN) },
  { id: 'wi-inspect-norun', row: 'Window Inspector | Inspect this window → (no run: Historical)', from: [`/cpm/windows?loop=${L}&profile=1m`, `/cpm/windows?loop=${L}&profile=5m`], do: ['Inspect this window'], expect: nav('/cpm/historical', lp) },
  { id: 'wi-older', row: 'Window Inspector | Older, Newer (the page keeps the loop)', from: [`/cpm/windows?loop=${L}&profile=12h`], do: [/^Older/], expect: nav('/cpm/windows', { ...lp, window: true }) },

  { id: 'ca-back', row: 'Calculations | Back to Investigation ↗', from: [`/cpm/calculations?loop=${L}`], do: ['Back to Investigation'], expect: nav('/cpm/investigation', lp) },
  { id: 'ca-proof', row: 'Calculations | Open Gn proof →', from: [`/cpm/calculations?loop=${L}`], do: [/^Open G\d+ proof|proof →/], expect: nav('/cpm/evidence', WBRUN) },

  { id: 'sr-open-loop', row: 'System Response | Open loop ↗', from: [`/cpm/response?loop=${L}`], do: ['Open loop'], expect: nav('/cpm/explorer', lp) },
  { id: 'sr-setpoint', row: 'System Response | Review setpoint changes →', from: [`/cpm/response?loop=${L}`], do: ['Review setpoint changes'], expect: nav('/cpm/historical', lp) },
  { id: 'sr-g12', row: 'System Response | Check G12 settings', from: [`/cpm/response?loop=${L}`], do: ['Check G12 settings'], expect: nav('/cpm/config', { ...lp, gate: 'G12' }) },

  { id: 'rg-row', row: 'Loop Registry | Row', from: ['/cpm/registry'], do: [{ sel: 'table tbody tr' }], expect: nav('/cpm/registry', { loop: true }) },
  { id: 'rg-effective', row: 'Loop detail | Effective rules ↗', from: [`/cpm/registry?loop=${L}`], do: ['Effective rules'], expect: nav('/cpm/config', lp) },
  { id: 'gc-open-loop', row: 'Gate Configuration | Open loop ↗', from: [`/cpm/config?loop=${L}`], do: ['Open loop'], expect: nav('/cpm/explorer', lp) },
  { id: 'tr-open-loop', row: 'Trend | Open loop ↗', from: [`/trend?loop=${L}`], do: ['Open loop'], expect: nav('/cpm/explorer', lp) },
  { id: 'ad-governance', row: 'Administration | Open Governance →', from: ['/admin/system', '/admin/users'], do: ['Open Governance'], expect: nav('/cpm/governance') },
];
