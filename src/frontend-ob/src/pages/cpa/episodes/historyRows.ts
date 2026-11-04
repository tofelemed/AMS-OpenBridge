/**
 * The History list: state changes from the episode itself, operator actions from
 * `GET /events/{id}/actions`, and the notes linked to it, newest first.
 */
import type { CpmEventAction, CpmEventFrame } from '../../../api/cpmApi';
import type { LoopNote } from '../../../api/cpm/investigations';
import { ACTION_VIEW } from '../../../components/Cpm/events/shelfState';
import { codeLabel, phrase } from '../../../components/Cpm/vocabulary';
import { siteDateTime } from '../../../cpa/siteTime';
import { NEUTRAL, episodeTone, type ToneResult } from '../../../ui/statusTones';
import type { BadgeView } from './episodeView';

export interface HistoryRow extends BadgeView {
  key: string;
  at: number;
  time: string;
  who: string | null;
  detail: string | null;
}

const ACTION_TONE: Partial<Record<CpmEventAction['action'], ToneResult>> = {
  ACKNOWLEDGED: episodeTone('ACKNOWLEDGED'),
  SHELVED: episodeTone('SHELVED'),
  SHELVE_UPDATED: episodeTone('SHELVED'),
  UNSHELVED: NEUTRAL,
  SHELVE_EXPIRED: episodeTone('SHELF_EXPIRED'),
};

function actionRow(a: CpmEventAction, tz: string): HistoryRow {
  const detail = [a.until ? `until ${siteDateTime(a.until, tz)}` : '', a.reason ?? ''].filter(Boolean).join(' · ');
  return {
    key: `action-${a.id}`,
    at: Date.parse(a.at),
    time: siteDateTime(a.at, tz),
    // An action this code cannot name is shown, in words, as unknown.
    ...(ACTION_TONE[a.action] ?? { tone: 'unknown' as const }),
    label: ACTION_VIEW[a.action]?.label ?? codeLabel(a.action),
    who: a.actor,
    detail: detail || null,
  };
}

function noteRow(n: LoopNote, tz: string): HistoryRow {
  return {
    key: `note-${n.refId}`,
    at: Date.parse(n.createdAt),
    time: siteDateTime(n.createdAt, tz),
    ...NEUTRAL,
    label: 'Note',
    who: n.createdBy,
    detail: `${codeLabel(n.outcome)}: ${n.note}`,
  };
}

function stateRows(e: CpmEventFrame, tz: string): HistoryRow[] {
  const opened: HistoryRow = {
    key: 'opened', at: Date.parse(e.opened_at), time: siteDateTime(e.opened_at, tz), ...episodeTone('OPEN'), label: 'Opened', who: null, detail: null,
  };
  if (!e.closed_at) return [opened];
  return [opened, {
    key: 'closed',
    at: Date.parse(e.closed_at),
    time: siteDateTime(e.closed_at, tz),
    ...NEUTRAL,
    label: 'Closed',
    who: null,
    detail: e.close_reason ? phrase(e.close_reason) : null,
  }];
}

export function historyRows(e: CpmEventFrame, actions: CpmEventAction[], notes: LoopNote[], tz: string): HistoryRow[] {
  return [...stateRows(e, tz), ...actions.map(a => actionRow(a, tz)), ...notes.map(n => noteRow(n, tz))]
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}
