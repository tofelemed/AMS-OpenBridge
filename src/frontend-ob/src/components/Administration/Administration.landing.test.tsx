// @vitest-environment jsdom
// Plain /admin (the sidebar's link) lands on the first section the role may open.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('./AuditExplorer', () => ({ default: () => null }));

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
