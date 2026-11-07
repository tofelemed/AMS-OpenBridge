// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VerifyDialog } from './VerifyDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);

const state = (over: Record<string, unknown>) =>
  ({ isIdle: false, isPending: false, isSuccess: false, isError: false, data: undefined, error: null, ...over }) as never;

describe('verify dialog', () => {
  it('never claims integrity from a button click: the service sentence, and what is not served', () => {
    render(<VerifyDialog verify={state({ isSuccess: true, data: 'Hash chain verified.' })} onClose={() => {}} />);
    expect(screen.getByText('Hash chain verified.')).toBeTruthy();
    expect(screen.queryByText(/CHAIN OK/)).toBeNull();
    expect(screen.getByText(/range, entry count and algorithm are not served/i)).toBeTruthy();
  });

  it('shows a failure with its meaning', () => {
    render(<VerifyDialog verify={state({ isError: true, error: new Error('boom') })} onClose={() => {}} />);
    expect(screen.getByText('VERIFY FAILED')).toBeTruthy();
    expect(screen.getByText(/possible tampering or could not complete/)).toBeTruthy();
  });

  it('says it is walking the chain while it runs', () => {
    render(<VerifyDialog verify={state({ isPending: true })} onClose={() => {}} />);
    expect(screen.getByText('Walking the full chain…')).toBeTruthy();
  });
});
