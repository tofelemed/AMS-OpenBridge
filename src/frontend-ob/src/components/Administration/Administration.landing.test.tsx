// @vitest-environment jsdom
// Plain /admin (the sidebar's link) lands on the first section the role may open.
// CHG-172 (owner review): five tabs (System settings hidden, owner answer 2), Audit log ↗ a link at the end of the tab row,
// Plant model and Tag aliases open with asset.view (answer 3f), How to read and the open tab's actions in the header.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { resolveRedirect } from '../../cpa/redirects';
import { LegacyRoute } from '../../cpa/LegacyRoute';
import Administration from './Administration';
import { AdminActions } from './AdminActions';

let held: string[] = [];

vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: (p: string) => held.includes(p) }),
}));
vi.mock('../../app/guards', () => ({ RestrictedRoute: () => <p>restricted</p> }));
vi.mock('./UserManagementConfig', () => ({ UserManagementConfig: () => <AdminActions><button>Add user</button></AdminActions> }));
vi.mock('./RolesConfig', () => ({ RolesConfig: () => <AdminActions><button>Add custom role</button></AdminActions> }));
vi.mock('./AlarmFeedConfig', () => ({ AlarmFeedConfig: () => null }));
vi.mock('./AlarmRulesConfig', () => ({ AlarmRulesConfig: () => null }));
vi.mock('./DataSourcesConfig', () => ({ DataSourcesConfig: () => null }));
vi.mock('./PlantModelConfig', () => ({ PlantModelConfig: () => <p>plant model</p> }));
vi.mock('./AliasConfig', () => ({ AliasConfig: () => <p>tag aliases</p> }));
vi.mock('./NotificationsConfig', () => ({ NotificationsConfig: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));

afterEach(cleanup);

const Where = () => <output>{useLocation().pathname}</output>;

const landing = (permissions: string[], at = '/admin') => {
  held = permissions;
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes><Route path="/admin/*" element={<Administration />} /></Routes>
      <Where />
    </MemoryRouter>,
  );
  const path = screen.getByRole('status').textContent ?? '';
  return resolveRedirect(path, '') ?? path;
};

describe('the Administration link', () => {
  it.each([
    [['admin.users.edit', 'rbac.manage'], '/admin/users'],
    [['rbac.manage'], '/admin/roles'],
    [['ingestion.view'], '/admin/data-sources'],
    [['admin.audit.view', 'asset.view'], '/admin/plant-model'],
    [['asset.view'], '/admin/plant-model'],
    [['admin.audit.view'], '/cpm/governance'],
  ])('%j lands on %s', (permissions, tab) => {
    expect(landing(permissions)).toBe(tab);
  });

  it('sends the old System settings address to the first tab the role may open', () => {
    expect(landing(['rbac.manage'], '/admin/system')).toBe('/admin/roles');
  });
});

const open = (permissions: string[], at = '/admin/users') => {
  held = permissions;
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes><Route path="/admin/*" element={<Administration />} /></Routes>
      <Where />
    </MemoryRouter>,
  );
};
const everything = ['admin.users.edit', 'rbac.manage', 'ingestion.view', 'asset.view', 'admin.audit.view'];
const tabs = () => screen.getAllByRole('tab').map(t => t.textContent);

describe('the Administration tabs', () => {
  it('offers Users, Roles & permissions, Data sources, Plant model and Tag aliases, then Audit log as a link', () => {
    open(everything);
    expect(tabs()).toEqual(['Users', 'Roles & permissions', 'Data sources', 'Plant model', 'Tag aliases']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Administration');
    expect(screen.getByText('System').className).toContain('cpm-eyebrow');
    expect(screen.queryByRole('tab', { name: /System settings/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Audit log/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Audit log ↗' })).toBeTruthy();
  });

  it('keeps each tab permission', () => {
    open(['ingestion.view']);
    expect(tabs()).toEqual(['Data sources']);
    cleanup();
    open(['rbac.manage']);
    expect(tabs()).toEqual(['Roles & permissions']);
    cleanup();
    open(['admin.users.edit']);
    expect(tabs()).toEqual(['Users']);
  });

  it('opens Plant model and Tag aliases to asset.view, without an administration key', () => {
    open(['asset.view'], '/admin/plant-model');
    expect(tabs()).toEqual(['Plant model', 'Tag aliases']);
    expect(screen.getByText('plant model')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Tag aliases' }));
    expect(screen.getByRole('status').textContent).toBe('/admin/aliases');
    expect(screen.getByText('tag aliases')).toBeTruthy();
  });

  it('keeps the path-based routes', () => {
    open(everything);
    fireEvent.click(screen.getByRole('tab', { name: 'Tag aliases' }));
    expect(screen.getByRole('status').textContent).toBe('/admin/aliases');
  });

  it('shows Audit log ↗ only to the audit permission, and opens Governance', () => {
    open(['admin.users.edit']);
    expect(screen.queryByRole('button', { name: 'Audit log ↗' })).toBeNull();
    cleanup();
    open(everything);
    fireEvent.click(screen.getByRole('button', { name: 'Audit log ↗' }));
    expect(screen.getByRole('status').textContent).toBe('/cpm/governance');
  });

  it('puts the open tab actions in the header, beside How to read', () => {
    open(everything);
    const header = screen.getByRole('banner');
    expect(within(header).getAllByRole('button').map(b => b.textContent)).toEqual(['How to read', 'Add user']);
    fireEvent.click(screen.getByRole('tab', { name: 'Roles & permissions' }));
    expect(within(header).getAllByRole('button').map(b => b.textContent)).toEqual(['How to read', 'Add custom role']);
  });

  it('opens How to read for the open tab', () => {
    open(everything);
    fireEvent.click(screen.getByRole('button', { name: 'How to read' }));
    const dialog = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(dialog).getByRole('heading', { name: 'Status' })).toBeTruthy();
    expect(within(dialog).getByText('The account can sign in.')).toBeTruthy();
    expect(within(dialog).queryByRole('heading', { name: 'MODE map' })).toBeNull();
  });

  it('reaches Governance from the old Audit log address through the redirect', () => {
    held = everything;
    render(
      <MemoryRouter initialEntries={['/admin/audit']}>
        <Routes><Route path="/admin/*" element={<LegacyRoute><Administration /></LegacyRoute>} /></Routes>
        <Where />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').textContent).toBe('/cpm/governance');
  });
});
