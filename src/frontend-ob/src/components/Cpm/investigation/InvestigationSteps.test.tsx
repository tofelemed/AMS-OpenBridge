// @vitest-environment jsdom
// CHG-186 (owner review item 8): each step but the last ends with Next as the tab's primary action, in the foot strip.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InvestigationSteps, stepOf } from './InvestigationSteps';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, 'data-variant': p.variant }, p.children),
}));
afterEach(cleanup);

describe('InvestigationSteps', () => {
  it('ends a step with Next as the primary (raised) button in the foot strip', () => {
    const onStep = vi.fn();
    const { container } = render(<InvestigationSteps step="Result" onStep={onStep}><p>body</p></InvestigationSteps>);
    const next = screen.getByRole('button', { name: 'Next: Evidence →' });
    expect(next.getAttribute('data-variant')).toBe('raised');
    expect(container.querySelector('.cpm-inv-steps__foot')?.contains(next)).toBe(true);
    fireEvent.click(next);
    expect(onStep).toHaveBeenCalledWith('Evidence');
  });

  it('has no Next on the last step', () => {
    render(<InvestigationSteps step="Review" onStep={() => {}}><p>body</p></InvestigationSteps>);
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
  });

  it('opens Evidence when a link names a gate or a card, else Result', () => {
    expect(stepOf(new URLSearchParams('gate=G5'))).toBe('Evidence');
    expect(stepOf(new URLSearchParams('tab=Windows&gate=G5'))).toBe('Windows');
    expect(stepOf(new URLSearchParams(''))).toBe('Result');
  });
});
