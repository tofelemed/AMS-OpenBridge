/**
 * Loop Performance pages organised by USER TASK (SME review 2026-10-05, points 1-2).
 *
 * The CPM menu used to be a flat list in build order, so a user could not tell
 * which of six evidence pages answers "why did this loop get this verdict". This
 * map is the one source of truth for the task each page serves and a plain
 * sentence of what it answers: the sidebar groups and tooltips, the command
 * palette and every page's header eyebrow/copy read from it.
 *
 * It also carries the selection between pages: the URL is the only selection
 * state (cpaHref.ts), so a bare menu link used to drop the loop and the plant
 * scope. `cpmNavHref` keeps `loop` and `site/area/unit` when moving between
 * Loop Performance pages. The evaluated window is NOT carried: each page names
 * it differently (`window` = kind on Performance/Explorer, = END on
 * Historical/Replay, `profile` on the Window Inspector, a run id on the
 * Workbench), so carrying it would open the wrong period. The one exception
 * (CHG-048): the Explorer trend and Historical share a historian period as
 * `from` / `to`, so that pair travels between those two pages.
 */

export type CpmTask = 'Find problems' | 'Check a loop' | 'Understand the cause' | 'Set up';

export interface CpmPageInfo {
  task: CpmTask;
  /** What the page answers, in engineering language. Sidebar tooltip + header copy. */
  purpose: string;
}

/** Keyed by route path; insertion order is the menu order within a task. */
export const CPM_PAGES = {
  '/cpm': { task: 'Find problems', purpose: 'Which loops need attention first, and why.' },
  '/cpm/performance': { task: 'Find problems', purpose: 'Compare every loop gate by gate and see where the plant is failing.' },
  '/cpm/events': { task: 'Find problems', purpose: 'Diagnosis episodes per loop: acknowledge, shelve and follow them up.' },
  '/cpm/explorer': { task: 'Check a loop', purpose: "One loop's current condition, trend and gate results." },
  '/cpm/historical': { task: 'Check a loop', purpose: "A loop's signals, KPIs, mode and verdicts over a past period." },
  '/cpm/investigation': { task: 'Understand the cause', purpose: 'Start here: the conclusion, the evidence behind it and what to check next.' },
  '/cpm/evidence': { task: 'Understand the cause', purpose: 'Why each gate passed or failed in one evaluated window.' },
  '/cpm/replay': { task: 'Understand the cause', purpose: 'Replay the raw samples behind a verdict and re-run the calculation.' },
  '/cpm/windows': { task: 'Understand the cause', purpose: 'Which windows were evaluated and whether they had enough data.' },
  '/cpm/calculations': { task: 'Understand the cause', purpose: "Every calculated metric for a loop, with its latest value and method." },
  '/cpm/response': { task: 'Understand the cause', purpose: 'Process models estimated from setpoint or output steps.' },
  '/cpm/registry': { task: 'Set up', purpose: 'Add loops and check they are ready to be evaluated.' },
  '/cpm/config': { task: 'Set up', purpose: 'The gate settings and thresholds each loop runs under.' },
} as const satisfies Record<string, CpmPageInfo>;

export type CpmPagePath = keyof typeof CPM_PAGES;

export const cpmPage = (path: string): CpmPageInfo | undefined =>
  (CPM_PAGES as Record<string, CpmPageInfo>)[path];

/** Selection that survives a move between Loop Performance pages. */
const CARRIED = ['loop', 'site', 'area', 'unit'] as const;

/**
 * The href a menu entry should open. Moving from one Loop Performance page to
 * another keeps the loop and plant scope; anything else is the bare path.
 */
export function cpmNavHref(target: string, fromPathname: string, fromSearch: string, nowMs = Date.now()): string {
  if (!cpmPage(target) || !cpmPage(fromPathname)) return target;
  const from = new URLSearchParams(fromSearch);
  const next = new URLSearchParams();
  for (const key of CARRIED) {
    const v = from.get(key)?.trim();
    if (v) next.set(key, v);
  }
  // CHG-048 (SME #11): the Explorer trend and Historical read `from` / `to` the same way, so the period
  // travels between those two. A live Explorer (no from/to) hands Historical its rolling 8 h, made absolute.
  if (PERIOD_PAGES.has(fromPathname) && PERIOD_PAGES.has(target) && fromPathname !== target) {
    const f = from.get('from'); const t = from.get('to');
    if (f && t) { next.set('from', f); next.set('to', t); }
    else if (fromPathname === '/cpm/explorer') {
      next.set('from', new Date(nowMs - LIVE_TREND_MS).toISOString());
      next.set('to', new Date(nowMs).toISOString());
    }
  }
  const qs = next.toString();
  return qs ? `${target}?${qs}` : target;
}

/** Pages whose `from` / `to` mean the same thing: a historian period. */
const PERIOD_PAGES = new Set(['/cpm/explorer', '/cpm/historical']);
/** The Explorer's live rolling trend span (shared.TREND_SPAN_MS). */
const LIVE_TREND_MS = 8 * 3600_000;
