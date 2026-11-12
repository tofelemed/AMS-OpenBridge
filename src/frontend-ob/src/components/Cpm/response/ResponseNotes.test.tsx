// CHG-165: one note per tab when a run's arrays were not kept, and the reported quantities of the Response tab: the ones the
// result row does not already say. CHG-178: the note says the charts are not kept and how long charts are kept (from the
// events answer's retention), with no rebuild link: a G12 response event cannot be reconstructed.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { ArraysNote, arraysState, ReportedQuantities } from './ResponseNotes';

afterEach(cleanup);
const manifest = (readiness: string, gates: string[] = []) => ({ methodRunId: 'r1', readiness, count: gates.length, artifacts: gates.map(g => ({ gate: g, kind: 'x', readiness: 'COMPLETE' })) }) as unknown as EvidenceManifest;
const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});

describe('arraysState', () => {
  it('says not kept, removed or failed only when the run holds no G12 arrays', () => {
    expect(arraysState(undefined)).toBeNull();
    expect(arraysState(manifest('NONE'))).toBe('NOT_KEPT');
    expect(arraysState(manifest('EXPIRED'))).toBe('EXPIRED');
    expect(arraysState(manifest('FAILED'))).toBe('FAILED');
    expect(arraysState(manifest('COMPLETE', ['G12']))).toBeNull();
    expect(arraysState(manifest('PENDING'))).toBeNull();
  });
});

describe('ArraysNote', () => {
  it('says the values stand, how long charts are kept, and offers no rebuild', () => {
    render(<ArraysNote state="NOT_KEPT" retention={{ acceptedDays: 30, censoredDays: 7, censoredChartHours: 6 }} />);
    expect(screen.getByRole('note').textContent).toBe(
      'Charts not keptThe result and every value stand. Charts are kept 30 days for accepted events and 6 h for censored candidates; they cannot be rebuilt.');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Workbench/)).toBeNull();
  });

  it('says for ever when accepted charts are never removed', () => {
    render(<ArraysNote state="NOT_KEPT" retention={{ acceptedDays: null, censoredDays: null, censoredChartHours: 6 }} />);
    expect(screen.getByRole('note').textContent).toMatch(/Charts are kept for ever for accepted events and 6 h for censored candidates;/);
  });

  it('says the charts are not stored when the answer carries no retention', () => {
    render(<ArraysNote state="NOT_KEPT" />);
    expect(screen.getByRole('note').textContent).toBe(
      'Charts not keptThe result and every value stand. Charts are not stored for this event and cannot be rebuilt.');
  });

  it('keeps the removed and failed headings in chart words', () => {
    render(<><ArraysNote state="EXPIRED" /><ArraysNote state="FAILED" /></>);
    expect(screen.getByText('Charts removed by retention')).toBeTruthy();
    expect(screen.getByText('Charts failed verification')).toBeTruthy();
  });
});

describe('ReportedQuantities', () => {
  it('lists the reported key results the result row does not say, and the count of the catalogue', () => {
    const metrics = [
      q({ quantityId: 'process_gain', value: 0.21, method: 'MODEL_FOPDT' }),
      q({ quantityId: 'iae', value: 9.6, unit: 'PV_EU*s' }),
      q({ quantityId: 'overshoot', reasonIfNull: 'NO_OVERSHOOT' }),
      q({ quantityId: 'baseline_pv', value: 3 }),
    ];
    render(<ReportedQuantities metrics={metrics} pvUnit="m3/h" />);
    expect(screen.getByText('IAE')).toBeTruthy();
    expect(screen.getByText('9.60 m3/h*s')).toBeTruthy();
    expect(screen.queryByText('Process gain K')).toBeNull();
    expect(screen.queryByText('Overshoot')).toBeNull();
    expect(screen.getByText('3 of 4 reported')).toBeTruthy();
  });
});
