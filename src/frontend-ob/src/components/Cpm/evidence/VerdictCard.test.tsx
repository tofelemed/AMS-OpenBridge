// v2.5 workbench: the reading column opens with the answer - the gate's status, one plain sentence,
// the key numbers as tiles - and closes with the window's flags, each a fact with a tone.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VerdictCard, WindowFlags } from './VerdictCard';
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

  it('names a non-ready state in one line instead of tiles', () => {
    const notRetained: GateState = { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run', detail: 'd', stillValid: 's', action: 'RECONSTRUCT', tone: 'muted' };
    render(<VerdictCard gate="G3" name="Base performance" status="PASS" reason={null} state={notRetained} sentence="G3 Base performance: PASS." headline={[]} />);
    expect(screen.getByText('Evidence not retained for this run')).toBeTruthy();
  });
});

describe('WindowFlags', () => {
  it('lists observability flags, disqualifiers and the insufficient-evidence reason with tones', () => {
    render(<WindowFlags row={{ observabilityFlags: ['HAS_VP', 'NO_STEP_TEST'], familyDisqualifiers: ['stiction:FAMILY_DISQUALIFIED'], insufficientEvidenceReason: 'INSUFFICIENT_SAMPLES' }} />);
    expect(screen.getByText('Valve position mapped').closest('.cpm-pill')?.className).toContain('cpm-pill--good');
    expect(screen.getByText('No approved step test').closest('.cpm-pill')?.className).toContain('cpm-pill--warn');
    expect(screen.getByText('Stiction ruled out: its own checks failed').closest('.cpm-pill')?.className).toContain('cpm-pill--muted');
    expect(screen.getByText('Too few samples').closest('.cpm-pill')?.className).toContain('cpm-pill--warn');
  });

  it('says so when the window is not in the loaded list', () => {
    render(<WindowFlags row={undefined} />);
    expect(screen.getByText(/not among the loaded windows/)).toBeTruthy();
  });
});
