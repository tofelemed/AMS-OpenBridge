// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DataSourcesConfig } from './DataSourcesConfig';

const src = (configId: string, name: string) => ({
  configId, name, sourceType: 'MQTT', connectionUrl: `tcp://${name}:1883`, username: 'u', timeoutSeconds: 10,
  profileConfig: {}, isActive: true, effectiveClientId: `c-${name}`, version: 1,
});

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../store/authStore', () => ({ useAuthStore: () => () => true }));
vi.mock('./dataSourcesApi', () => ({
  listDataSources: async () => [src('a', 'alpha'), src('b', 'beta')],
  listProfiles: async () => [],
  deleteDataSource: vi.fn(), setDataSourceActive: vi.fn(), testDataSource: vi.fn(),
  extractApiError: () => ({ message: 'err' }),
}));
vi.mock('./DataSourceWizard', () => ({ default: () => null }));
vi.mock('./LoopIngestPanel', () => ({ default: () => null }));
afterEach(cleanup);

describe('Data sources', () => {
  it('never keeps a detail open for a source the search hides', async () => {
    render(<DataSourcesConfig />);
    fireEvent.click(await screen.findByRole('button', { name: /beta/ }));
    expect(screen.getByRole('heading', { name: 'beta' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search data sources'), { target: { value: 'alpha' } });
    expect(screen.queryByRole('heading', { name: 'beta' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'alpha' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search data sources'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
