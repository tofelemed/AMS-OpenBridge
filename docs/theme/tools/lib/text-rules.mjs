// Part C classification. First matching rule wins; anything unmatched falls to `defaultClass`.
// Prompt constraint: units, data-state labels, coverage, time zone, source, safety or regulatory notices and
// error text are never removed. They may only be shortened or moved, and a moved definition stays reachable from its value.
// Reasons cite the guide page or a prompt §6.2 rule. These are proposals; no application text was changed.

const K = 'Keep'; const S = 'Shorten'; const M = 'Move to help'; const R = 'Remove';
const INFO = 'Info button beside the value';
const P6 = 'Guide p.6: metric definitions go in an accessible help or detail view';
const AFF = 'Prompt 6.2: "Click to view" affordance on a clickable item';
const DUP = 'Prompt 6.2: repeats text already on the page or in navigation';
const UNSUPPORTED = 'Prompt 6.2: claim without a documented basis';

export const RULES = [
  // Unsupported or decorative statements
  [/^Lean Automation$/i, R, null, 'Prompt 6.2: decorative tagline, no data source'],
  [/in compliance with IEC 62443/i, S, 'Authorized use only. Access is restricted to authorized operators.', `${UNSUPPORTED}: no IEC 62443 assessment found. The access notice itself stays`],
  [/^Secure sign in$/i, S, 'Sign in', `${UNSUPPORTED}: TLS depends on deployment`],
  [/^Immutable cryptographically-chained record of all/i, S, 'Chained audit record', `${UNSUPPORTED}: "all actions" not established; failed logins do not reach the audit service`],
  [/^Traverse control-loop performance$|^Control Loop Performance Management$/i, S, 'Traverse CPA', 'Guide p.28: one product identity across the shell'],

  // Affordances on things that are already clickable
  [/Each card opens the loops behind it/i, S, 'Keep the counting rule in help; drop this sentence', AFF],
  [/^Click a day to list|Click a day to list the loops/i, S, 'Days with nothing kept read "no data", not 0 %.', AFF],
  [/^(\d+ )?evaluated window\(s\) · click a verdict band/i, S, '0 evaluated windows', AFF],
  [/select a window to open it$/i, S, '24 loaded · newest first', AFF],
  [/pick one to make it CURRENT$/i, S, 'Newest first', AFF],
  [/^Pick a loop in the priority queue/i, S, 'Select a loop', AFF],
  [/^Select a gate to read its verdict/i, S, 'Select a gate', AFF],

  // Page purpose lines: the sidebar tooltip already carries the same sentence (cpmTasks.ts)
  [/^(Which loops need attention first, and why\.|Compare every loop gate by gate|Diagnosis episodes per loop|The loops behind one Overview number|One loop's current condition|A loop's signals, KPIs, mode and verdicts|Start here: the conclusion|Why each gate passed or failed|Replay the raw samples behind|Which windows were evaluated and whether|Every calculated metric for a loop|Process models estimated from|Add loops and check they are ready|The gate settings and thresholds)/i, M, 'Sidebar tooltip, which already holds this sentence', DUP],
  [/^User management, plant model, data sources, and audit$/i, R, null, `${DUP}: the tab row names these`],
  [/^(Find problems|Check a loop|Understand the cause|Set up)( · .*)?$/i, S, 'CPA / <page> breadcrumb', 'Guide p.11-12 concepts: eyebrow is the module path, not a task name'],

  // Long definitions and method notes
  [/^The headline of control-loop monitoring/i, M, 'Collapsed "How this is counted" on /cpm/kpi', P6],
  [/^count\(no fault identified/i, M, 'Collapsed "How this is counted" on /cpm/kpi', P6],
  [/^No fault identified \(NO_CALL/i, M, 'Collapsed "How this is counted" on /cpm/kpi', P6],
  [/^No fault · AUTO ≥/i, M, INFO, P6],
  [/^Each monitored loop counted once/i, M, INFO, P6],
  [/^Ordered by priority \(loop criticality/i, S, 'Ranked by priority', 'Guide p.13 needs a stated ranking basis; full rule in the info button'],
  [/^Verdicts fuse on 12h/i, M, INFO, P6],
  [/^Observations, hypotheses and the leading hypothesis/i, M, INFO, P6],
  [/^The live path keeps the arrays/i, M, 'Info button on "Evidence not retained"', P6],
  [/^Stages are the pipeline's fixed shape/i, M, INFO, P6],
  [/^Submits the A8 historical replay job/i, M, 'Button tooltip with accessible description', 'Guide p.7: a disabled or heavy action explains itself accessibly; not on every glance'],
  [/^A note stays on the loop/i, S, 'Saving does not acknowledge an episode.', 'Keep the consequence, drop the explanation'],
  [/^Investigate diagnosis episodes with operating context/i, M, 'Sidebar tooltip', DUP],
  [/^Add individual loops or validate a bulk registry import/i, M, 'Sidebar tooltip', DUP],
  [/^What each loop runs under/i, S, '165 properties · 6 workers announced', DUP],
  [/^What this loop runs under today/i, R, null, `${DUP}: the view tabs name these`],
  [/^Validated drafts appear here for an independent approver/i, M, INFO, P6],
  [/^Configure infrastructure retention, UI defaults/i, R, null, `${DUP}: the page title says this`],
  [/^Permission changes take effect when/i, S, 'Applies at next sign-in or token refresh', 'Keep the consequence'],
  [/^The UNS asset tree/i, M, INFO, P6],
  [/^The onboarding order/i, M, INFO, P6],
  [/^Assign permissions to roles/i, M, INFO, P6],
  [/^Configure OT data sources/i, R, null, `${DUP}: the page title says this`],
  [/^A loop is only as good as its signal mappings/i, M, INFO, 'Prompt 6.2: slogan plus threshold note'],
  [/^Classification derived from the tag type/i, M, INFO, P6],
  // Metric definitions only: full sentences ending in a stop. Row content such as "Peak: Oscillation confirmed" must not match.
  [/^(Time fraction|Fraction of|OP travel relative|Total actuator travel|Number of|Mean |Median |Peak |Share of|Ratio of|Sum of|Standard deviation|Time the|Time spent|Estimated |Dominant |Count of|Reversals? )[^:]*\.$/, M, 'Calculation drawer, one click from the value', P6],
  [/^G9 geometry is supporting-only/i, M, INFO, P6],
  [/^(What|How|Why) .*\?$/i, M, INFO, P6],
  [/^Events are captured from qualifying/i, S, 'No qualifying event in the retained period. 294 candidates censored.', 'Guide p.7: empty state explains and offers a reset; the method moves to help'],
  [/^A model is estimated from an accepted response event/i, S, 'No model yet: needs an accepted response event.', 'Guide p.7: empty state explains; the method moves to help'],
  [/^No complete response event yet/i, S, 'No complete response event: 294 candidates censored.', 'Guide p.7: keep the state, drop the method'],
  [/^Create asset relationships, then republish/i, S, 'Needs asset relationships (G13).', 'Keep the action, drop the sequence'],

  [/^OT\/legacy tag → canonical UNS path/i, M, INFO, P6],
  [/^The Flink\/Kafka runtime that produces every verdict/i, M, 'Sidebar tooltip', DUP],
  [/^a layer above sets a property/i, M, INFO, P6],
  [/^Configure how long alarms and audit records/i, M, INFO, P6],
  [/^Entries are hash-chained by audit-service/i, S, 'Hash-chained. Run a verification to confirm integrity.', 'Keep the honest qualifier; it contradicts the "Immutable" line above it'],

  // Needed, but wordy
  [/^There is no server-side history for these metrics/i, S, 'Live snapshots since this page opened', 'Source stays'],
  [/^The chart needs at least two readings/i, S, 'Needs two readings; keep this page open', 'Keep state'],
  [/^Latency \/ backpressure \/ parallelism are not exposed/i, S, 'Not exposed: latency, backpressure, parallelism', 'Data-state label stays'],
  [/^Not measured — not in this window's result/i, S, 'Not measured: older engine', 'Data-state label stays; the reason moves to help'],
  [/^Valve position expected but not mapped: map its tag/i, S, 'Valve position not mapped', 'Data-state label stays; the action is the link'],
  [/valve position expected but not mapped · map the VP tag/i, S, '236 loops: VP not mapped (G14)', 'Coverage stays; repeats the sibling line'],
  [/valve loop\(s\) with VP expected but not mapped/i, S, '236 loops need a test record to confirm a valve fault', 'Coverage stays'],
  [/peer links expected but missing/i, S, '241 peer links missing (G13)', 'Coverage stays'],
  [/^Check that the loop.s signals are arriving/i, S, 'Check signal arrival in Window Inspector', 'Keep the next step'],
  [/^Site zone UTC\. Every event is listed/i, S, 'Site zone UTC', 'Time zone stays; the rest is method'],
  [/^The whole window: not evaluated/i, S, 'Whole window not evaluated: not enough data', 'Keep state'],
  [/^Still open: the newest window could not be judged/i, S, 'Still open: newest window not judged', 'Keep state'],
  [/^The verdict and every scalar of this run are valid/i, S, 'Verdict and scalars valid; arrays not kept', 'Keep state'],
  [/^Reconstruct the evidence to rebuild the arrays/i, S, 'Rebuilt arrays are labelled as rebuilt', 'Keep the label promise'],
  [/^PV \/ SP and OP \/ VP from the historian over this run/i, S, 'Historian context, not qualification data', 'Source stays'],
  [/^The shaded band is the evaluated/i, S, 'Shaded: evaluated 12h window', 'Reading aid for the chart stays'],
  [/^Watermark lag:/i, S, 'Watermark lag: unavailable', 'Data-state label stays'],
  [/^Loop summary · latest 12h evaluated window$/i, S, 'Latest 12h window', 'Window label stays; repeats "Loop"'],
  [/ in Historical ›$/, S, 'In Historical ›', 'Link label repeats the row label'],
  [/^(Open Window Inspector|Show on trend|Calculation proof).*›/i, K, null, 'Control label'],
  [/^Fused verdicts exist only where a full evaluation window closed\.$/i, M, INFO, P6],
  [/^Only one evaluated window stored/i, S, 'No previous window to compare', 'Keep state'],
  [/^No loop has a current (confirmed or suspected )?finding/i, S, 'No current findings', 'Heading above says this; empty state stays short'],
  [/^The count for this KPI is 0 in this scope/i, S, 'No loops in this scope', 'Keep state'],
  [/^Neither retained proof nor a reconstruction/i, K, null, 'Data-state message'],

  // Must stay
  [/^Not functional yet/i, K, null, 'Honest notice. The page behind it is the finding, see 8.5'],
  [/could not be (read|loaded)|retry/i, K, null, 'Error text (constraint)'],
  [/not checked|not configured|stale|unavailable|not evaluated|not measured|no data|not retained|insufficient|bad quality|too few|expected but|not mapped|failed|error/i, K, null, 'Data-state label or error text (constraint)'],
  [/\b(GST|UTC|UTC[+-]\d|ends? \d|window ending|updated|last stored|ago\b)/, K, null, 'Timestamp, time zone or age (constraint)'],
  [/\b(of \d+|loop\(s\)|coverage|in scope|monitored|assessed|excluded)\b/i, K, null, 'Population or coverage (constraint)'],
  [/root\.|traverse\.|calc \d|source|historian|version|v\d/i, K, null, 'Source or version (constraint)'],
  [/not probabilities|uncalibrated/i, K, null, 'Needed to read the value correctly'],
];

// Prompt 6.2 hard constraint, checked by text-audit.mjs: none of these may ever be classed Remove.
export const NEVER_REMOVE = /\b(GST|UTC|coverage|stale|bad quality|unavailable|not checked|not measured|not evaluated|no data|source|historian|error|failed|could not|authori[sz]ed|safety|of \d+)\b|%|\b(pp|EU|\/h|\/day)\b/i;

export function classify(block, slug = '') {
  // The location repeats only on Explorer (context bar plus loop breadcrumb). Elsewhere it is the only copy.
  if (/^HDPE › Section 600 ›/.test(block.text)) {
    return slug.startsWith('explorer')
      ? { cls: R, to: null, why: `${DUP}: Explorer shows this location twice, in the context bar and the loop breadcrumb. Keep one` }
      : { cls: K, to: null, why: 'Loop identity: the only location on this page (guide p.13)' };
  }
  for (const [re, cls, to, why] of RULES) {
    if (re.test(block.text)) return { cls, to, why };
  }
  if (block.kind === 'control') return { cls: K, to: null, why: 'Control label' };
  if (block.kind === 'column') return { cls: K, to: null, why: 'Column label' };
  if (block.kind === 'heading') return { cls: K, to: null, why: 'Section or page title' };
  if (block.words < 4) return { cls: K, to: null, why: 'Short label or value' };
  return { cls: K, to: null, why: 'State or row content' };
}

/** Words removed from the visible page if the proposal were applied. Moved text leaves an icon, so it counts in full. */
export function wordsSaved(block, c, countWords) {
  if (c.cls === R || c.cls === M) return block.words * block.n;
  if (c.cls === S) return Math.max(0, block.words - countWords(c.to ?? '')) * block.n;
  return 0;
}
