/** The two tables of the Gate Configuration start page, from the bundle summaries. Pure. */
import type { BundleSummary, EffectiveSummaryLoop } from '../../../api/cpm/config';
import type { ChangeStep } from './configRoutes';
import { stepMarks } from './levelWords';
import { CHANGE_STEPS as STEPS, IN_PROGRESS } from './changeStates';

export interface InProgressRow { bundle: BundleSummary; nextStep: ChangeStep; done: number }
export interface RunningRow { bundle: BundleSummary; loopCount: number }

/** Versions still on their way to active, newest first, each with the step to continue at and how many steps are done. */
export function changesInProgress(bundles: BundleSummary[]): InProgressRow[] {
  return bundles.filter(b => IN_PROGRESS.has(b.state))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(bundle => {
      // the one rule (stepMarks): the current step is the next one; the steps before it are done
      const marks = stepMarks(bundle.state);
      const at = STEPS.findIndex(x => marks[x] === 'current');
      const nextStep = STEPS[at < 0 ? STEPS.length - 1 : at];
      const done = STEPS.filter(x => marks[x] === 'done').length;
      return { bundle, nextStep, done };
    });
}

const KIND_ORDER = { SITE: 0, PROFILE: 1, LOOP: 2, REGIME: 3 } as const;

/** The active version of each scope: the plant, then each loop type, then each loop by id. */
export function runningNow(bundles: BundleSummary[], loops: EffectiveSummaryLoop[]): RunningRow[] {
  const newest = new Map<string, BundleSummary>();
  for (const b of bundles) {
    if (b.state !== 'ACTIVE_VERIFIED' || b.inherits) continue;
    const key = `${b.site}|${b.scopeKind}|${b.scopeRef ?? ''}`;
    const have = newest.get(key);
    if (!have || b.version > have.version) newest.set(key, b);
  }
  const count = (b: BundleSummary) => b.scopeKind === 'SITE' ? loops.filter(l => l.site === b.site).length
    : b.scopeKind === 'PROFILE' ? loops.filter(l => l.profileId === b.scopeRef).length : 1;
  return [...newest.values()]
    .sort((a, b) => KIND_ORDER[a.scopeKind] - KIND_ORDER[b.scopeKind] || (a.scopeRef ?? '').localeCompare(b.scopeRef ?? '') || a.site.localeCompare(b.site))
    .map(bundle => ({ bundle, loopCount: count(bundle) }));
}
