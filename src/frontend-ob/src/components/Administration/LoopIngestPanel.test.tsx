// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badge 15): Loop ingest in the data-source panel keeps its facts, its two red
// warnings and its pill (tone + glyph + word); Edit MODE map opens a dialog with the same rows, preset, warnings and Save MODE map.
// The save is the same read-modify-write of profile_config (the mqtt block and every other loop_ingest key carried across).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DataSourceDto } from './dataSourcesApi';

const { updateDataSource } = vi.hoisted(() => ({ updateDataSource: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-delete', () => ({ ObiDelete: () => null }));
vi.mock('./dataSourcesApi', async () => {
  const real = await vi.importActual<typeof import('./dataSourcesApi')>('./dataSourcesApi');
  return { ...real, updateDataSource };
});

import LoopIngestPanel from './LoopIngestPanel';

const source = (loopIngest: Record<string, unknown> | undefined) => ({
  configId: 'cfg-1', name: 'OT Gateway (loop samples)', profileType: 'MQTT_LOOP_SAMPLES',
  profileConfig: { mqtt: { topics: ['OT/#'], tls: { ca_cert_pem: 'PEM' } }, ...(loopIngest ? { loop_ingest: loopIngest } : {}) },
} as unknown as DataSourceDto);
const onSaved = vi.fn();
const show = (src: DataSourceDto, canManage = true) => render(<LoopIngestPanel source={src} canManage={canManage} onSaved={onSaved} />);
const dialog = () => screen.getByRole('dialog', { name: 'Edit MODE map' });

beforeEach(() => { updateDataSource.mockReset().mockImplementation(async (_id: string, body: unknown) => ({ configId: 'cfg-1', ...(body as object) })); onSaved.mockReset(); });
afterEach(cleanup);

describe('Loop ingest', () => {
  it('shows the map, its pill and the facts', () => {
    show(source({ mode_value_map: { 1: 'AUT', 2: 'MAN', 3: 'CAS', 4: 'IMAN' }, grid_seconds: 5, registry_refresh_seconds: 30, param_roles: { POS: 'vp' } }));
    const part = screen.getByRole('region', { name: 'Loop ingest' });
    expect(within(part).getByText('MODE map · 4 values').textContent).toBe('✓MODE map · 4 values');
    expect(part.textContent).toContain('MODE value map1→AUT  2→MAN  3→CAS  4→IMAN');
    expect(within(part).getByText('30 s')).toBeTruthy();
    expect(within(part).getByText('POS→vp')).toBeTruthy();
    expect(within(part).queryByRole('status')).toBeNull();
  });

  it('keeps the two red warnings word for word', () => {
    show(source(undefined));
    expect(screen.getByText('NO MODE MAP').textContent).toBe('✕NO MODE MAP');
    expect(screen.getByRole('status').textContent).toContain('No MODE map: every MODE value reaches the engine raw');
    expect(screen.getByText('not configured')).toBeTruthy();
    cleanup();
    show(source({ mode_value_map: { 2: 'MAN' } }));
    expect(screen.getByRole('status').textContent).toBe('No mapped value counts as AUTO: every loop on this source will be excluded at Gate 1. A cascade slave counts as auto — map it to CAS.');
  });

  it('offers Edit MODE map only to a manager', () => {
    show(source(undefined), false);
    expect(screen.queryByRole('button', { name: 'Edit MODE map' })).toBeNull();
  });
});

describe('Edit MODE map', () => {
  it('edits the rows in a dialog and saves the whole stored config with the new map', async () => {
    show(source({ mode_value_map: { 1: 'AUT' }, grid_seconds: 5, param_roles: { POS: 'vp' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit MODE map' }));
    expect(within(dialog()).getByText(/Source MODE value → engine token/)).toBeTruthy();
    expect(within(dialog()).getByText('counts as AUTO')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add value' }));
    fireEvent.change(within(dialog()).getByLabelText('MODE value 2'), { target: { value: '9' } });
    fireEvent.change(within(dialog()).getByLabelText('Engine token 2'), { target: { value: 'xyz' } });
    expect(within(dialog()).getByText('NOT RECOGNISED — engine treats it as manual')).toBeTruthy();
    fireEvent.change(within(dialog()).getByLabelText('Engine token 2'), { target: { value: 'man' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save MODE map' }));
    await waitFor(() => expect(updateDataSource).toHaveBeenCalledWith('cfg-1', {
      profileConfig: { mqtt: { topics: ['OT/#'], tls: { ca_cert_pem: 'PEM' } }, loop_ingest: { mode_value_map: { 1: 'AUT', 9: 'MAN' }, grid_seconds: 5, param_roles: { POS: 'vp' } } },
    }));
    expect(onSaved).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Edit MODE map' })).toBeNull();
  });

  it('fills the CENTUM preset, removes a row and warns when nothing counts as AUTO', () => {
    show(source(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Edit MODE map' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Use Yokogawa CENTUM preset' }));
    expect(within(dialog()).getAllByRole('textbox').map(i => (i as HTMLInputElement).value)).toEqual(['1', 'AUT', '2', 'MAN', '3', 'CAS', '4', 'IMAN']);
    fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Remove' })[1]);
    expect(within(dialog()).getByText('Nothing here counts as AUTO — saving this map excludes every loop on this source at Gate 1.')).toBeTruthy();
  });

  it('keeps a refusal in the dialog, and Cancel saves nothing', async () => {
    updateDataSource.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 400, data: { error: 'Unknown token', field: 'mode_value_map' } } }));
    show(source({ mode_value_map: { 1: 'AUT' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit MODE map' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save MODE map' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toBe('Unknown token (mode_value_map)');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Edit MODE map' })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
