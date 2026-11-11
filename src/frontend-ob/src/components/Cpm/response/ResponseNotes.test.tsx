// CHG-165: one note per tab when a run's arrays were not kept (with the way to rebuild them), and the reported quantities
// of the Response tab: the ones the result row does not already say.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { ArraysNote, arraysState, ReportedQuantities } from './ResponseNotes';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);
const manifest = (readiness: string, gates: string[] = []) => ({ methodRunId: 'r1', readiness, count: gates.length, artifacts: gates.map(g => ({ gate: g, kind: 'x', readiness: 'COMPLETE' })) }) as unknown as EvidenceManifest;
const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});
const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;

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
  it('says the values stand and opens the run in the Workbench to rebuild the arrays', () => {
    render(<MemoryRouter><ArraysNote state="NOT_KEPT" loopId="FIC1" methodRunId="r1" /><Where /></MemoryRouter>);
    expect(screen.getByRole('note').textContent).toMatch(/^Arrays not kept for this runThe result and every value stand\./);
    fireEvent.click(screen.getByText('Reconstruct in the Workbench ↗'));
    expect(screen.getByTestId('where').textContent).toMatch(/methodRun=r1/);
    expect(screen.getByTestId('where').textContent).toMatch(/gate=G12/);
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
