// Gate Configuration journey, task 9: the one-loop region dialog (approved look: data-screen="region").
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import type { LoopRegion } from '../../../api/cpm/configRegions';
import { EditRegionDialog } from './EditRegionDialog';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-info', () => ({ ObiInfo: () => null }));

const LOOP: LoopRegion = { loopId: 'FIC10302', displayName: null, loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 200, regionMin: 90, regionMax: 120, source: 'LOOP', bundleId: 'l12', bundleVersion: 12 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function setup(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter>
    <EditRegionDialog open site="hdpe" loop={LOOP} onClose={vi.fn()} onSaved={onSaved} />
  </MemoryRouter></QueryClientProvider>);
  return onSaved;
}

describe('EditRegionDialog', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b7', count: 1, drafts: 1, failed: 0, rows: [] }));
  });
  afterEach(cleanup);

  it('shows the current region and the PV range once, and the loop in the title', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Operating region · FIC10302' })).toBeTruthy();
    expect(screen.getByText('Now 90 – 120 · PV range 0 – 200')).toBeTruthy();
    expect((screen.getByLabelText('Minimum') as HTMLInputElement).value).toBe('90');
  });

  it('needs a reason; names the side outside the PV range; a value that does not parse blocks Save', () => {
    setup();
    const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '250' } });
    expect(screen.getByText('Above the PV range')).toBeTruthy();
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'wider' } });
    expect(save().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: 'abc' } });
    expect(screen.getByText('Not a number')).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it('Save posts the one row with the reason and hands over the batch', async () => {
    const onSaved = setup();
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '125' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wider region' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('b7'));
    const [url, init] = vi.mocked(fetchMod.apiFetch).mock.calls[0];
    expect(String(url)).toBe('/api/v1/cpm/configuration/regions');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ regions: [{ loopId: 'FIC10302', pvMin: 90, pvMax: 125 }], note: 'Wider region' });
  });

  it('a row the server refused stays in the dialog with its reason', async () => {
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ batchId: 'b8', count: 1, drafts: 0, failed: 1, rows: [{ loopId: 'FIC10302', error: 'the loop is retired' }] }));
    const onSaved = setup();
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '125' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('the loop is retired')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('the region error is an alert that the Maximum input points to', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '250' } });
    const msg = screen.getByText('Above the PV range');
    expect(msg.getAttribute('role')).toBe('alert');
    const max = screen.getByLabelText('Maximum');
    expect(max.getAttribute('aria-describedby')).toBe(msg.id);
    expect(max.getAttribute('aria-invalid')).toBe('true');
  });
});
