// @vitest-environment jsdom
// CHG-174 (owner review, the approved sample governance-proposal.html, badges 1, 2, 8, 14, and the owner's answers of 11 Nov 2026).
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CpmGovernance } from './CpmGovernance';
import { APPROVAL_BINDS, APPROVE_RULE, CONTROL_AUTHORITY, SIGN_OUT } from './governance/GovernanceHowToRead';
import { SIGN_OUT as ROLES_SIGN_OUT } from '../Administration/roles/RolePanel';

const verify = { isIdle: true, isPending: false, isSuccess: false, isError: false, data: undefined as unknown, error: null, mutate: vi.fn() };
let held = ['system.manage', 'admin.audit.view'];

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));
vi.mock('../../hooks/useAudit', () => ({ useVerifyAuditChain: () => verify }));
vi.mock('./governance/AuditTrail', () => ({ AuditTrail: () => <p>the trail</p> }));
vi.mock('./governance/ApprovalsTab', () => ({ ApprovalsTab: () => <p>the queue</p> }));
vi.mock('./governance/DutiesTab', () => ({ DutiesTab: () => <p>the matrix</p> }));
vi.mock('./governance/ChangeTraceability', () => ({ ChangeTraceability: () => <p>the versions</p> }));

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const mount = (search = '') => render(<MemoryRouter initialEntries={[`/cpm/governance${search}`]}><CpmGovernance /><Where /></MemoryRouter>);

beforeEach(() => {
  held = ['system.manage', 'admin.audit.view'];
  Object.assign(verify, { isIdle: true, isSuccess: false, isError: false, data: undefined });
  verify.mutate.mockClear();
});
afterEach(cleanup);

describe('the header', () => {
  it('is the eyebrow and the title, with no ? and no sentence; the Audit integrity card is gone', () => {
    mount();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Governance' })).toBeTruthy();
    expect(screen.queryByText(/Who changed what/)).toBeNull();
    expect(document.querySelector('.ui-toggletip__button')).toBeNull();
    expect(screen.queryByText('Audit integrity')).toBeNull();
  });

  it('How to read holds the open tab’s key and the rules', () => {
    mount();
    fireEvent.click(screen.getByText('How to read'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('heading').map(h => h.textContent)).toEqual(['How to read', 'Actor', 'Action', 'Filters', 'Audit chain']);
    expect(within(dialog).getByText('Entries are hash-chained by audit-service. Verify audit chain asks the service to walk the chain and shows its answer.')).toBeTruthy();
  });

  it('on Approvals How to read states the approval rules word for word, ControlAuthority in the server’s words', () => {
    mount('?tab=approvals');
    fireEvent.click(screen.getByText('How to read'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(APPROVE_RULE)).toBeTruthy();
    expect(within(dialog).getByText(APPROVAL_BINDS)).toBeTruthy();
    expect(within(dialog).getByText(CONTROL_AUTHORITY)).toBeTruthy();
  });
});

describe('the four tabs (answer 1)', () => {
  it('Audit trail · Approvals · Separation of duties · Change traceability, without counts, each its own address', () => {
    mount();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Audit trail', 'Approvals', 'Separation of duties', 'Change traceability']);
    expect(screen.getByText('the trail')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Separation of duties' }));
    expect(screen.getByTestId('where').textContent).toBe('?tab=duties');
    expect(screen.getByText('the matrix')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Audit trail' }));
    expect(screen.getByTestId('where').textContent).toBe('');
  });

  it('opens the tab its address names', () => {
    mount('?tab=traceability');
    expect(screen.getByText('the versions')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Change traceability' }).getAttribute('aria-selected')).toBe('true');
  });

  it('an auditor without system.manage sees the trail alone, with no tab row, whatever the address says', () => {
    held = ['admin.audit.view'];
    mount('?tab=duties');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('the trail')).toBeTruthy();
    expect(screen.queryByText('the matrix')).toBeNull();
  });

  it('Verify audit chain sits on the Audit trail tab only', () => {
    mount('?tab=approvals');
    expect(screen.queryByText('Verify audit chain')).toBeNull();
  });
});

describe('Verify audit chain (behaviour unchanged)', () => {
  it('the first click runs the verification and opens the dialog; its last run sits in one line under the button', () => {
    mount();
    expect(screen.getByText('Not verified in this session.')).toBeTruthy();
    fireEvent.click(screen.getByText('Verify audit chain'));
    expect(verify.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('with an answer, the click shows it and does not ask again; Run again does', () => {
    Object.assign(verify, { isIdle: false, isSuccess: true, data: 'Hash chain verified.' });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Verify audit chain' }));
    expect(verify.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Hash chain verified.')).toBeTruthy();
    fireEvent.click(screen.getByText('Run again'));
    expect(verify.mutate).toHaveBeenCalledTimes(1);
  });

  it('without admin.audit.view it is disabled and says why', () => {
    held = ['system.manage'];
    mount();
    expect((screen.getByRole('button', { name: 'Verify audit chain' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Needs the admin.audit.view permission')).toBeTruthy();
  });
});

describe('words kept word for word', () => {
  const root = join(__dirname, '..', '..', '..', '..', '..');
  it('the approval rules match Gate Configuration and cplm-api', () => {
    expect(readFileSync(join(__dirname, 'config', 'lifecycle.ts'), 'utf8')).toContain(APPROVE_RULE);
    expect(readFileSync(join(__dirname, 'config', 'ApprovalTab.tsx'), 'utf8')).toContain(APPROVAL_BINDS);
    expect(readFileSync(join(root, 'src', 'services', 'cplm-api', 'Services', 'Config', 'ConfigStore.cs'), 'utf8')).toContain(`"${CONTROL_AUTHORITY}"`);
  });

  it('the sign-out sentence is the one Roles shows', () => {
    expect(SIGN_OUT).toBe(ROLES_SIGN_OUT);
  });
});
