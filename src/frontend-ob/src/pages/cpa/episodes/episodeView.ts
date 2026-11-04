/**
 * How one episode reads on screen. Every field keeps its own label and tone (CD8): condition,
 * availability, acknowledgement and shelf are separate facts, and severity now is not the peak (D-37).
 * The values are the server's; this file only words them. A missing value stays missing.
 */
import type { CpmEventFrame } from '../../../api/cpmApi';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { evidenceScoreText } from '../../../components/Cpm/evidenceScore';
import { availabilityCopy, availabilityOf, conditionOf, supportCopy } from '../../../components/Cpm/events/eventsState';
import { isAcknowledged, shelfCountdown, shelfState } from '../../../components/Cpm/events/shelfState';
import { fmtDuration } from '../../../components/Cpm/shared';
import { BAND_WORD, bandOf, codeLabel, diagnosisLabel, phrase } from '../../../components/Cpm/vocabulary';
import { siteDateTime } from '../../../cpa/siteTime';
import { NEUTRAL, diagnosisTone, episodeTone, type ToneResult } from '../../../ui/statusTones';

export interface BadgeView extends ToneResult {
  label: string;
}

export const NOT_RECORDED = 'Not recorded';

/** Why a write is unavailable to this user. The same wording as a refused route (UI-005). */
export const NEEDS_MANAGE = 'Not available for your role. Needs the cpm.manage permission.';

/** The current verdict. Exclusions name their own cause through the shared vocabulary (D-15). */
export const verdictLabel = diagnosisLabel;

const bandBadge = (code: string | null | undefined): ToneResult => diagnosisTone(bandOf(code));

/** "Oscillation, peak confirmed". */
export function episodeTitle(e: Pick<CpmEventFrame, 'family' | 'peak_diagnosis'>): string {
  const band = bandOf(e.peak_diagnosis);
  const family = codeLabel(e.family);
  return band === 'OTHER' ? family : `${family}, peak ${BAND_WORD[band].toLowerCase()}`;
}

/** The highest band the episode reached. Not the severity field, which follows the newest verdict (D-37). */
export function peakView(e: Pick<CpmEventFrame, 'peak_diagnosis'>): BadgeView {
  const band = bandOf(e.peak_diagnosis);
  return { ...bandBadge(e.peak_diagnosis), label: band === 'OTHER' ? diagnosisLabel(e.peak_diagnosis) : BAND_WORD[band] };
}

/** The newest verdict, or null when the server holds none. Never reads as "not evaluated". */
export function verdictView(e: Pick<CpmEventFrame, 'last_diagnosis'>): BadgeView | null {
  if (!e.last_diagnosis) return null;
  return { ...bandBadge(e.last_diagnosis), label: verdictLabel(e.last_diagnosis) };
}

/** Severity is a neutral badge (CD8). Null when the server holds none: it is not derived from the peak. */
export function severityView(e: Pick<CpmEventFrame, 'severity'>): BadgeView | null {
  return e.severity ? { ...NEUTRAL, label: codeLabel(e.severity) } : null;
}

export function acknowledgementView(e: Pick<CpmEventFrame, 'ack_state'>): BadgeView {
  return isAcknowledged(e)
    ? { ...episodeTone('ACKNOWLEDGED'), label: 'Acknowledged' }
    : { ...episodeTone('UNACKNOWLEDGED'), label: 'Unacknowledged' };
}

export function conditionView(e: Pick<CpmEventFrame, 'closed_at' | 'condition_state'>): BadgeView {
  return conditionOf(e) === 'OPEN' ? { ...episodeTone('OPEN'), label: 'Open' } : { ...NEUTRAL, label: 'Closed' };
}

export function availabilityView(e: Pick<CpmEventFrame, 'availability_state'>): BadgeView {
  const a = availabilityOf(e);
  if (a === 'UNOBSERVABLE') return { tone: 'warning', label: 'Unobservable' };
  if (a === 'OBSERVED') return { ...NEUTRAL, label: 'Observed' };
  return { tone: 'unknown', label: 'Unknown' };
}

export interface ShelfView extends BadgeView {
  detail: string;
}

/** ISA-18.2 (CD8): shelved is neutral, and a shelf that expired on an unreviewed episode is warning. Null: not shelved. */
export function shelfView(
  e: Pick<CpmEventFrame, 'ack_state' | 'shelve_until' | 'shelf_state'>, now: number,
): ShelfView | null {
  const state = shelfState(e, now);
  if (!state) return null;
  const detail = shelfCountdown(e.shelve_until, now);
  if (state === 'ACTIVE') return { ...episodeTone('SHELVED'), label: 'Shelved', detail };
  return isAcknowledged(e)
    ? { ...NEUTRAL, label: 'Shelf expired', detail }
    : { ...episodeTone('SHELF_EXPIRED'), label: 'Shelf expired, unreviewed', detail };
}

/** One line on what the two states mean together. */
export function stateLine(e: CpmEventFrame): string {
  const availability = availabilityOf(e);
  if (availability === 'LEGACY') return 'Recorded before availability was tracked.';
  if (availability === 'UNOBSERVABLE' && conditionOf(e) === 'OPEN') return 'Still open: newest window not judged.';
  return availabilityCopy(e);
}

/** The one-paragraph summary, as implemented. */
export function summaryText(e: CpmEventFrame): string {
  const score = evidenceScoreText(e.peak_confidence);
  const peak = score ? `, peaking at ${score}` : '';
  const latest = e.last_diagnosis && e.last_diagnosis !== e.peak_diagnosis
    ? `; the latest window reports ${verdictLabel(e.last_diagnosis).toLowerCase()}`
    : '';
  return `The ${phrase(e.family)} family was reported across ${supportCopy(e)}${peak}${latest}.`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** An open episode runs to now and says so. A closed one with no close time has no duration. */
export function durationText(e: Pick<CpmEventFrame, 'opened_at' | 'closed_at' | 'condition_state'>, now: number): string {
  const open = conditionOf(e) === 'OPEN';
  const start = Date.parse(e.opened_at);
  const end = e.closed_at ? Date.parse(e.closed_at) : open ? now : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const ms = Math.max(0, end - start);
  const text = ms >= 2 * DAY ? `${(ms / DAY).toFixed(1)} d` : fmtDuration(ms);
  return open ? `${text}, open` : text;
}

/** Null when the server holds no value. A real 0 stays 0. */
export function supportText(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return ms >= 2 * DAY ? `${(ms / DAY).toFixed(1)} d` : `${(ms / HOUR).toFixed(1)} h`;
}

/** "by eng.a at 4 Nov 2026, 13:15 GST". */
export const byline = (user: string | null | undefined, tz: string, at: number = Date.now()): string =>
  `${user ? `by ${user} ` : ''}at ${siteDateTime(at, tz)}`;

const windowKindOf = (kind: string) => (kind === '12h' || kind === '24h' ? kind : undefined);

/** Loop › Diagnosis with the episode's period as the range. An open episode runs to now. */
export const openLoopHref = (e: CpmEventFrame, search: string, now: number): string =>
  cpaHref('/cpm/loop', search, {
    loop: e.loop_id,
    tab: 'diagnosis',
    range: 'custom',
    from: e.opened_at,
    to: e.closed_at ?? new Date(now).toISOString(),
    window: windowKindOf(e.window_kind),
    profile: e.window_kind,
  });

/**
 * Evidence › Gates for this episode's window kind, up to the episode's end. The episode does not
 * record which window was its peak, so this is as close as the API allows; the page says so.
 */
export const openEvidenceHref = (e: CpmEventFrame, search: string): string =>
  cpaHref('/cpm/evidence', search, {
    loop: e.loop_id,
    tab: 'gates',
    kind: e.window_kind,
    window: windowKindOf(e.window_kind),
    before: e.closed_at,
  });

/** This page under another state filter, keeping the order and the selected episode. */
export function filterHref(search: string, filter: string): string {
  const current = new URLSearchParams(search);
  return cpaHref('/cpm/events', current, { filter, sort: current.get('sort'), event: current.get('event') });
}
