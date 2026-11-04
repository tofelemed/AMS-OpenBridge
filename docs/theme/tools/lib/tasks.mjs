// Part F task definitions. Each traces to a guide requirement or an existing CPA function, named in `source`.
// A step opens a URL (`open`), or clicks visible text (`click`) with `then` as the fallback URL if the control is absent.
// Nothing here activates a write control; the guard stays on throughout.
import { REP } from './entries.mjs';

const L = REP.primary;
const C = REP.confirmed;
const S = REP.stale;
const open = url => ({ open: url });
const click = (text, then, note) => ({ click: text, then, note });

export const TASKS = [
  { id: 'OP1', role: 'Operator', task: 'Find the loops that need review on my unit and why', source: 'Guide p.11 purpose', steps: [open('/cpm?site=hdpe'), click(/^Open analysis|^Review evidence|^Open loop|^Show all monitored/, `/cpm?site=hdpe&loop=${L}`)] },
  { id: 'OP2', role: 'Operator', task: 'See the current PV, SP, output and mode of a loop', source: 'Guide p.12 purpose', steps: [open(`/cpm?site=hdpe&loop=${L}`), click(/Loop Explorer|Explorer|^Loop$/, `/cpm/explorer?site=hdpe&loop=${L}`)] },
  { id: 'OP3', role: 'Operator', task: 'See whether a loop spent the shift in AUTO', source: 'Guide p.13 time in AUTO', steps: [open(`/cpm/explorer?loop=${L}`), click(/Time in normal mode/, `/cpm/historical?loop=${L}`)] },
  { id: 'OP4', role: 'Operator', task: 'List loops in manual now', source: 'Overview KPI', steps: [open('/cpm'), click(/^In manual/, '/cpm/kpi?kpi=manual-mode')] },
  { id: 'OP5', role: 'Operator', task: 'Find why a loop is not evaluated', source: 'Prompt example; guide p.7 data states', steps: [open(`/cpm/explorer?loop=${S}`), click(/Open Window Inspector/, `/cpm/windows?loop=${S}`)] },
  { id: 'OP6', role: 'Operator', task: 'Check open episodes on a unit', source: 'Loop Events function', steps: [open('/cpm?site=hdpe'), click(/^All events|^Episodes$/, '/cpm/events?site=hdpe')] },

  { id: 'EN1', role: 'Engineer', task: 'Confirm whether a loop oscillation is valve-related', source: 'Prompt example; guide p.13 diagnostic method', steps: [open(`/cpm/explorer?loop=${C}`), click(/Investigation|Investigate|^Loop$/, `/cpm/investigation?loop=${C}`), click(/Workbench|Open evidence|^Evidence$/, `/cpm/evidence?loop=${C}&gate=G14`)] },
  { id: 'EN2', role: 'Engineer', task: 'Compare loops gate by gate', source: 'Performance function', steps: [open('/cpm/performance'), click(/^Full G0|matrix/i, '/cpm/performance?view=matrix')] },
  { id: 'EN3', role: 'Engineer', task: 'Read how a metric was calculated', source: 'Guide p.13 metric result', steps: [open(`/cpm/explorer?loop=${L}&tab=Calculations`), click(/Control error|Good-error/, `/cpm/calculations?loop=${L}&metric=CPLM-010`)] },
  { id: 'EN4', role: 'Engineer', task: 'Replay the raw samples behind a verdict', source: 'Evidence Replay function', steps: [open(`/cpm/evidence?loop=${L}`), click(/Replay/, `/cpm/replay?loop=${L}`)] },
  { id: 'EN5', role: 'Engineer', task: 'See PV, SP, output and mode for a past period', source: 'Guide p.13 detailed performance', steps: [open(`/cpm/explorer?loop=${L}`), click(/Historical/, `/cpm/historical?loop=${L}`), click(/Open in Trend/, `/trend?tags=x`)] },
  { id: 'EN6', role: 'Engineer', task: 'Check the process model of a loop', source: 'System Response function', steps: [open(`/cpm/explorer?loop=${L}`), click(/System Response|^Loop$/, `/cpm/response?loop=${L}`)] },

  { id: 'RE1', role: 'Reliability', task: 'List suspected valve problems', source: 'Overview KPI', steps: [open('/cpm'), click(/Suspected valve problem/, '/cpm/kpi?kpi=valve')] },
  { id: 'RE2', role: 'Reliability', task: 'Check instrument health on a loop', source: 'Guide p.12 related instrument links', steps: [open(`/cpm/explorer?loop=${L}`), click(/Investigation|^Loop$/, `/cpm/investigation?loop=${L}`)] },
  { id: 'RE3', role: 'Reliability', task: 'Follow up an episode', source: 'Loop Events function', steps: [open('/cpm/events'), click(/^FIC|^PIC|^TIC|^LIC/, '/cpm/events?event=1968')] },
  { id: 'RE4', role: 'Reliability', task: 'Find loops with excessive actuator effort', source: 'Overview KPI', steps: [open('/cpm'), click(/Excessive actuator effort/, '/cpm/kpi?kpi=effort')] },
  { id: 'RE5', role: 'Reliability', task: 'Find loops with no valve position mapped', source: 'Overview readiness', steps: [open('/cpm'), click(/Open Loop Registry|VP not mapped/, '/cpm/registry')] },
  { id: 'RE6', role: 'Reliability', task: 'See alarm context for a loop', source: 'Guide p.12 related alarm links', steps: [open(`/cpm/explorer?loop=${L}`), click(/Alarm/, `/cpm/explorer?loop=${L}`, 'CAMS alarms are out of the slice')] },

  { id: 'AD1', role: 'Admin', task: 'Onboard a loop and see what is degraded', source: 'Prompt example; registry function', steps: [open('/cpm/registry'), click(/^Add loop/, '/cpm/registry')] },
  { id: 'AD2', role: 'Admin', task: 'See readiness of one loop', source: 'Registry function', steps: [open('/cpm/registry'), open(`/cpm/registry?loop=${L}`)] },
  { id: 'AD3', role: 'Admin', task: 'Check whether the pipeline is producing verdicts', source: 'Prompt example', steps: [open('/cpm'), click(/Pipeline Health|^System$/, '/cpm/pipeline')] },
  { id: 'AD4', role: 'Admin', task: 'See the thresholds a loop runs under', source: 'Configuration function', steps: [open(`/cpm/explorer?loop=${L}`), click(/Effective configuration/, `/cpm/config?loop=${L}&view=effective`)] },
  { id: 'AD5', role: 'Admin', task: 'Review who changed what', source: 'Governance function', steps: [open('/cpm'), click(/Governance|^System$/, '/cpm/governance')] },
  { id: 'AD6', role: 'Admin', task: 'Find a user and their role', source: 'Administration function', steps: [open('/cpm'), click(/Administration|^System$/, '/admin/users')] },
];
