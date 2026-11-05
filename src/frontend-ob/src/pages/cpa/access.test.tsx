// @vitest-environment jsdom
// Each tab keeps the rule of the page it replaces: nobody gains or loses a page, role by role.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { visibleDestinations } from '../../cpa/destinations';
import SetupPage from './SetupPage';
import SystemPage from './SystemPage';

let held: string[] = [];
const has = (p: string) => held.includes(p);

vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: has }),
}));
vi.mock('../../app/guards', () => ({ RestrictedRoute: () => <p>restricted</p>, RouteFallback: () => null }));
for (const path of [
  '../../components/Cpm/LoopRegistry', '../../components/Cpm/config/GateConfigurationWorkspace',
  '../../components/Cpm/CpmPipeline', '../../components/Cpm/CpmGovernance',
  '../../components/Administration/PlantModelConfig', '../../components/Administration/DataSourcesConfig',
  '../../components/Administration/AliasConfig', '../../components/Administration/UserManagementConfig',
  '../../components/Administration/RolesConfig',
  '../../components/Administration/SystemSettingsConfig',
]) vi.doMock(path, () => ({ default: () => <p>page</p> }));

afterEach(cleanup);

const tabsOf = (Page: React.FC, search = '') => {
  render(<MemoryRouter initialEntries={[`/x${search}`]}><React.Suspense fallback={null}><Page /></React.Suspense></MemoryRouter>);
  const names = screen.queryAllByRole('tab').map(t => t.textContent);
  cleanup();
  return names;
};
const menu = () => visibleDestinations(has).map(d => d.id);

describe('who sees which tab', () => {
  it('a full administrator sees everything', () => {
    held = ['analytics.view', 'cpm.manage', 'cpm.config.read', 'system.manage', 'asset.view', 'ingestion.view',
      'admin.users.edit', 'rbac.manage', 'admin.audit.view'];
    expect(tabsOf(SetupPage)).toEqual(['Loops', 'Configuration', 'Plant model', 'Data sources', 'Tag aliases']);
    expect(tabsOf(SystemPage)).toEqual(['Pipeline', 'Governance', 'Users', 'Roles', 'Settings']);
  });

  it('an operator gets no Administration section, as today', () => {
    held = ['analytics.view', 'asset.view'];
    expect(tabsOf(SetupPage)).toEqual(['Loops']);
    expect(tabsOf(SystemPage)).toEqual([]);
    expect(menu()).not.toContain('setup');
    expect(menu()).not.toContain('system');
  });

  it('an auditor keeps the trail, on Governance, and Settings, and gains nothing', () => {
    held = ['analytics.view', 'admin.audit.view'];
    expect(tabsOf(SystemPage)).toEqual(['Governance', 'Settings']);
    expect(menu()).toContain('system');
  });

  it('an auditor who also reads assets keeps Plant model and Tag aliases', () => {
    held = ['admin.audit.view', 'asset.view'];
    expect(tabsOf(SetupPage)).toEqual(['Plant model', 'Tag aliases']);
    expect(menu()).toContain('setup');
  });

  it('a role manager keeps Roles, and is offered no empty Setup', () => {
    held = ['rbac.manage'];
    expect(tabsOf(SystemPage)).toEqual(['Governance', 'Roles', 'Settings']);
    expect(menu()).not.toContain('setup');
  });

  it('an ingestion viewer keeps Data sources', () => {
    held = ['ingestion.view'];
    expect(tabsOf(SetupPage)).toEqual(['Data sources']);
    expect(menu()).toContain('setup');
  });

  it('system.manage alone keeps Pipeline and Governance, and no Administration section', () => {
    held = ['system.manage'];
    expect(tabsOf(SystemPage)).toEqual(['Pipeline', 'Governance']);
  });

  it('a tab the role may not open shows the restricted state by address', () => {
    held = ['analytics.view', 'asset.view'];
    render(<MemoryRouter initialEntries={['/x?tab=plant-model']}><React.Suspense fallback={null}><SetupPage /></React.Suspense></MemoryRouter>);
    expect(screen.getByText('restricted')).toBeTruthy();
  });
});
