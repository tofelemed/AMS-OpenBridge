// @vitest-environment jsdom
// CHG-174 (owner review, badge 8): the dialog in parts Answer · Run at; ✕ Verify failed with tone, glyph and word; a network
// failure said plainly (it read as a 500); the last run in one line under the button.
// CHG-202 (owner, 15 Nov 2026): the result in words; never the service's own text, a status code, a hash or "Not served".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../../../api/apiFetch';
import { CHANGED_OR_UNFINISHED, CHECKING, INTACT, NO_PERMISSION, NOT_COMPLETED, VerifyDialog, VerifyLine } from './VerifyDialog';

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
  it('says an intact chain in words, and when it ran; never the service text or what it does not serve (CHG-202)', () => {
    render(<VerifyDialog verify={state({ isSuccess: true, data: 'Chain verified. No tampering detected. 3fa9c2d81e07aa55' })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText(INTACT)).toBeTruthy();
    expect(INTACT).toBe('The audit chain is intact: no entry has been changed.');
    expect(screen.getByText('Run at').nextElementSibling?.textContent).toBe('11 Nov 14:18 UTC');
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['Verify audit chain', 'Answer']);
    expect(document.body.textContent).not.toMatch(/answered|tampering|3fa9c2d8|served/i);
  });

  it('Run again re-runs it', () => {
    const again = vi.fn();
    render(<VerifyDialog verify={state({ isSuccess: true, data: 'ok' })} ranAt={ran} onRunAgain={again} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Run again'));
    expect(again).toHaveBeenCalled();
  });

  it('a broken chain reads ✕ Verify failed and what it means, in words; never the service text (CHG-202)', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new ApiError(500, 'CHAIN TAMPERING DETECTED.') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText('Verify failed')).toBeTruthy();
    expect(screen.getByText('✕')).toBeTruthy();
    expect(screen.getByText(CHANGED_OR_UNFINISHED)).toBeTruthy();
    expect(CHANGED_OR_UNFINISHED).toBe('An entry may have been changed, or the check could not finish.');
    expect(screen.queryByText('CHAIN TAMPERING DETECTED.')).toBeNull();
    expect(screen.queryByText('VERIFY FAILED')).toBeNull();
  });

  it('a refusal for permission says so in words; any other answer says the check did not complete (CHG-202)', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new ApiError(403, 'Missing permission admin.audit.view') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText(NO_PERMISSION)).toBeTruthy();
    expect(screen.queryByText(CHANGED_OR_UNFINISHED)).toBeNull();
    expect(document.body.textContent).not.toMatch(/admin\.audit\.view/);
    cleanup();
    render(<VerifyDialog verify={state({ isError: true, error: new ApiError(404, 'GET /api/audit/verify returned 404') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText(NOT_COMPLETED)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/404|\/api/);
  });

  it('a network failure says plainly that the service was not reached', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new TypeError('Failed to fetch') })} ranAt={ran} onClose={() => {}} />);
    expect(screen.getByText('Verify failed')).toBeTruthy();
    expect(screen.getByText('The audit log could not be reached, so the chain was not checked.')).toBeTruthy();
    expect(screen.queryByText(CHANGED_OR_UNFINISHED)).toBeNull();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('says it is checking every entry while it runs', () => {
    render(<VerifyDialog verify={state({ isPending: true })} onClose={() => {}} />);
    expect(screen.getByText(CHECKING)).toBeTruthy();
    expect(CHECKING).toBe('Checking every entry…');
    expect(screen.queryByText('Run at')).toBeNull();
  });
});

describe('the line under Verify audit chain', () => {
  it('says what the session knows, in one line', () => {
    const { rerender } = render(<VerifyLine verify={state({ isIdle: true })} ranAt={null} />);
    expect(screen.getByRole('status').textContent).toBe('Not verified in this session.');
    rerender(<VerifyLine verify={state({ isPending: true })} ranAt={null} />);
    expect(screen.getByRole('status').textContent).toBe('Checking every entry…');
    rerender(<VerifyLine verify={state({ isSuccess: true, data: 'ok' })} ranAt={ran} />);
    expect(screen.getByRole('status').textContent).toBe('Last run 11 Nov 14:18 UTC');
    rerender(<VerifyLine verify={state({ isError: true, error: new ApiError(500, 'x') })} ranAt={ran} />);
    expect(screen.getByRole('status').textContent).toBe('✕ Verify failed · 11 Nov 14:18 UTC');
    rerender(<VerifyLine verify={state({ isError: true, error: new TypeError('Failed to fetch') })} ranAt={ran} />);
    expect(screen.getByRole('status').textContent).toBe('✕ Audit log not reached · 11 Nov 14:18 UTC');
  });
});
