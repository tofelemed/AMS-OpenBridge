// CHG-200 (final test #21, the dialog standard): the Measured vs required dialog has its subtitle on the band and a Close in its
// foot, as every other dialog (it had the ✕ only).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MeasuredCheck } from './MeasuredCheck';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; variant?: string }) => React.createElement('button', { onClick: p.onClick, 'data-variant': p.variant }, p.children),
}));
vi.mock('./ExplainWhy', () => ({
  ExplainWhy: () => React.createElement('p', null, 'the measured values'),
  hasCauses: () => false,
  useWhy: () => ({ rows: [{ key: 'a' }], open: [], loading: false }),
}));
afterEach(cleanup);

describe('MeasuredCheck', () => {
  it('opens its dialog with the subtitle and a Close in the foot that closes it', () => {
    render(<MeasuredCheck {...({} as React.ComponentProps<typeof MeasuredCheck>)} subtitle="FIC10401 · G5 Oscillation (ACF)" />);
    fireEvent.click(screen.getByRole('button', { name: 'Measured vs required' }));
    const d = screen.getByRole('dialog', { name: 'Measured vs required' });
    expect(d.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC10401 · G5 Oscillation (ACF)');
    const close = within(d.querySelector('.ui-dialog__foot') as HTMLElement).getByRole('button', { name: 'Close' });
    expect(close.getAttribute('data-variant')).toBe('flat');
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
