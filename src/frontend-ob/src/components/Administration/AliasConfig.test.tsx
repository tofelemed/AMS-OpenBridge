// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badges 19-20, owner answers 12a/12c): Tag aliases is one list (the tag with its UNS
// path under it, Source; ⊘ Inactive only on an inactive row) with a search, a Source dropdown with counts, and the shared pager
// (100 per page; it replaced "Showing 500 of 703"); the selected alias in a panel with Delete. Add alias and Import CSV sit in
// the page header. Every request keeps its endpoint and body.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { apiJson, apiFetch, toastError } = vi.hoisted(() => ({ apiJson: vi.fn(), apiFetch: vi.fn(), toastError: vi.fn() }));
let held = ['asset.view', 'asset.edit'];
let total = 3;
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../store/authStore', () => ({ useAuthStore: (pick: (s: unknown) => unknown) => pick({ hasPermission: (p: string) => held.includes(p) }) }));
vi.mock('../../api/apiFetch', async () => {
  const real = await vi.importActual<typeof import('../../api/apiFetch')>('../../api/apiFetch');
  return { ...real, apiJson, apiFetch };
});
vi.mock('react-toastify', () => ({ toast: { error: toastError, success: vi.fn() } }));

import { AliasConfig } from './AliasConfig';

const row = (id: string, legacyPath: string, canonicalPath: string, sourceSystem = 'ot-gateway', isActive = true) =>
  ({ id, legacyPath, canonicalPath, sourceSystem, isActive, createdAt: '2026-10-01T00:00:00Z' });
const ROWS = [
  row('a1', 'FCS0102.PIC30102.PV', 'hdpe/section_100/u1005_catalyst_dosage/pic30102.pv'),
  row('a2', 'FCS0102.PIC30102.SV', 'hdpe/section_100/u1005_catalyst_dosage/pic30102.sp', 'ot-gateway', false),
  row('a3', 'U1-TEMP', 'hdpe/section_100/u1/temp', 'instrumental-pro'),
];
const listCalls = () => apiJson.mock.calls.map(c => String(c[0])).filter(u => u.startsWith('/api/aliases?take=100'));
const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/aliases']}><AliasConfig /><Where /></MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('U1-TEMP');
};
const panel = () => screen.getByRole('complementary');

beforeEach(() => {
  held = ['asset.view', 'asset.edit'];
  total = 3;
  toastError.mockReset();
  apiFetch.mockReset().mockResolvedValue({ ok: true, status: 204 });
  apiJson.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method) return { created: 2, errors: [{ legacyPath: 'X', error: 'duplicate' }] };
    return { total, items: ROWS };
  });
});
afterEach(cleanup);

describe('the alias list', () => {
  it('shows the tag with its UNS path under it and the source, marking only an inactive row', async () => {
    await show();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Tag → UNS path', 'Source']);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows[0]).toBe('FCS0102.PIC30102.PVhdpe/section_100/u1005_catalyst_dosage/pic30102.pvot-gateway');
    expect(rows[1]).toContain('⊘Inactive');
    expect(screen.queryByText(/Showing .* of/)).toBeNull();
    expect(listCalls()[0]).toBe('/api/aliases?take=100&skip=0&includeInactive=true');
  });

  it('offers every source with its count in one dropdown and filters by it', async () => {
    await show();
    const source = screen.getByRole('combobox', { name: 'Source' }) as HTMLSelectElement;
    await waitFor(() => expect([...source.options].map(o => o.textContent)).toEqual(['All sources 3', 'instrumental-pro 1', 'ot-gateway 2']));
    expect(apiJson.mock.calls.some(c => c[0] === '/api/aliases?take=1000&skip=0&includeInactive=true')).toBe(true);
    fireEvent.change(source, { target: { value: 'ot-gateway' } });
    await waitFor(() => expect(listCalls()).toContain('/api/aliases?take=100&skip=0&includeInactive=true&source=ot-gateway'));
  });

  it('searches as typed, from the first page', async () => {
    await show();
    const box = screen.getByRole('searchbox', { name: 'Find tag alias' });
    expect(box.getAttribute('placeholder')).toBe('Tag or path');
    fireEvent.change(box, { target: { value: 'fcs0102' } });
    await waitFor(() => expect(listCalls()).toContain('/api/aliases?take=100&skip=0&includeInactive=true&search=fcs0102'));
  });

  it('reaches every alias through the shared pager, 100 a page', async () => {
    total = 250;
    await show();
    const pager = screen.getByRole('navigation', { name: 'Alias pages' });
    fireEvent.click(within(pager).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(listCalls()).toContain('/api/aliases?take=100&skip=100&includeInactive=true'));
    fireEvent.click(within(pager).getByRole('button', { name: 'Last page' }));
    await waitFor(() => expect(listCalls()).toContain('/api/aliases?take=100&skip=200&includeInactive=true'));
  });
});

describe('the selected alias', () => {
  it('shows the path, the source and the state, and opens the plant model on its path', async () => {
    await show();
    const p = panel();
    expect(within(p).getByText('Tag alias')).toBeTruthy();
    expect(within(p).getByRole('heading', { level: 2 }).textContent).toBe('FCS0102.PIC30102.PV');
    expect(p.textContent).toContain('Canonical UNS pathhdpe/section_100/u1005_catalyst_dosage/pic30102.pv');
    expect(p.textContent).toContain('Sourceot-gateway');
    fireEvent.click(within(p).getByRole('button', { name: 'Plant model ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/plant-model?search=hdpe%2Fsection_100%2Fu1005_catalyst_dosage%2Fpic30102.pv');
  });

  it('asks before deleting, word for word, and sends the same request', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    const d = screen.getByRole('dialog', { name: 'Delete alias' });
    expect(within(d).getByText("Delete the mapping 'FCS0102.PIC30102.PV' → 'hdpe/section_100/u1005_catalyst_dosage/pic30102.pv'? Events using this tag will park as unknown until remapped.")).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/aliases/a1', { method: 'DELETE' }));
  });

  it('says when a delete failed', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 500 });
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete alias' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Delete failed (HTTP 500)'));
  });

  it('shows a reader no write action', async () => {
    held = ['asset.view'];
    await show();
    expect(screen.queryByRole('button', { name: 'Add alias' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('Add alias and Import CSV', () => {
  it('adds an alias in one Mapping part with the same request', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add alias' }));
    const d = screen.getByRole('dialog', { name: 'Add tag alias' });
    expect(within(d).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Mapping']);
    expect((within(d).getByRole('button', { name: 'Create alias' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(d).getByText('Enter the tag and its UNS path first')).toBeTruthy();
    fireEvent.change(within(d).getByLabelText('Legacy / OT tag *'), { target: { value: ' 45FIC109.PV ' } });
    fireEvent.change(within(d).getByLabelText('Canonical UNS path *'), { target: { value: 'hdpe/section_100/u1/45fic109.pv' } });
    expect((within(d).getByRole('textbox', { name: 'Source system' }) as HTMLInputElement).value).toBe('ot-gateway');
    fireEvent.click(within(d).getByRole('button', { name: 'Create alias' }));
    await waitFor(() => expect(apiJson.mock.calls.some(c => c[1]?.method === 'POST' && c[0] === '/api/aliases')).toBe(true));
    const post = apiJson.mock.calls.find(c => c[1]?.method === 'POST' && c[0] === '/api/aliases')!;
    expect(JSON.parse(post[1].body)).toEqual({ legacyPath: '45FIC109.PV', canonicalPath: 'hdpe/section_100/u1/45fic109.pv', sourceSystem: 'ot-gateway' });
  });

  it('imports a CSV in chunks to the same endpoint and lists the row errors', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    const d = screen.getByRole('dialog', { name: 'Import tag aliases from CSV' });
    expect(d.textContent).toContain('legacy_path, canonical_path, source_system. Duplicate (legacy_path, source_system) pairs are reported per row, not fatal.');
    fireEvent.change(within(d).getByRole('textbox', { name: 'File contents' }), {
      target: { value: 'legacy_path,canonical_path,source_system\nA.PV,hdpe/a.pv,\nB.PV,hdpe/b.pv,PI-AF' },
    });
    fireEvent.click(within(d).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(apiJson.mock.calls.some(c => c[0] === '/api/aliases/bulk')).toBe(true));
    const bulk = apiJson.mock.calls.find(c => c[0] === '/api/aliases/bulk')!;
    expect(JSON.parse(bulk[1].body)).toEqual({ creates: [
      { legacyPath: 'A.PV', canonicalPath: 'hdpe/a.pv', sourceSystem: 'ot-gateway' },
      { legacyPath: 'B.PV', canonicalPath: 'hdpe/b.pv', sourceSystem: 'PI-AF' },
    ] });
    expect(await within(d).findByText('X: duplicate')).toBeTruthy();
    expect(d.textContent).toContain('2 alias(es) created.');
  });
});
