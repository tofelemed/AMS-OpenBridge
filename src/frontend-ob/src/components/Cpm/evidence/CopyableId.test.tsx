// v2.5 workbench (audit F13/F14): identifiers are shown short, the full id on hover, copied with one
// click - and never fabricated for a missing value.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CopyableId } from './CopyableId';

vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

describe('CopyableId', () => {
  it('shows the short id with the full id on hover and copies the full id', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyableId label="run id" value="4ccaf304-0e8d-54df-94ef-83f4130ee28d" />);
    expect(screen.getByText('4ccaf304')).toBeTruthy();
    expect(screen.getByTitle('4ccaf304-0e8d-54df-94ef-83f4130ee28d')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy run id' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('4ccaf304-0e8d-54df-94ef-83f4130ee28d'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
  });

  it('renders a dash and no copy button for a missing id', () => {
    render(<CopyableId label="dataset" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
