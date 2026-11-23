/**
 * CHG-219: editing operating regions in the per-loop table. Pure: the cells' text in, the rows to send (changed only) and each
 * row's problem out. Both cells empty clears a loop's own region; a plant-wide region cannot be cleared from a loop row.
 */
import type { Batch, LoopRegion, RegionChange, RegionSource } from '../../../api/cpm/configRegions';
import { standing, type Viewer } from './approvalRules';

export interface RegionDraft { min: string; max: string }

const tidy = (v: number) => String(Number(v.toPrecision(6)));
export const numberText = (v: number | null | undefined) => (v == null ? '' : tidy(v));
export const rangeText = (min: number | null, max: number | null) => (min == null || max == null ? '' : `${tidy(min)} – ${tidy(max)}`);
export const draftOf = (l: LoopRegion): RegionDraft => ({ min: numberText(l.regionMin), max: numberText(l.regionMax) });

export const SOURCE_WORD: Record<RegionSource, string> = { LOOP: 'Own', PROFILE: 'Plant-wide', SITE: 'Plant-wide', NONE: 'None' };

/** The values a draft stands for, or the reason it cannot be sent. */
export function parseDraft(d: RegionDraft): { pvMin: number | null; pvMax: number | null; error?: string } {
  const a = d.min.trim(), b = d.max.trim();
  if (!a && !b) return { pvMin: null, pvMax: null };
  if (!a || !b) return { pvMin: null, pvMax: null, error: 'Give both values, or leave both empty' };
  const min = Number(a), max = Number(b);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { pvMin: null, pvMax: null, error: 'Not a number' };
  if (!(min < max)) return { pvMin: min, pvMax: max, error: 'Min must be below max' };
  return { pvMin: min, pvMax: max };
}

/** The rows that changed, and the problem of each row that cannot be sent. Unchanged rows are not sent. */
export function changedRows(loops: LoopRegion[], drafts: Record<string, RegionDraft>): { changes: RegionChange[]; errors: Record<string, string> } {
  const changes: RegionChange[] = [];
  const errors: Record<string, string> = {};
  for (const l of loops) {
    const d = drafts[l.loopId];
    if (!d) continue;
    const p = parseDraft(d);
    if (p.error) { errors[l.loopId] = p.error; continue; }
    const same = p.pvMin === l.regionMin && p.pvMax === l.regionMax;
    if (same) continue;
    if (p.pvMin == null && l.source !== 'LOOP') continue;                    // nothing of its own to clear
    changes.push({ loopId: l.loopId, pvMin: p.pvMin, pvMax: p.pvMax });
  }
  return { changes, errors };
}

/** True when a region reaches outside the loop's PV range (the server warns too). */
export const outsideRange = (l: LoopRegion, min: number | null, max: number | null) =>
  min != null && max != null && l.pvRangeMin != null && l.pvRangeMax != null && (min < l.pvRangeMin || max > l.pvRangeMax);

const APPROVABLE = new Set(['VALIDATED', 'SHADOW_EVALUATED']);
const DEPLOYABLE = new Set(['APPROVED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']);

export interface BatchAction { label: string; enabled: boolean; reason: string | null }

/**
 * The approve button of a batch, decided from the viewer as the server decides it: someone other than the author approves;
 * the author approves alone only as Admin or SuperAdmin (recorded as a self-approval); otherwise a second person is needed.
 */
export function approveAction(batch: Batch | undefined, viewer: Viewer, canApprove: boolean): BatchAction {
  const waiting = !!batch?.rows.some(r => APPROVABLE.has(r.state) && !r.error);
  const { mine, admin } = standing(batch?.createdBy ?? batch?.rows.find(r => r.createdBy)?.createdBy ?? null, viewer);
  const label = mine && admin ? 'Approve alone (Admin)' : 'Approve';
  if (!canApprove) return { label, enabled: false, reason: 'Your account cannot approve' };
  if (!waiting) return { label, enabled: false, reason: null };
  if (mine && !admin) return { label, enabled: false, reason: 'Needs a second person' };
  return { label, enabled: true, reason: null };
}

/** Deploy: every approved row (or one whose deployment failed) gets its deployment. */
export function deployAction(batch: Batch | undefined, canDeploy: boolean): BatchAction {
  const ready = !!batch?.rows.some(r => DEPLOYABLE.has(r.state) && !r.error);
  if (!canDeploy) return { label: 'Deploy', enabled: false, reason: 'Your account cannot deploy' };
  return { label: 'Deploy', enabled: ready, reason: null };
}
