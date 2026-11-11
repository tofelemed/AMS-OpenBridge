// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badge 14): the data-source editor is a dialog with tabs Profile · Name · Connection ·
// Advanced and "Next: X →" (forward through Next, back any time); no "Name is required" before anything is typed; help behind ?,
// the warnings in view; no stale "later phase" texts; no emoji. The request is the same as before.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DataSourceDto, ProfileInfo } from './dataSourcesApi';

const { createDataSource, updateDataSource } = vi.hoisted(() => ({ createDataSource: vi.fn(), updateDataSource: vi.fn() }));
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
  return { ...real, createDataSource, updateDataSource };
});

import { DataSourceWizard } from './DataSourceWizard';

const profiles: ProfileInfo[] = [
  { profileType: 'MQTT_LOOP_SAMPLES', displayName: 'Control-Loop Signals (CPA)', module: 'Loop Performance (CPM)', transport: 'MQTT',
    description: 'Per-parameter control-loop feed.', destination: 'traverse.cpa.loop.samples.v1', defaultTopics: ['OT/+/+/+/+/PIDParams/+'] },
];
const existing = {
  configId: 'cfg-1', sourceType: 'MQTT', profileType: 'MQTT_LOOP_SAMPLES', name: 'OT Gateway (loop samples)', description: null,
  connectionUrl: 'mqtt://broker.example:1883', username: 'ingest_user', hasPassword: true, timeoutSeconds: 15, insecureSkipVerify: false,
  profileConfig: { mqtt: { topics: ['OT/a/#'], qos: 1 }, loop_ingest: { mode_value_map: { 1: 'AUT' } } },
  isActive: true, effectiveClientId: 'ingestion-cfg-1', createdAt: '', createdBy: '', updatedAt: '', version: 3,
} as unknown as DataSourceDto;

const onDone = vi.fn();
const onCancel = vi.fn();
const open = (src?: DataSourceDto) => render(<DataSourceWizard profiles={profiles} existing={src} onDone={onDone} onCancel={onCancel} />);
const dialog = () => screen.getByRole('dialog');
const tabs = () => within(dialog()).getAllByRole('tab').map(t => [t.textContent, t.getAttribute('aria-selected'), t.getAttribute('aria-disabled')]);
const next = () => within(dialog()).getByRole('button', { name: /^Next: / });
const type = (label: string, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });

beforeEach(() => {
  createDataSource.mockReset().mockResolvedValue({ ...existing, configId: 'new' });
  updateDataSource.mockReset().mockResolvedValue(existing);
  onDone.mockReset(); onCancel.mockReset();
});
afterEach(cleanup);

describe('Add data source', () => {
  it('is a dialog in four tabs, forward through Next', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Add data source' })).toBeTruthy();
    expect(tabs()).toEqual([['Profile', 'true', null], ['Name', 'false', 'true'], ['Connection', 'false', 'true'], ['Advanced', 'false', 'true']]);
    expect(next().textContent).toBe('Next: Name →');
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(within(dialog()).getByText(/Advanced, suggested/)).toBeTruthy();
  });

  it('says nothing about the name until the name is tried', () => {
    open();
    fireEvent.click(next());
    expect(next().textContent).toBe('Next: Connection →');
    expect(within(dialog()).queryByText('Name is required')).toBeNull();
    fireEvent.click(next());
    expect(within(dialog()).getByRole('alert').textContent).toBe('Name is required');
    expect(tabs()[1][1]).toBe('true');
    type('Name *', 'Gateway');
    expect(within(dialog()).queryByText('Name is required')).toBeNull();
    type('Name *', '');
    expect(within(dialog()).getByRole('alert').textContent).toBe('Name is required');
  });

  it('creates the source with the same request as before', async () => {
    open();
    fireEvent.click(next());
    type('Name *', 'Gateway');
    fireEvent.click(next());
    type('Broker URL *', 'mqtt://broker.example:1883');
    type('Username *', 'ingest_user');
    type('Password *', 'secret');
    fireEvent.click(next());
    expect(within(dialog()).getByRole('button', { name: 'Create data source' })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create data source' }));
    await waitFor(() => expect(createDataSource).toHaveBeenCalledTimes(1));
    expect(createDataSource.mock.calls[0][0]).toMatchObject({
      sourceType: 'MQTT', profileType: 'MQTT_LOOP_SAMPLES', name: 'Gateway', connectionUrl: 'mqtt://broker.example:1883',
      username: 'ingest_user', password: 'secret', timeoutSeconds: 30, insecureSkipVerify: false,
      profileConfig: { mqtt: { topics: ['OT/+/+/+/+/PIDParams/+'], qos: 1, clean_session: false, session_expiry_seconds: 86400, keepalive_seconds: 60 } },
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('keeps the warnings in view, the help behind ?, and drops the stale texts and emoji', () => {
    open();
    fireEvent.click(next());
    type('Name *', 'Gateway');
    fireEvent.click(next());
    type('Broker URL *', 'mqtts://broker.example:8883');
    type('Username *', 'ingest_user');
    type('Password *', 'secret');
    fireEvent.click(next());
    const text = dialog().textContent ?? '';
    expect(text).toContain('MQTT 5 defaults this to 0, which silently discards them');
    expect(text).toContain('Leave OFF. When on, the broker forgets the subscription');
    expect(text).toContain('No CA certificate loaded');
    fireEvent.click(within(dialog()).getByLabelText('Do not verify the broker certificate'));
    expect(dialog().textContent).toContain('Traffic is encrypted but the broker is NOT authenticated');
    expect(text).not.toMatch(/later phase|Polling and timeouts|step 4|🗑|🛡|💾/);
    expect(text).not.toContain('QoS 1 is required for the broker to queue messages');
    expect(within(dialog()).getByRole('button', { name: 'Remove topic' })).toBeTruthy();
    expect(text).toContain('1. Click Test to verify the broker accepts these credentials');
    expect(text).toContain('2. Every OT tag the gateway publishes must be mapped in the asset model');
  });

  it('adds and removes topic filters', () => {
    open();
    fireEvent.click(next());
    type('Name *', 'Gateway');
    fireEvent.click(next());
    type('Broker URL *', 'mqtt://broker.example:1883');
    type('Username *', 'ingest_user');
    type('Password *', 'secret');
    fireEvent.click(next());
    expect((within(dialog()).getByRole('button', { name: 'Remove topic' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add topic' }));
    expect(within(dialog()).getAllByRole('button', { name: 'Remove topic' })).toHaveLength(2);
    fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Remove topic' })[1]);
    expect(within(dialog()).getAllByRole('button', { name: 'Remove topic' })).toHaveLength(1);
  });
});

describe('Edit data source', () => {
  it('saves the changes, carrying the stored blocks and the stored password', async () => {
    open(existing);
    expect(screen.getByRole('dialog', { name: 'Edit data source' })).toBeTruthy();
    fireEvent.click(next());
    type('Name *', 'Gateway renamed');
    fireEvent.click(next());
    expect((within(dialog()).getByLabelText('Password') as HTMLInputElement).placeholder).toBe('Leave blank to keep current password');
    fireEvent.click(next());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateDataSource).toHaveBeenCalledTimes(1));
    const [id, body] = updateDataSource.mock.calls[0];
    expect(id).toBe('cfg-1');
    expect(body.name).toBe('Gateway renamed');
    expect(body.profileConfig.loop_ingest).toEqual({ mode_value_map: { 1: 'AUT' } });
    expect('password' in body).toBe(false);
  });

  it('keeps a refusal in the dialog with its field', async () => {
    updateDataSource.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 400, data: { error: 'Topic filter is invalid', field: 'topics' } } }));
    open(existing);
    fireEvent.click(next()); fireEvent.click(next()); fireEvent.click(next());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toBe('Topic filter is invalid (topics)');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('goes back with Back, and Cancel leaves without saving', () => {
    open(existing);
    fireEvent.click(next());
    fireEvent.click(within(dialog()).getByRole('button', { name: '← Back' }));
    expect(tabs()[0][1]).toBe('true');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(updateDataSource).not.toHaveBeenCalled();
  });
});
