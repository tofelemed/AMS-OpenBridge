// CHG-165: one note per tab when a run's arrays were not kept, and the reported quantities of the Response tab: the ones the
// result row does not already say. No rebuild link: a G12 response event cannot be reconstructed.
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

// CHG-195 (owner review item 19): one plain line, no retention sentence; removed and failed stay distinct; a censored event
// says why it has no fit instead of "Charts not kept"
describe('ArraysNote', () => {
  it('says in one plain line that the charts are not available, and offers no rebuild', () => {
    render(<ArraysNote state="NOT_KEPT" />);
    expect(screen.getByRole('note').textContent).toBe('Charts are not available for this event.');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/kept|rebuilt|Workbench/)).toBeNull();
  });

  it('keeps removed by retention and failed verification distinct, also plain', () => {
    render(<><ArraysNote state="EXPIRED" /><ArraysNote state="FAILED" /></>);
    expect(screen.getAllByRole('note').map(n => n.textContent)).toEqual([
      'Charts for this event were removed by retention.',
      'Charts for this event failed verification.',
    ]);
  });

  it('says a censored event was interrupted before the response finished, so no model was fitted', () => {
    render(<ArraysNote state="NOT_FITTED" />);
    expect(screen.getByRole('note').textContent).toBe('This event was interrupted before the response finished, so no model was fitted.');
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
    const { container } = render(<ReportedQuantities metrics={metrics} pvUnit="m3/h" />);
    expect(container.querySelector('.ui-table table')).toBeTruthy();                  // CHG-195: the standard table
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Quantity', 'Value']);
    expect(screen.getAllByRole('row')[1].textContent).toBe('IAE9.60 m3/h*s');
    expect(screen.getByText('IAE')).toBeTruthy();
    expect(screen.getByText('9.60 m3/h*s')).toBeTruthy();
    expect(screen.queryByText('Process gain K')).toBeNull();
    expect(screen.queryByText('Overshoot')).toBeNull();
    expect(screen.getByText('3 of 4 reported')).toBeTruthy();
  });
});
