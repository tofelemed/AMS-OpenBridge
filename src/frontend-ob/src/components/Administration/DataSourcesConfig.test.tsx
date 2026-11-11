// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badges 12-13): Data sources is one list (name, profile under it, ✓ Active / ○ Off)
// with the selected source in a panel: profile, name and state once; the connection rows (every topic filter, times in the site
// zone named once); Loop ingest; Test · Edit · Turn off / Turn on · Delete (asking first); the ids in Record details. Add data
// source sits in the page header. Every request keeps its endpoint.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DataSourceDto } from './dataSourcesApi';

const api = vi.hoisted(() => ({
  listDataSources: vi.fn(), listProfiles: vi.fn(), deleteDataSource: vi.fn(), setDataSourceActive: vi.fn(), testDataSource: vi.fn(),
}));
let canManage = true;
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../store/authStore', () => ({ useAuthStore: (pick: (s: unknown) => unknown) => pick({ hasPermission: () => canManage }) }));
vi.mock('../../cpa/siteTime', async () => {
  const real = await vi.importActual<typeof import('../../cpa/siteTime')>('../../cpa/siteTime');
  return { ...real, siteZone: () => 'UTC' };
});
vi.mock('./dataSourcesApi', async () => {
  const real = await vi.importActual<typeof import('./dataSourcesApi')>('./dataSourcesApi');
  return { ...real, ...api };
});
vi.mock('./DataSourceWizard', () => ({
  default: (p: { existing?: DataSourceDto }) => <div role="dialog" aria-label="editor">{p.existing ? `edit ${p.existing.name}` : 'add'}</div>,
}));
vi.mock('./LoopIngestPanel', () => ({ default: () => <p>loop ingest part</p> }));

import { DataSourcesConfig } from './DataSourcesConfig';

const src = (configId: string, name: string, over: Partial<DataSourceDto> = {}) => ({
  configId, name, sourceType: 'MQTT', profileType: 'MQTT_LOOP_SAMPLES', connectionUrl: `mqtt://${name}.example:1883`, username: 'ingest_user',
  timeoutSeconds: 15, profileConfig: { mqtt: { topics: ['OT/+/+/+/+/PIDParams/+', 'OT/extra/#'], qos: 1, keepalive_seconds: 60 } },
  isActive: true, effectiveClientId: `ingestion-${configId}`, version: 3, lastConnectionTest: '2026-10-05T19:45:25Z', lastConnectionStatus: 'SUCCESS',
  lastDataReceived: '2026-10-06T19:55:00Z', ...over,
} as unknown as DataSourceDto);
const profiles = [
  { profileType: 'MQTT_LOOP_SAMPLES', displayName: 'Control-Loop Signals (CPA)', module: 'Loop Performance (CPM)', transport: 'MQTT', description: '', destination: 'traverse.cpa.loop.samples.v1', defaultTopics: [] },
  { profileType: 'NE107', displayName: 'Transmitter Health (Instrumental NE107)', module: 'Loop Performance (CPM)', transport: 'MQTT', description: '', destination: 't', defaultTopics: [] },
];

const panel = () => screen.getByRole('complementary');
const show = async () => { render(<DataSourcesConfig />); await screen.findByRole('complementary'); };

beforeEach(() => {
  canManage = true;
  api.listDataSources.mockReset().mockResolvedValue([
    src('a', 'alpha'), src('b', 'beta', { profileType: 'NE107', isActive: false, lastConnectionTest: null, lastConnectionStatus: null, lastDataReceived: null }),
  ]);
  api.listProfiles.mockReset().mockResolvedValue(profiles);
  api.deleteDataSource.mockReset().mockResolvedValue(undefined);
  api.setDataSourceActive.mockReset().mockResolvedValue({});
  api.testDataSource.mockReset().mockResolvedValue({ ok: true, latencyMs: 42, status: 'SUCCESS' });
});
afterEach(cleanup);

describe('the source list', () => {
  it('names each source with its profile under it and its state', async () => {
    await show();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Data source', 'State']);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toEqual(['alphaControl-Loop Signals (CPA)✓Active', 'betaTransmitter Health (Instrumental NE107)○Off']);
    expect(screen.getByRole('searchbox', { name: 'Find data source' }).getAttribute('placeholder')).toBe('Name, type or broker URL');
  });

  it('never keeps a panel open for a source the search hides', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: /^beta/ }));
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe('beta');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find data source' }), { target: { value: 'alpha.example' } });
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe('alpha');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find data source' }), { target: { value: 'ne107' } });
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe('beta');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find data source' }), { target: { value: 'zzz' } });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByText('No data source matches the search.')).toBeTruthy();
  });

  it('opens the editor from Add data source, for a manager only', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add data source' }));
    expect(screen.getByRole('dialog', { name: 'editor' }).textContent).toBe('add');
    cleanup();
    canManage = false;
    await show();
    expect(screen.queryByRole('button', { name: 'Add data source' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Test' })).toBeNull();
  });
});

describe('the selected source', () => {
  it('says the profile, the name and the state once, then the connection rows', async () => {
    await show();
    const p = panel();
    expect(within(p).getByText('Control-Loop Signals (CPA)')).toBeTruthy();
    expect(within(p).getByRole('heading', { level: 2 }).textContent).toBe('alpha');
    expect(within(p).getAllByText('Active')).toHaveLength(1);
    const text = p.textContent ?? '';
    expect(text).toContain('Topic filtersOT/+/+/+/+/PIDParams/+, OT/extra/#');
    expect(text).toContain('FeedsLoop Performance (CPM) · traverse.cpa.loop.samples.v1');
    expect(text).toContain('QoS · keepaliveQoS 1 · 60 s');
    expect(text).toContain('Timeout15 s');
    expect(text).toContain('Last connection test · UTC✓ 5 Oct 19:45');
    expect(text).toContain('Last data received · UTC6 Oct 19:55');
    expect(within(p).getByText('loop ingest part')).toBeTruthy();
    expect(text).not.toContain('Configuration id');
  });

  it('tests the connection and shows the answer', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(api.testDataSource).toHaveBeenCalledWith('a'));
    expect((await within(panel()).findByRole('status')).textContent).toBe('✓ Connected in 42 ms');
  });

  it('turns a source off or on with the same request', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(api.setDataSourceActive).toHaveBeenCalledWith('a', false));
    fireEvent.click(screen.getByRole('button', { name: /^beta/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(api.setDataSourceActive).toHaveBeenCalledWith('b', true));
  });

  it('asks before deleting, in the same words, and deletes only after Delete', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete data source' });
    expect(within(dialog).getByText('Delete "alpha" and its stored credentials?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteDataSource).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    dialog = screen.getByRole('dialog', { name: 'Delete data source' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteDataSource).toHaveBeenCalledWith('a'));
  });

  it('opens the editor on the source from Edit', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'editor' }).textContent).toBe('edit alpha');
  });

  it('keeps the ids in Record details', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Record details' }));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getByText('Configuration id')).toBeTruthy();
    expect(within(dialog).getByText('Client id')).toBeTruthy();
    expect(within(dialog).getByText('Version').nextSibling?.textContent).toBe('3');
  });

  it('shows a failed action as the server words it', async () => {
    api.setDataSourceActive.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 409, data: { error: 'Broker unreachable' } } }));
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Turn off' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Broker unreachable');
  });
});
