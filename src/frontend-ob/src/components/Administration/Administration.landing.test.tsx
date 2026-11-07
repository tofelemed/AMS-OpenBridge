// @vitest-environment jsdom
// Plain /admin (the sidebar's link) lands on the first section the role may open.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { resolveRedirect } from '../../cpa/redirects';
import Administration from './Administration';

let held: string[] = [];

vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: (p: string) => held.includes(p) }),
}));
vi.mock('../../app/guards', () => ({ RestrictedRoute: () => <p>restricted</p> }));
vi.mock('./UserManagementConfig', () => ({ UserManagementConfig: () => null }));
vi.mock('./RolesConfig', () => ({ RolesConfig: () => null }));
vi.mock('./AlarmFeedConfig', () => ({ AlarmFeedConfig: () => null }));
vi.mock('./AlarmRulesConfig', () => ({ AlarmRulesConfig: () => null }));
vi.mock('./DataSourcesConfig', () => ({ DataSourcesConfig: () => null }));
vi.mock('./PlantModelConfig', () => ({ PlantModelConfig: () => null }));
vi.mock('./AliasConfig', () => ({ AliasConfig: () => null }));
vi.mock('./NotificationsConfig', () => ({ NotificationsConfig: () => null }));
vi.mock('./SystemSettingsConfig', () => ({ SystemSettingsConfig: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));

afterEach(cleanup);

const Where = () => <output>{useLocation().pathname}</output>;

const landing = (permissions: string[]) => {
  held = permissions;
  render(
    <MemoryRouter initialEntries={['/admin']}>
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
    [['admin.audit.view'], '/cpm/governance'],
  ])('%j lands on %s', (permissions, tab) => {
    expect(landing(permissions)).toBe(tab);
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
  it('offers Users, Roles & permissions, Data sources, Plant model, Tag aliases, Audit log, System settings', () => {
    open(everything);
    expect(tabs()).toEqual(['Users', 'Roles & permissions', 'Data sources', 'Plant model', 'Tag aliases', 'Audit log', 'System settings']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Administration');
  });

  it("keeps each tab's permission", () => {
    open(['ingestion.view']);
    expect(tabs()).toEqual(['Data sources', 'System settings']);
    cleanup();
    open(['rbac.manage']);
    expect(tabs()).toEqual(['Roles & permissions', 'System settings']);
    cleanup();
    open(['admin.users.edit']);
    expect(tabs()).toEqual(['Users', 'System settings']);
  });

  it('keeps the path-based routes', () => {
    open(everything);
    fireEvent.click(screen.getByRole('tab', { name: 'Tag aliases' }));
    expect(screen.getByRole('status').textContent).toBe('/admin/aliases');
  });

  it('opens Governance from Audit log', () => {
    open(everything, '/admin/audit');
    fireEvent.click(screen.getByRole('button', { name: 'Open Governance →' }));
    expect(screen.getByRole('status').textContent).toBe('/cpm/governance');
  });

  it('says why Governance cannot be opened without the audit permission', () => {
    open(['admin.users.edit'], '/admin/audit');
    expect((screen.getByRole('button', { name: 'Open Governance →' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/does not include the audit log/i)).toBeTruthy();
  });
});
