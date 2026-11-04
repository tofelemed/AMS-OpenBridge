import { describe, expect, it } from 'vitest';
import type { CpmEventAction } from '../../../api/cpmApi';
import type { LoopNote } from '../../../api/cpm/investigations';
import {
  acknowledgementView, availabilityView, byline, conditionView, durationText, episodeTitle, filterHref, openEvidenceHref,
  openLoopHref, peakView, severityView, shelfView, stateLine, summaryText, supportText, verdictLabel, verdictView,
} from './episodeView';
import { historyRows } from './historyRows';
import { frame } from './testFrame';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-04T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('episode labels', () => {
  it('names the family and the peak', () => {
    expect(episodeTitle(frame({ family: 'OSCILLATION', peak_diagnosis: 'CONFIRMED_OSCILLATION' }))).toBe('Sustained oscillation, peak confirmed');
    expect(episodeTitle(frame({ family: 'OSCILLATION', peak_diagnosis: 'SOMETHING_NEW' }))).toBe('Sustained oscillation');
  });

  it('keeps severity now apart from the peak (D-37)', () => {
    const e = frame({ severity: 'LOW', peak_diagnosis: 'CONFIRMED_OSCILLATION' });
    expect(severityView(e)).toEqual({ tone: 'neutral', label: 'Low' });
    expect(peakView(e)).toEqual({ tone: 'warning', glyph: '▲', label: 'Confirmed' });
  });

  it('never derives a missing severity or verdict', () => {
    expect(severityView(frame({ severity: null }))).toBeNull();
    expect(verdictView(frame({ last_diagnosis: null }))).toBeNull();
  });

  it('reads each band in its CD8 tone', () => {
    expect(verdictView(frame({ last_diagnosis: 'SUSPECTED_OSCILLATION' }))?.tone).toBe('info');
    expect(verdictView(frame({ last_diagnosis: 'CONFIRMED_OSCILLATION' }))?.tone).toBe('warning');
    expect(verdictView(frame({ last_diagnosis: 'NO_CALL' }))?.tone).toBe('neutral');
    expect(verdictView(frame({ last_diagnosis: 'INSUFFICIENT_DATA' }))).toEqual({ tone: 'unknown', label: 'Not evaluated: not enough data' });
  });

  it.each([
    ['EXCLUDED_MODE', 'Excluded: loop not in automatic'],
    ['EXCLUDED_OPERATING_REGION', 'Excluded: outside operating region'],
    ['EXCLUDED_INSTRUMENT_HEALTH', 'Excluded: instrument fault'],
    ['EXCLUDED_SENSOR', 'Excluded: sensor fault'],
    ['EXCLUDED_DATA_QUALITY', 'Excluded: data not qualified'],
    ['EXCLUDED_SOMETHING_NEW', 'Excluded: something new'],
  ])('%s has its own label (RD11, D-15)', (code, label) => {
    expect(verdictLabel(code)).toBe(label);
  });
});

describe('ISA-18.2 tones (CD8)', () => {
  it('unacknowledged is warning, acknowledged is info', () => {
    expect(acknowledgementView(frame({ ack_state: 'UNACKNOWLEDGED' }))).toEqual({ tone: 'warning', label: 'Unacknowledged' });
    expect(acknowledgementView(frame({ ack_state: 'ACKNOWLEDGED' }))).toEqual({ tone: 'info', label: 'Acknowledged' });
  });

  it('a row the shelving conversion has not reached is still unreviewed', () => {
    expect(acknowledgementView(frame({ ack_state: 'SHELVED' })).label).toBe('Unacknowledged');
  });

  it('shelved is neutral', () => {
    const view = shelfView(frame({ shelf_state: 'SHELVED', shelve_until: iso(NOW + 3 * HOUR) }), NOW);
    expect(view).toEqual({ tone: 'neutral', label: 'Shelved', detail: 'expires in 3.0 h' });
  });

  it('shelf expired and unreviewed is warning', () => {
    const view = shelfView(frame({ shelf_state: 'EXPIRED', shelve_until: iso(NOW - HOUR) }), NOW);
    expect(view?.tone).toBe('warning');
    expect(view?.label).toBe('Shelf expired, unreviewed');
  });

  it('a shelf past its expiry reads expired before the sweeper marks it', () => {
    expect(shelfView(frame({ shelf_state: 'SHELVED', shelve_until: iso(NOW - HOUR) }), NOW)?.label).toBe('Shelf expired, unreviewed');
  });

  it('a reviewed episode whose shelf expired is neutral', () => {
    const view = shelfView(frame({ shelf_state: 'EXPIRED', ack_state: 'ACKNOWLEDGED', shelve_until: iso(NOW - HOUR) }), NOW);
    expect(view).toMatchObject({ tone: 'neutral', label: 'Shelf expired' });
  });

  it('no shelf is no badge', () => {
    expect(shelfView(frame({ shelf_state: 'NONE' }), NOW)).toBeNull();
  });
});

describe('condition and availability are separate fields', () => {
  it('reads each on its own', () => {
    const e = frame({ condition_state: 'OPEN', availability_state: 'UNOBSERVABLE' });
    expect(conditionView(e)).toEqual({ tone: 'warning', label: 'Open' });
    expect(availabilityView(e)).toEqual({ tone: 'warning', label: 'Unobservable' });
    expect(stateLine(e)).toBe('Still open: newest window not judged.');
  });

  it('a closed condition does not change availability', () => {
    const e = frame({ condition_state: 'CLOSED', closed_at: iso(NOW), availability_state: 'OBSERVED', close_reason: 'RECOVERED' });
    expect(conditionView(e)).toEqual({ tone: 'neutral', label: 'Closed' });
    expect(availabilityView(e)).toEqual({ tone: 'neutral', label: 'Observed' });
  });

  it('a row with no availability is unknown, never observed', () => {
    const e = frame({ availability_state: null });
    expect(availabilityView(e)).toEqual({ tone: 'unknown', label: 'Unknown' });
    expect(stateLine(e)).toBe('Recorded before availability was tracked.');
  });
});

describe('numbers', () => {
  it('a closed episode lasts from open to close', () => {
    expect(durationText(frame({ opened_at: iso(NOW - 2 * HOUR), closed_at: iso(NOW), condition_state: 'CLOSED' }), NOW)).toBe('2 h');
  });

  it('an open episode runs to now and says so', () => {
    expect(durationText(frame({ opened_at: iso(NOW - 72 * HOUR), closed_at: null }), NOW)).toBe('3.0 d, open');
  });

  it('a closed episode with no close time has no duration', () => {
    expect(durationText(frame({ closed_at: null, condition_state: 'CLOSED' }), NOW)).toBe('—');
  });

  it('missing support is null and a real 0 stays 0', () => {
    expect(supportText(null)).toBeNull();
    expect(supportText(0)).toBe('0.0 h');
    expect(supportText(3 * HOUR)).toBe('3.0 h');
    expect(supportText(72 * HOUR)).toBe('3.0 d');
  });

  it('the summary leaves out a missing score', () => {
    expect(summaryText(frame({ peak_confidence: null as unknown as number }))).not.toMatch(/peaking/);
    expect(summaryText(frame({ peak_confidence: 0.9 }))).toMatch(/peaking at evidence score 90/);
  });

  it('a receipt uses the site zone', () => {
    expect(byline('eng.a', 'Asia/Dubai', Date.parse('2026-11-04T09:15:00Z'))).toMatch(/^by eng\.a at 4 Nov 2026, 13:15 /);
  });
});

describe('links carry the context', () => {
  const search = '?site=hdpe&area=a1&unit=u1&range=7d&window=12h&loop=OLD&event=9&sort=recent';
  const closed = frame({ id: 7, loop_id: 'FIC1', window_kind: '24h', opened_at: '2026-11-01T00:00:00.000Z', closed_at: '2026-11-02T00:00:00.000Z', condition_state: 'CLOSED' });
  const read = (href: string) => {
    const [path, query] = href.split('?');
    return { path, q: new URLSearchParams(query) };
  };

  it('Open loop goes to Diagnosis with the episode period as a custom range', () => {
    const { path, q } = read(openLoopHref(closed, search, NOW));
    expect(path).toBe('/cpm/loop');
    expect(q.get('tab')).toBe('diagnosis');
    expect(q.get('loop')).toBe('FIC1');
    expect(q.get('range')).toBe('custom');
    expect(q.get('from')).toBe(closed.opened_at);
    expect(q.get('to')).toBe(closed.closed_at);
    expect(q.get('window')).toBe('24h');
    expect(q.get('profile')).toBe('24h');
    expect(q.get('site')).toBe('hdpe');
    expect(q.get('unit')).toBe('u1');
    expect(q.get('event')).toBeNull();
  });

  it('an open episode ends now', () => {
    const { q } = read(openLoopHref(frame({ closed_at: null }), search, NOW));
    expect(q.get('to')).toBe(iso(NOW));
  });

  it('Open evidence opens this episode, up to its end, not the plant newest', () => {
    const { path, q } = read(openEvidenceHref(closed, search));
    expect(path).toBe('/cpm/evidence');
    expect(q.get('tab')).toBe('gates');
    expect(q.get('loop')).toBe('FIC1');
    expect(q.get('kind')).toBe('24h');
    expect(q.get('before')).toBe(closed.closed_at);
    expect(q.get('range')).toBe('7d');
  });

  it('a window kind the context does not know is left out', () => {
    expect(read(openEvidenceHref(frame({ window_kind: '15m' }), search)).q.get('window')).toBeNull();
  });

  it('a filter link keeps the order, the selection and the context', () => {
    const { path, q } = read(filterHref(search, 'closed'));
    expect(path).toBe('/cpm/events');
    expect(q.get('filter')).toBe('closed');
    expect(q.get('sort')).toBe('recent');
    expect(q.get('event')).toBe('9');
    expect(q.get('site')).toBe('hdpe');
    expect(q.get('loop')).toBe('OLD');
  });
});

describe('history', () => {
  const action = (over: Partial<CpmEventAction>): CpmEventAction => ({
    id: 1, eventId: 7, action: 'ACKNOWLEDGED', actor: 'eng.a', at: '2026-11-03T00:00:00Z', until: null, reason: null, ...over,
  });
  const note: LoopNote = {
    refId: 'n1', loopId: 'FIC1', methodRunId: null, evidenceIds: [], note: 'Valve serviced', outcome: 'WORK_COMPLETED', createdBy: 'eng.b',
    createdAt: '2026-11-02T12:00:00Z', updatedBy: null, updatedAt: '2026-11-02T12:00:00Z', pinned: false, eventId: 7,
  };

  it('merges state changes, operator actions and notes, newest first', () => {
    const rows = historyRows(
      frame({ opened_at: '2026-11-01T00:00:00Z', closed_at: '2026-11-04T00:00:00Z', condition_state: 'CLOSED', close_reason: 'RECOVERED' }),
      [
        action({ id: 1, action: 'SHELVED', at: '2026-11-02T00:00:00Z', until: '2026-11-02T08:00:00Z', reason: 'parts due' }),
        action({ id: 2, action: 'ACKNOWLEDGED', at: '2026-11-03T00:00:00Z' }),
      ],
      [note],
      'UTC',
    );
    expect(rows.map(r => r.label)).toEqual(['Closed', 'Acknowledged', 'Note', 'Shelved', 'Opened']);
    expect(rows[0].detail).toBe('recovered');
    expect(rows[1].tone).toBe('info');
    expect(rows[2]).toMatchObject({ who: 'eng.b', detail: 'Work completed: Valve serviced' });
    expect(rows[3].tone).toBe('neutral');
    expect(rows[3].detail).toMatch(/until 2 Nov 2026, 08:00 .* · parts due/);
  });

  it('an expired shelf is warning and an unknown action is words, not a raw code', () => {
    const rows = historyRows(frame({}), [
      action({ id: 1, action: 'SHELVE_EXPIRED' }),
      action({ id: 2, action: 'SOME_NEW_ACTION' as CpmEventAction['action'], at: '2026-11-02T00:00:00Z' }),
    ], [], 'UTC');
    expect(rows.find(r => r.label === 'Shelf expired')?.tone).toBe('warning');
    expect(rows.find(r => r.label === 'Some new action')?.tone).toBe('unknown');
  });
});
