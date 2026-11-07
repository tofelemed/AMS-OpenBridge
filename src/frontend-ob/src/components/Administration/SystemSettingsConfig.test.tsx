// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemSettingsConfig } from './SystemSettingsConfig';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const show = () => render(<MemoryRouter><SystemSettingsConfig /></MemoryRouter>);

describe('System settings', () => {
  it('shows Not connected and no invented values', () => {
    const { container } = show();
    expect(screen.getAllByText('Not connected').length).toBeGreaterThanOrEqual(6);
    const text = container.textContent ?? '';
    expect(text).not.toContain('/mnt/backups/ams');
    expect(text).not.toMatch(/\b(30|365)\b/);
    expect(text).not.toContain('Industrial Dark');
    expect(container.querySelectorAll('input, select')).toHaveLength(0);
  });

  it('disables Save with its reason on screen', () => {
    show();
    const save = screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/nothing can be saved/i)).toBeTruthy();
  });
});
