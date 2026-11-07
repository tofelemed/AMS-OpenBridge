// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CpmGovernance } from './CpmGovernance';

const verify = { isIdle: true, isPending: false, isSuccess: false, isError: false, data: undefined as unknown, error: null, mutate: vi.fn() };

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => p === 'admin.audit.view' }),
}));
vi.mock('../../hooks/useAudit', () => ({ useVerifyAuditChain: () => verify }));
vi.mock('./governance/AuditTrail', () => ({ AuditTrail: () => null }));
vi.mock('./governance/ChangeTraceability', () => ({ ChangeTraceability: () => null }));
vi.mock('./useRoleMatrix', () => ({ useRoleMatrix: () => ({ canRead: false }) }));

beforeEach(() => {
  Object.assign(verify, { isIdle: true, isSuccess: false, data: undefined });
  verify.mutate.mockClear();
});
afterEach(cleanup);

describe('governance verification', () => {
  it('the first click runs the verification and opens the dialog', () => {
    render(<CpmGovernance />);
    fireEvent.click(screen.getByText('Verify audit chain'));
    expect(verify.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('with an answer, the click shows it and does not ask again; Run again does', () => {
    Object.assign(verify, { isIdle: false, isSuccess: true, data: 'Hash chain verified.' });
    render(<CpmGovernance />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify audit chain' }));
    expect(verify.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Hash chain verified.')).toBeTruthy();
    fireEvent.click(screen.getByText('Run again'));
    expect(verify.mutate).toHaveBeenCalledTimes(1);
  });
});
