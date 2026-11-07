// Task 16: the Identity & raw tab. The run's identity, the window's flags, the artifacts the run holds (a rebuilt array is
// labelled as rebuilt, never as the original), the raw record, and two copy buttons.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IdentityTab } from './IdentityTab';
import { RUN_ID, artifact, manifest, methodRun } from './runFixture';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const show = (m = manifest()) => render(<IdentityTab run={methodRun()} manifest={m} flags={{ observabilityFlags: ['NO_VP'] }} />);

describe('IdentityTab', () => {
  it('copies the run id and the identity record', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Copy run ID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(RUN_ID));
    fireEvent.click(screen.getByRole('button', { name: 'Copy identity record' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const record = JSON.parse(writeText.mock.calls[1][0] as unknown as string);
    expect(record.Run).toBe(RUN_ID);
    expect(record.Bundle).toBe('profile:ffa30188e0775f18');
  });

  it('labels a rebuilt array as rebuilt and a held one as retained', () => {
    show(manifest([artifact({ artifactId: 'a1', kind: 'error_series', basis: 'RETAINED' }), artifact({ artifactId: 'a2', kind: 'cycle_fit', basis: 'RECONSTRUCTED' })]));
    expect(screen.getByRole('row', { name: /error_series/ }).textContent).toMatch(/Retained/);
    expect(screen.getByRole('row', { name: /cycle_fit/ }).textContent).toMatch(/Rebuilt/);
  });

  it('shows the window flags and the raw record', () => {
    show();
    expect(screen.getByText('No valve position mapped')).toBeTruthy();
    expect(screen.getByText(/"windowKind": "12h"/)).toBeTruthy();
  });

  it('says when the run holds no artifact', () => {
    show();
    expect(screen.getByText('No artifact is held for this run.')).toBeTruthy();
  });
});
