// @vitest-environment jsdom
// CHG-174 (owner review, badge 8): the dialog in parts Answer · Run at · Not served; ✕ Verify failed with tone, glyph and word; a
// network failure said plainly (it read as a 500); the not-served sentence once; the last run in one line under the button.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../../../api/apiFetch';
import { NOT_SERVED_NOTE, VerifyDialog, VerifyLine } from './VerifyDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));
afterEach(cleanup);

const state = (over: Record<string, unknown>) =>
  ({ isIdle: false, isPending: false, isSuccess: false, isError: false, data: undefined, error: null, ...over }) as never;
const ran = new Date('2026-11-11T14:18:06Z');

describe('verify dialog', () => {
  it('never claims integrity from a button click: the service sentence, when it ran, and what is not served, once', () => {
    render(<VerifyDialog verify={state({ isSuccess: true, data: 'Chain verified. No tampering detected.' })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText('audit-service answered:')).toBeTruthy();
    expect(screen.getByText('Chain verified. No tampering detected.')).toBeTruthy();
    expect(screen.getByText('Run at').nextElementSibling?.textContent).toBe('11 Nov 14:18 UTC');
    expect(screen.getAllByText(NOT_SERVED_NOTE)).toHaveLength(1);
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['Verify audit chain', 'Answer', 'Not served']);
  });

  it('Run again re-runs it', () => {
    const again = vi.fn();
    render(<VerifyDialog verify={state({ isSuccess: true, data: 'ok' })} ranAt={ran} onRunAgain={again} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Run again'));
    expect(again).toHaveBeenCalled();
  });

  it('a refusal reads ✕ Verify failed with the service words and what a 500 means', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new ApiError(500, 'CHAIN TAMPERING DETECTED.') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText('Verify failed')).toBeTruthy();
    expect(screen.getByText('✕')).toBeTruthy();
    expect(screen.getByText('CHAIN TAMPERING DETECTED.')).toBeTruthy();
    expect(screen.getByText('A 500 here means the service reported possible tampering or could not complete the walk.')).toBeTruthy();
    expect(screen.queryByText('VERIFY FAILED')).toBeNull();
  });

  it('a refusal that is not a 500 does not say what a 500 means', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new ApiError(403, 'You do not have permission to view this.') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText('You do not have permission to view this.')).toBeTruthy();
    expect(screen.queryByText(/A 500 here means/)).toBeNull();
  });

  it('a network failure says plainly that the service was not reached', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new TypeError('Failed to fetch') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText('Verify failed')).toBeTruthy();
    expect(screen.getByText('audit-service could not be reached, so the chain was not checked.')).toBeTruthy();
    expect(screen.queryByText(/A 500 here means/)).toBeNull();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('says it is walking the chain while it runs', () => {
    render(<VerifyDialog verify={state({ isPending: true })} onClose={() => {}} />);
    expect(screen.getByText('Walking the full chain…')).toBeTruthy();
    expect(screen.queryByText('Run at')).toBeNull();
  });
});

describe('the line under Verify audit chain', () => {
  it('says what the session knows, in one line', () => {
    const { rerender } = render(<VerifyLine verify={state({ isIdle: true })} ranAt={null} />);
    expect(screen.getByRole('status').textContent).toBe('Not verified in this session.');
    rerender(<VerifyLine verify={state({ isPending: true })} ranAt={null} />);
    expect(screen.getByRole('status').textContent).toBe('Walking the full chain…');
    rerender(<VerifyLine verify={state({ isSuccess: true, data: 'ok' })} ranAt={ran} />);
    expect(screen.getByRole('status').textContent).toBe('Last run 11 Nov 14:18 UTC');
    rerender(<VerifyLine verify={state({ isError: true, error: new ApiError(500, 'x') })} ranAt={ran} />);
    expect(screen.getByRole('status').textContent).toBe('✕ Verify failed · 11 Nov 14:18 UTC');
    rerender(<VerifyLine verify={state({ isError: true, error: new TypeError('Failed to fetch') })} ranAt={ran} />);
    expect(screen.getByRole('status').textContent).toBe('✕ audit-service not reached · 11 Nov 14:18 UTC');
  });
});
