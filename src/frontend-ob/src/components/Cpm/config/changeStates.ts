/**
 * The one list of a change's states and steps for the Gate Configuration pages (final review I2): which versions are still on their
 * way (the start page's "Changes in progress", the loop page's pill), which have settled, and the order of the five steps.
 * PARTIALLY_ACKNOWLEDGED and ACTIVATION_FAILED are on their way: cplm-api sets them and Deploy can be tried again.
 */
import type { ChangeStep } from './configRoutes';

export const CHANGE_STEPS: readonly ChangeStep[] = ['edit', 'check', 'try', 'approve', 'deploy'];

export const IN_PROGRESS: ReadonlySet<string> = new Set([
  'DRAFT', 'VALIDATED', 'SHADOW_EVALUATED', 'REJECTED', 'APPROVED', 'EXPIRED', 'SCHEDULED', 'PREPARED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED',
]);

export const SETTLED: ReadonlySet<string> = new Set(['ACTIVE_VERIFIED', 'SUPERSEDED', 'ROLLED_BACK']);
