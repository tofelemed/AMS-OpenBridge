// CHG-170 (owner answers 1, 2, 3c): four tiles in the Overview card style, tone + glyph + word - Required jobs, Last fused verdict
// (moved in from the Telemetry card; the Overview's rule, Stale above 60 min), Checkpoint age, Checkpoints ok / failed. A tile
// opens what is behind it: it selects the job behind its number. Under the verdict tile, Stale and Never evaluated open the
// Overview's own drill-downs. Value and tone of Required jobs come from one read (the rows the list shows).
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setActiveZone } from '../../../cpa/activeZone';
import PipelineTiles, { type VerdictTileData } from './PipelineTiles';
import type { JobRow } from './mergeJobs';

beforeAll(() => setActiveZone('UTC'));
afterEach(cleanup);

const NOW = Date.parse('2026-11-11T12:00:00Z');
const row = (name: string, state: string, age: number | null, failed = 0, required = true): JobRow => ({
  name, role: required ? 'cplm' : null, state, running: state === 'RUNNING', required, jid: 'j', startTime: null, uptimeSec: 60,
  checkpoint: age == null ? null : { completed: 100, failed, lastDurationMs: 10, lastSizeBytes: 1, lastCompletedAgeSec: age },
});
const verdict = (over: Partial<VerdictTileData> = {}): VerdictTileData => ({
  freshness: { at: Date.parse('2026-11-07T11:45:00Z'), ageMs: NOW - Date.parse('2026-11-07T11:45:00Z'), stale: true, freshMs: 3_600_000 },
  loading: false, failed: false, stale: 165, neverEvaluated: 76,
  staleHref: '/cpm?review=stale&window=12h', neverHref: '/cpm?review=never-evaluated&window=12h', ...over,
});
const base = {
  statusLoaded: true, statusError: false, engineAnswering: true, numbersRead: true, verdict: verdict(),
  onSelect: () => {}, onList: () => {},
};
const lab = [
  row('AMS - Alarm State Machine', 'MISSING', null), row('AMS - CPLM Short Feature Engine', 'RUNNING', 126),
  row('AMS - CPLM Instrument Context Engine', 'RUNNING', 228), row('AMS - CPLM Condition Engine', 'RUNNING', 42),
];
const mount = (props: Partial<React.ComponentProps<typeof PipelineTiles>> = {}) =>
  render(<MemoryRouter><PipelineTiles {...base} rows={lab} {...props} /></MemoryRouter>);
const tile = (label: string) => screen.getByText(label).closest('.cpm-kpicard') as HTMLElement;

describe('PipelineTiles', () => {
  it('shows the four tiles in order, each with label, number and one line', () => {
    const { container } = mount();
    expect([...container.querySelectorAll('.cpm-kpicard__label')].map(e => e.textContent))
      .toEqual(['Required jobs', 'Last fused verdict', 'Checkpoint age', 'Checkpoints ok / failed']);
    expect(within(tile('Required jobs')).getByText('3/4')).toBeTruthy();
    expect(tile('Required jobs').textContent).toContain('✕1 missing · analysis engine answering');
    expect(tile('Required jobs').className).toContain('cpm-kpicard--bad');
    expect(within(tile('Checkpoint age')).getByText('3.8 min')).toBeTruthy();
    expect(within(tile('Checkpoint age')).getByText('oldest: CPLM Instrument Context Engine')).toBeTruthy();
    expect(within(tile('Checkpoints ok / failed')).getByText('300 / 0')).toBeTruthy();
    expect(tile('Checkpoints ok / failed').textContent).toContain('✓none failed · since job start');
  });

  it('selects the job behind each tile: the first not running, the oldest checkpoint, the most failures', () => {
    const onSelect = vi.fn();
    const onList = vi.fn();
    mount({ onSelect, onList });
    fireEvent.click(tile('Required jobs'));
    expect(onSelect).toHaveBeenLastCalledWith('AMS - Alarm State Machine');
    fireEvent.click(tile('Checkpoint age'));
    expect(onSelect).toHaveBeenLastCalledWith('AMS - CPLM Instrument Context Engine');
    fireEvent.click(tile('Checkpoints ok / failed'));
    expect(onList).toHaveBeenCalledTimes(1);
    cleanup();
    const rows = [row('AMS - A', 'RUNNING', 10, 1), row('AMS - B', 'RUNNING', 10, 4)];
    mount({ rows, onSelect });
    fireEvent.click(tile('Checkpoints ok / failed'));
    expect(onSelect).toHaveBeenLastCalledWith('AMS - B');
    expect(tile('Checkpoints ok / failed').textContent).toContain('◐5 failed · since job start');
  });

  it('counts value and tone from the same rows, and reads transitional jobs as starting', () => {
    mount({ rows: [row('AMS - A', 'RUNNING', 1), row('AMS - B', 'RESTARTING', null)] });
    expect(within(tile('Required jobs')).getByText('1/2')).toBeTruthy();
    expect(tile('Required jobs').className).toContain('cpm-kpicard--warn');
    expect(tile('Required jobs').textContent).toContain('◐1 starting');
    cleanup();
    mount({ rows: [row('AMS - A', 'RUNNING', 1), row('AMS - X', 'RUNNING', 1, 0, false)] });
    expect(within(tile('Required jobs')).getByText('1/1')).toBeTruthy();
    expect(tile('Required jobs').className).toContain('cpm-kpicard--good');
    expect(tile('Required jobs').textContent).toContain('✓analysis engine answering');
  });

  it('reads the last fused verdict by the Overview rule, Stale, with the two drill-downs under it', () => {
    mount();
    const v = tile('Last fused verdict');
    expect(within(v).getByText('96 h')).toBeTruthy();
    expect(v.textContent).toContain('window ended 7 Nov 11:45 UTC');
    expect(v.className).toContain('cpm-kpicard--warn');
    expect(v.textContent).toContain('◐Stale · 165 loops ↗');
    expect(within(v).getByRole('link', { name: '165 loops ↗' }).getAttribute('href')).toBe('/cpm?review=stale&window=12h');
    expect(within(v).getByRole('link', { name: 'Never evaluated 76 ↗' }).getAttribute('href')).toBe('/cpm?review=never-evaluated&window=12h');
  });

  it('shows a fresh verdict in minutes, without links for counts of zero', () => {
    mount({ verdict: verdict({ freshness: { at: NOW - 18 * 60_000, ageMs: 18 * 60_000, stale: false, freshMs: 3_600_000 }, stale: 0, neverEvaluated: 0 }) });
    const v = tile('Last fused verdict');
    expect(within(v).getByText('18 min')).toBeTruthy();
    expect(v.className).toContain('cpm-kpicard--good');
    expect(within(v).queryAllByRole('link')).toHaveLength(0);
  });

  it('says when no result is stored yet, and when the read failed', () => {
    mount({ verdict: verdict({ freshness: { at: null, ageMs: null, stale: false, freshMs: 3_600_000 } }) });
    expect(within(tile('Last fused verdict')).getByText('none stored yet')).toBeTruthy();
    cleanup();
    mount({ verdict: verdict({ freshness: undefined, failed: true, stale: null, neverEvaluated: null }) });
    expect(within(tile('Last fused verdict')).getByText('—')).toBeTruthy();
    expect(within(tile('Last fused verdict')).getByText('could not be read')).toBeTruthy();
  });

  it('reads the engine down as not answering, with the checkpoint tiles not read', () => {
    mount({ rows: lab.map(r => ({ ...r, state: 'MISSING', running: false, checkpoint: null })), engineAnswering: false, numbersRead: false });
    expect(within(tile('Required jobs')).getByText('0/4')).toBeTruthy();
    expect(tile('Required jobs').textContent).toContain('✕analysis engine not answering');
    expect(tile('Required jobs').textContent).not.toContain('missing');
    expect(within(tile('Checkpoint age')).getByText('—')).toBeTruthy();
    expect(within(tile('Checkpoint age')).getByText('not read')).toBeTruthy();
    expect(within(tile('Checkpoints ok / failed')).getByText('not read')).toBeTruthy();
    expect(within(tile('Last fused verdict')).getByText('96 h')).toBeTruthy();
  });

  it('keeps the status failure words', () => {
    mount({ statusError: true });
    expect(within(tile('Required jobs')).getByText('—')).toBeTruthy();
    expect(within(tile('Required jobs')).getByText('status endpoint unreachable')).toBeTruthy();
  });
});
