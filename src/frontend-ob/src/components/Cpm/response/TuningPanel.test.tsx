// CHG-215 (System Response plan 2f): the Frequency tab shows the tuning the event ran under (CENTUM P, I, D as sent), the
// advice when there is one (never applied), and the loop's tuning history; without tuning from the DCS it says so in one line.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ControllerTuningRow, ResponseSubgate } from '../../../api/cpm/response';

const state: { history: ControllerTuningRow[] } = { history: [] };
vi.mock('./useResponse', () => ({ useControllerTuning: () => ({ data: { history: state.history }, isError: false }) }));
import { TuningPanel, bandText, timeText } from './TuningPanel';

afterEach(() => { cleanup(); state.history = []; });

const snapshot = { form: 'IDEAL', raw_p: 40, raw_i: 30, raw_d: 0, effective_from: '2026-11-22T06:00:00Z', usable: true, reason: null };
const advised: ResponseSubgate = { state: 'EVALUATED', outputs: { p_band_pct: 55.5, ti_s: 42, td_s: null, lambda_s: 10, lambda_source: 'DEAD_TIME_RULE', kc: 0.9 } };
const row = (from: string, to: string | null, p: number, i: number | null): ControllerTuningRow => ({
  snapshotId: from, loopId: 'PIC1', validFrom: from, validTo: to, vendor: 'CENTUM', algorithmFamily: null, form: 'IDEAL',
  native: { raw_p: p, raw_i: i, raw_d: null }, normalized: null, adapterVersion: 'CENTUM_PB_1.0', source: 'DCS',
});
const table = (caption: string) => screen.getByRole('table', { name: caption });
const cells = (t: HTMLElement) => within(t).getAllByRole('row').slice(1).map(r => r.textContent);

describe('TuningPanel', () => {
  it('shows the tuning this event ran under as the DCS shows it', () => {
    render(<TuningPanel loopId="PIC1" snapshot={snapshot} advice={undefined} timeZone="UTC" />);
    expect(cells(table('Tuning this event ran under'))).toEqual(['P40 %', 'I30 s', 'Doff', 'Since2026-11-22 06:00:00']);
  });

  it('shows the advice, never applied, with where λ came from', () => {
    render(<TuningPanel loopId="PIC1" snapshot={snapshot} advice={advised} timeZone="UTC" />);
    expect(screen.getByText('Advice only, never applied')).toBeTruthy();
    expect(cells(table('Tuning advice for this model'))).toEqual(['P55.5 %', 'I42 s', 'Doff', 'λ10 s · dead time (default until approved)']);
  });

  it('says why there is no advice', () => {
    render(<TuningPanel loopId="PIC1" snapshot={snapshot} advice={{ state: 'WAITING', outputs: { reason: 'DEAD_TIME_ZERO' } }} timeZone="UTC" />);
    expect(screen.getByText('The model has no dead time.')).toBeTruthy();
    expect(screen.queryByText('Advice only, never applied')).toBeNull();
  });

  it('without tuning from the DCS says so in one line, and shows no advice', () => {
    render(<TuningPanel loopId="PIC1" snapshot={undefined} advice={{ state: 'WAITING', outputs: { reason: 'CONTROLLER_FORM_UNKNOWN' } }} timeZone="UTC" />);
    expect(screen.getByText('Tuning not received from the DCS.')).toBeTruthy();
    expect(screen.queryByText('Tuning advice')).toBeNull();
  });

  it('says when the tuning cannot be used for lack of a PV range', () => {
    render(<TuningPanel loopId="PIC1" snapshot={{ ...snapshot, usable: false, reason: 'PV_RANGE_NOT_SET' }} advice={undefined} timeZone="UTC" />);
    expect(screen.getByText('No PV range recorded: the margins and the advice need it.')).toBeTruthy();
  });

  it('lists the tuning history, newest first, the row in force marked', () => {
    state.history = [row('2026-11-22T06:00:00Z', null, 40, 30), row('2026-11-20T10:00:00Z', '2026-11-22T06:00:00Z', 50, null)];
    render(<TuningPanel loopId="PIC1" snapshot={snapshot} advice={undefined} timeZone="UTC" />);
    expect(cells(table('Controller tuning history of this loop'))).toEqual([
      '2026-11-22 06:00:00in force40 %30 soff',
      '2026-11-20 10:00:002026-11-22 06:00:0050 %offoff',
    ]);
  });

  it('formats values as the DCS does', () => {
    expect(bandText(40)).toBe('40 %');
    expect(bandText(null)).toBe('—');
    expect(timeText(0)).toBe('off');
    expect(timeText(null)).toBe('off');
    expect(timeText(12.345678)).toBe('12.35 s');
  });
});
