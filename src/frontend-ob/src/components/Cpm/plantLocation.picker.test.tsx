// CHG-168 (owner review, found on the way): before a site is picked, Area and Unit read "— choose a site first —", not
// "— no areas modelled —" / "— no units modelled —"; the picker is a titled part with its help behind ? and Enter manually.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../api/apiFetch', () => ({
  apiFetch: vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('/filters/sites') ? [{ path: 'hdpe', name: 'HDPE Plant', segment: 'hdpe' }] : []),
  })),
}));

import { PlantLocationPicker } from './plantLocation';

afterEach(cleanup);
const show = (site = '') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <PlantLocationPicker value={{ site, area: '', unit: '' }} onChange={() => undefined} />
  </QueryClientProvider>);
const optionsOf = (name: string) => Array.from((screen.getByLabelText(name) as HTMLSelectElement).options).map(o => o.textContent);

describe('PlantLocationPicker', () => {
  it('asks for a site first instead of saying nothing is modelled', async () => {
    show();
    await waitFor(() => expect(optionsOf('Site *')).toContain('HDPE Plant (hdpe)'));
    expect(optionsOf('Area')).toEqual(['— choose a site first —']);
    expect(optionsOf('Unit')).toEqual(['— choose a site first —']);
    expect(screen.queryByText(/no areas modelled|no units modelled/)).toBeNull();
  });

  it('is a titled part, its help behind ?, with Enter manually', async () => {
    show('hdpe');
    expect(screen.getByRole('heading', { name: 'Plant location' })).toBeTruthy();
    expect(screen.queryByText(/Picked from the UNS asset model/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plant location' }));
    expect(screen.getByText(/Picked from the UNS asset model/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enter manually' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
    expect((screen.getByLabelText('Site *') as HTMLInputElement).value).toBe('hdpe');
    expect(screen.getByText(/Manual entry/)).toBeTruthy();
  });
});
