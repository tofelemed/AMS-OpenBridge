// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GateKeyButton, GateLegend } from './GateLegend';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));

afterEach(cleanup);

describe('GateLegend', () => {
  it('shows every group by default', () => {
    render(<GateLegend />);
    expect(screen.getByText('No result')).toBeTruthy();
    expect(screen.getByText('ruled out')).toBeTruthy();
  });

  // CHG-158: no key printed on the page; one button opens it
  it('keeps the key behind a Gate key button until it is opened', () => {
    render(<GateKeyButton />);
    expect(screen.queryByText('symptom seen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gate key' }));
    const d = screen.getByRole('dialog', { name: 'Gate status key' });
    expect(within(d).getByText('ruled out')).toBeTruthy();
    expect(within(d).getByText('symptom seen')).toBeTruthy();
  });
});
