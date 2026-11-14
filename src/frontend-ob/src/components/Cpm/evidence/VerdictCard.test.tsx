// v2.5 workbench: the reading column opens with the answer - the gate's status, one plain sentence,
// the key numbers as tiles.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VerdictCard } from './VerdictCard';
import type { GateState } from './GateResultState';

afterEach(cleanup);
const ready: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };

describe('VerdictCard', () => {
  it('shows the status pill, the sentence and one tile per headline', () => {
    render(<VerdictCard gate="G5" name="Oscillation (ACF)" status="WARN" reason="BANDWIDTH" state={ready}
      sentence="G5 Oscillation (ACF): WARN — ACF period 290.2 s; limited by the 5 s acquisition grid (BANDWIDTH)."
      headline={[{ label: 'ACF period', value: '290.2', unit: 's' }, { label: 'Regularity', value: '1.000' }, { label: 'Accepted cycles', value: '33' }]} />);
    expect(screen.getByRole('region', { name: 'Verdict' }).textContent).toContain('WARN');
    expect(screen.getByText(/limited by the 5 s acquisition grid/)).toBeTruthy();
    expect(screen.getByText('ACF period')).toBeTruthy();
    expect(screen.getByText('290.2 s')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('draws no tiles for a non-ready state: the state panel under the card names it, once', () => {
    const notRetained: GateState = { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run', detail: 'd', stillValid: 's', action: 'RECONSTRUCT', tone: 'muted' };
    render(<VerdictCard gate="G3" name="Base performance" status="PASS" reason={null} state={notRetained} sentence="G3 Base performance: PASS."
      headline={[{ label: 'MAE', value: '1.2' }]} />);
    expect(screen.getByText('G3 Base performance: PASS.')).toBeTruthy();
    expect(screen.queryByText('MAE')).toBeNull();
    expect(screen.queryByText('Evidence not retained for this run')).toBeNull();
  });
});
