// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GateLegend } from './GateLegend';

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

  it('shows the common marks in one row when compact, and the rest behind Full key', () => {
    render(<GateLegend compact />);
    expect(screen.getByText('symptom seen')).toBeTruthy();
    expect(screen.queryByText('ruled out')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Full key' }));
    expect(within(screen.getByRole('dialog', { name: 'Gate status key' })).getByText('ruled out')).toBeTruthy();
  });
});
