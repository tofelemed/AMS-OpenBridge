// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample): Import plant model from CSV in three tabs, Source · Review · Import, with
// "Nothing is written until the last step." once; Columns with Download template; the same checks and the same three requests.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../api/apiFetch', async () => {
  const real = await vi.importActual<typeof import('../../api/apiFetch')>('../../api/apiFetch');
  return { ...real, apiJson };
});
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

import { ImportDialog } from './PlantModelImport';

const CSV = 'site,area,unit,device,measurement,name,description,engineering_unit,range_lo,range_hi,device_template,ot_tag\n'
  + 'hdpe,section_100,u1001_polymerization_reactor_1,45fic109,pv,45FIC-109 PV,Feed flow PV,m3/h,0,500,,45FIC109.PV';
const onClose = vi.fn();
const dialog = () => screen.getByRole('dialog', { name: 'Import plant model from CSV' });
const tabs = () => within(dialog()).getAllByRole('tab').map(t => [t.textContent, t.getAttribute('aria-selected'), t.getAttribute('aria-disabled')]);
const calls = (url: string) => apiJson.mock.calls.filter(c => c[0] === url);

beforeEach(() => {
  onClose.mockReset();
  apiJson.mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith('/by-paths')) return [{ contextualPath: 'hdpe' }, { contextualPath: 'hdpe/section_100' }, { contextualPath: 'hdpe/section_100/u1001_polymerization_reactor_1' }];
    if (url === '/api/assets/bulk') return { created: [{}, {}], errors: [] };
    if (url === '/api/aliases/bulk') return { created: 1, errors: [] };
    return {};
  });
});
afterEach(cleanup);

describe('Import plant model from CSV', () => {
  it('opens on Source with the columns, the file contents and the rule, and says why Validate is off', () => {
    render(<ImportDialog onClose={onClose} />);
    expect(tabs()).toEqual([['Source', 'true', null], ['Review', 'false', 'true'], ['Import', 'false', 'true']]);
    expect(within(dialog()).getByText('Nothing is written until the last step.')).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Download template' })).toBeTruthy();
    expect(dialog().textContent).toContain('Level cells accept the path segment (section_100) or the display name (Section 100).');
    expect(within(dialog()).getByRole('checkbox', { name: /Create missing hierarchy levels/ })).toBeTruthy();
    expect((within(dialog()).getByRole('button', { name: 'Validate →' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog()).getByText('Paste the file contents first')).toBeTruthy();
  });

  it('validates with one by-paths read, reviews, then imports assets and aliases with the same requests', async () => {
    render(<ImportDialog onClose={onClose} />);
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'File contents' }), { target: { value: CSV } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Validate →' }));
    await waitFor(() => expect(tabs()[1][1]).toBe('true'));
    expect(calls('/api/assets/by-paths')).toHaveLength(1);
    expect(dialog().textContent).toContain('2 asset(s) to create');
    expect(dialog().textContent).toContain('1 OT alias(es)');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import 2 asset(s)' }));
    await waitFor(() => expect(tabs()[2][1]).toBe('true'));
    expect(JSON.parse(calls('/api/assets/bulk')[0][1].body).creates.map((c: { contextualPath: string }) => c.contextualPath)).toEqual([
      'hdpe/section_100/u1001_polymerization_reactor_1/45fic109', 'hdpe/section_100/u1001_polymerization_reactor_1/45fic109.pv',
    ]);
    expect(JSON.parse(calls('/api/aliases/bulk')[0][1].body)).toEqual({ creates: [
      { legacyPath: '45FIC109.PV', canonicalPath: 'hdpe/section_100/u1001_polymerization_reactor_1/45fic109.pv', sourceSystem: 'ot-gateway' },
    ] });
    expect(dialog().textContent).toContain('2 asset(s) created, 1 alias(es) written.');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('refuses rows under unknown hierarchy unless asked to create it, as before', async () => {
    apiJson.mockImplementation(async (url: string) => (url.endsWith('/by-paths') ? [] : {}));
    render(<ImportDialog onClose={onClose} />);
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'File contents' }), { target: { value: CSV } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Validate →' }));
    expect(await within(dialog()).findByText(/Line 2: site 'hdpe' is not in the asset model/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: '← Back' }));
    expect(tabs()[0][1]).toBe('true');
  });
});
