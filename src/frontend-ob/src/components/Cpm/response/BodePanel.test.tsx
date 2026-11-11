// CHG-165: the Frequency tab. Without a Bode the tab says why in one line (not a full panel); the margins are listed either way,
// a margin the kernel did not claim stated with its reason, never as 0.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { BodePanel } from './BodePanel';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({ ObcButton: (p: { children?: React.ReactNode }) => React.createElement('button', null, p.children) }));
afterEach(cleanup);
const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});

describe('BodePanel', () => {
  it('says in one line why there is no frequency response, and lists the margins as not claimed', () => {
    render(<BodePanel bode={undefined} metrics={[q({ quantityId: 'gain_margin', reasonIfNull: 'MODEL_NOT_VALIDATED' }), q({ quantityId: 'phase_margin', reasonIfNull: 'MODEL_NOT_VALIDATED' })]} controller={undefined} />);
    expect(screen.getByRole('note').textContent).toMatch(/^Frequency response not drawnModel not validated\. It needs a validated model/);
    expect(screen.queryByText('Frequency response not available')).toBeNull();
    expect(screen.getByText('Gain margin')).toBeTruthy();
    expect(screen.getAllByText('not claimed')).toHaveLength(2);                       // the reason once, in the note
    expect(screen.queryByText(/not applicable/)).toBeNull();
  });

  it('draws nothing of its own about the arrays when the margins stand (the tab notes the arrays)', () => {
    render(<BodePanel bode={undefined} metrics={[q({ quantityId: 'gain_margin', value: 6.2, unit: 'dB' })]} controller={undefined} />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByText('6.20 dB')).toBeTruthy();
  });
});
