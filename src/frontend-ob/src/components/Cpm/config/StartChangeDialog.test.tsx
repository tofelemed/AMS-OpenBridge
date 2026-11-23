// Task 7: the Change settings dialog. Apply to (loop / type / plant, each with its loop count), a required Reason, Start creates the
// draft from the version running at the chosen level and opens its change page.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { StartChangeDialog } from './StartChangeDialog';
import { respond, LOOP_LEVEL } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);

const Loc: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const refused = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) }) as unknown as Response;
const posts = () => vi.mocked(fetchMod.apiFetch).mock.calls.map(([url, init]) => ({ url: String(url), method: (init as RequestInit).method, body: JSON.parse(String((init as RequestInit).body)) }));

function show(props: Partial<React.ComponentProps<typeof StartChangeDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/cpm/config/loops/FIC10302']}>
        <Routes><Route path="*" element={<><StartChangeDialog open site="hdpe" loopId="FIC10302" profileId="FLOW_FAST_SELF_REG" counts={{ type: 47, plant: 177 }} onClose={onClose} {...props} /><Loc /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onClose;
}

describe('StartChangeDialog', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => {
      if (url.includes('/configuration/drafts?') && url.includes('scopeKind=LOOP')) {
        return { site: 'hdpe', projection: 'summary', bundles: LOOP_LEVEL.map(x => (x.bundleId === 'l6' ? { ...x, bundleId: 'v12', version: 12 } : x)) };
      }
      return respond(url);
    });
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ok({ bundleId: 'new1' }));
  });

  it('offers this loop, the type and the whole plant with their loop counts; the loop is chosen', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Change settings' })).toBeTruthy();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map(r => r.closest('label')!.textContent)).toEqual(['This loop only1 loop', 'Every flow, fast self-regulating loop47 loops', 'The whole plant177 loops']);
    expect(radios[0].checked).toBe(true);
  });

  it('on a type page offers the type and the plant; on a plant page only the reason', () => {
    show({ loopId: undefined });
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    cleanup();
    show({ loopId: undefined, profileId: undefined });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByLabelText('Reason')).toBeTruthy();
  });

  it('keeps Start disabled until a reason is typed, and Cancel sends nothing', async () => {
    const onClose = show();
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    await waitFor(() => expect(vi.mocked(fetchMod.apiJson)).toHaveBeenCalled());
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '   ' } });
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wider region' } });
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(posts()).toEqual([]);
  });

  it('Start creates the draft from the active version of the level and opens its change page', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wider region' } });
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/cpm/config/changes/new1?step=edit'));
    expect(posts()).toEqual([{ url: expect.stringContaining('/configuration/drafts'), method: 'POST',
      body: { site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'v12', note: 'Wider region' } }]);
  });

  it('shows a refusal in the dialog and stays open', async () => {
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => refused(403, 'no permission to draft'));
    show();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'x' } });
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    expect((await screen.findByRole('alert')).textContent).toContain('no permission to draft');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not offer an empty type and keeps Start disabled while the loop type is unknown', async () => {
    show({ profileId: undefined });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wider region' } });
    await waitFor(() => expect(vi.mocked(fetchMod.apiJson)).toHaveBeenCalled());
    expect(document.body.textContent).not.toMatch(/Every\s+loop/);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
