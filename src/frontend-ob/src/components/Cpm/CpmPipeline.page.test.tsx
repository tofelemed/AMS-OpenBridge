// CHG-170 (owner review, the approved sample docs/theme/redesign/samples/pipeline-health-proposal.html and the answers of 11 Nov):
// the header is the eyebrow and the title (no ?), Jobs | Checkpoint history (?view=) and How to read top right; four tiles; the
// grouped list beside the selected job's panel, the verification under it; the engine-down empty state shows when the engine is
// down (it never could while the status read worked); a failed metrics read keeps the last numbers and says how old they are.
// The verification POSTs the same recompute request as before, on the loop with the newest verdict.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { setActiveZone } from '../../cpa/activeZone';
import { CpmPipeline } from './CpmPipeline';
import { LAB, respond, type Lab } from './pipeline/pipelineTestData';

vi.mock('../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('echarts-for-react', () => ({ default: () => null }));

const Probe: React.FC = () => <div data-testid="loc">{useLocation().search}</div>;
let qc: QueryClient;
function mount(search = '', lab: Lab = LAB) {
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => respond(lab, url, init));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cpm/pipeline${search}`]}>
        <Routes><Route path="/cpm/pipeline" element={<><CpmPipeline /><Probe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId('loc').textContent ?? '';
const tile = (label: string) => screen.getByText(label, { selector: '.cpm-kpicard__label' }).closest('.cpm-kpicard') as HTMLElement;
const calls = () => vi.mocked(fetchMod.apiJson).mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method ?? 'GET', body: init?.body }));
const grant = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'superadmin', email: '', role: 'SuperAdmin', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});

beforeAll(() => setActiveZone('UTC'));
beforeEach(() => { vi.mocked(fetchMod.apiJson).mockReset(); grant(['system.manage', 'cpm.manage', 'analytics.view']); });
afterEach(cleanup);

describe('Pipeline Health page (CHG-170)', () => {
  it('heads the page with the eyebrow and title only, the two views and How to read top right', async () => {
    const { container } = mount();
    const header = container.querySelector('.cpm-workspace-header') as HTMLElement;
    expect(within(header).getByText('System')).toBeTruthy();
    expect(within(header).getByRole('heading', { level: 1, name: 'Pipeline Health' })).toBeTruthy();
    expect(within(header).getAllByRole('button').map(b => b.textContent)).toEqual(['Jobs', 'Checkpoint history', 'How to read']);
    expect(container.querySelector('.ui-toggletip')).toBeNull();
    fireEvent.click(within(header).getByText('How to read'));
    expect(screen.getByRole('dialog', { name: 'How to read' })).toBeTruthy();
  });

  it('lists the jobs grouped beside the first running job, and the verification under the panel', async () => {
    const { container } = mount();
    await screen.findByText('Alarm State Machine');
    expect([...container.querySelectorAll('.cpm-pipeline-group')].map(g => g.textContent))
      .toEqual(['Alarm', 'CPLM', 'Platform', 'Not on the required list']);
    const panel = container.querySelector('.ui-inspector') as HTMLElement;
    expect(within(panel).getByRole('heading', { name: 'CPLM Short Feature Engine' })).toBeTruthy();
    const col = panel.parentElement as HTMLElement;
    expect(within(col).getByRole('heading', { name: 'End-to-end verification' })).toBeTruthy();
    expect(screen.queryByText(/Not exposed|Telemetry|Observed jobs/)).toBeNull();
  });

  it('a tile selects the job behind it', async () => {
    const { container } = mount();
    await screen.findByText('Alarm State Machine');
    fireEvent.click(tile('Checkpoint age'));
    expect(within(container.querySelector('.ui-inspector') as HTMLElement).getByRole('heading', { name: 'CPLM Instrument Context Engine' })).toBeTruthy();
    fireEvent.click(tile('Required jobs'));
    expect(within(container.querySelector('.ui-inspector') as HTMLElement).getByRole('heading', { name: 'Alarm State Machine' })).toBeTruthy();
  });

  it('opens Checkpoint history as the second view in the address, the tiles kept', async () => {
    mount();
    await screen.findByText('Alarm State Machine');
    fireEvent.click(screen.getByRole('button', { name: 'Checkpoint history' }));
    expect(loc()).toBe('?view=history');
    expect(screen.getByRole('heading', { level: 2, name: 'Checkpoint history' })).toBeTruthy();
    expect(screen.queryByText('Alarm State Machine')).toBeNull();
    expect(screen.getByText('Required jobs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jobs' }));
    expect(loc()).toBe('');
  });

  it('shows the engine-down state when the engine is down, though the status read works', async () => {
    const down: Lab = { ...LAB, engineDown: true };
    const { container } = mount('', down);
    expect(await screen.findByText('The analysis engine did not answer')).toBeTruthy();
    expect(screen.queryByText('Alarm State Machine')).toBeNull();
    expect(container.querySelector('.cpm-event-head')).toBeNull();
    expect(container.querySelector('.ui-inspector__eyebrow')).toBeNull();
    expect(tile('Required jobs').textContent).toContain('analysis engine not answering');
    expect(screen.getByRole('heading', { name: 'End-to-end verification' })).toBeTruthy();
    // no job can be shown: the tile moves to the list and its message instead of selecting a hidden job
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      fireEvent.click(tile('Required jobs'));
      act(() => { vi.runAllTimers(); });
    } finally { vi.useRealTimers(); }
    expect(document.activeElement?.id).toBe('pipeline-jobs');
    expect(container.querySelector('.ui-inspector__eyebrow')).toBeNull();
  });

  it('keeps the last numbers when a metrics read fails, and says once how old they are', async () => {
    const lab: Lab = { ...LAB };
    mount('', lab);
    await screen.findByText('Alarm State Machine');
    lab.metricsFail = true;
    await act(async () => { await qc.refetchQueries({ queryKey: ['cpm', 'pipeline-metrics'] }); });
    const stale = await screen.findByText(/^Engine metrics could not be read · the numbers are from \d\d:\d\d UTC, 3 min ago$/);
    expect(stale).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Jobs' })).getByText('CPLM Short Feature Engine').closest('.cpm-event-row')!.textContent).toContain('25 / 0');
    expect(screen.queryByText('Analysis engine metrics unavailable')).toBeNull();
    lab.metricsFail = false;
    fireEvent.click(within(stale.closest('.cpm-pipeline-stale') as HTMLElement).getByText('Retry'));
    await waitFor(() => expect(screen.queryByText(/Engine metrics could not be read/)).toBeNull());
  });

  it('posts the same recompute request as before, on the loop with the newest verdict', async () => {
    mount();
    await screen.findByText('Alarm State Machine');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run end-to-end verification' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Run end-to-end verification' }));
    const dialog = screen.getByRole('dialog', { name: 'Run end-to-end verification' });
    expect(calls().filter(c => c.method !== 'GET')).toEqual([]);
    fireEvent.click(within(dialog).getByText('Start verification'));
    await waitFor(() => expect(calls().filter(c => c.method !== 'GET')).toEqual([
      { url: '/api/v1/cpm/loops/FIC10301/recompute', method: 'POST', body: undefined },
    ]));
    expect(await screen.findByText('2 written')).toBeTruthy();
    const card = screen.getByRole('heading', { name: 'End-to-end verification' }).closest('section') as HTMLElement;
    expect(card.textContent).toContain('✓Verified');
    expect(card.textContent).toContain('FIC10301');
  });

  it('reads a finished run that wrote no result as not verified', async () => {
    mount('', { ...LAB, gateResults: 0 });
    await screen.findByText('Alarm State Machine');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run end-to-end verification' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Run end-to-end verification' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Start verification'));
    expect(await screen.findByText('None written: no verdict reached the database')).toBeTruthy();
    const card = screen.getByRole('heading', { name: 'End-to-end verification' }).closest('section') as HTMLElement;
    expect(card.textContent).toContain('✕Not verified');
  });

  it('keeps the start disabled, with its reason, without cpm.manage', async () => {
    grant(['system.manage', 'analytics.view']);
    mount();
    await screen.findByText('Alarm State Machine');
    expect(screen.getByText('Needs the cpm.manage permission')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run end-to-end verification' })).toHaveProperty('disabled', true);
  });

  it('says what it waits for while the loop with the newest verdict is not known yet', async () => {
    mount('', { ...LAB, rankingsPending: true });
    await screen.findByText('Alarm State Machine');
    expect(await screen.findByText('Finding the loop with the newest verdict…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run end-to-end verification' })).toHaveProperty('disabled', true);
  });

  it('says the verdict could not be read, and runs on the first monitored loop, when the ranking fails on an older service', async () => {
    mount('', { ...LAB, oldApi: true, rankingsFail: true });
    await screen.findByText('Alarm State Machine');
    await waitFor(() => expect(tile('Last fused verdict').textContent).toContain('could not be read'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run end-to-end verification' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Run end-to-end verification' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Start verification'));
    await waitFor(() => expect(calls().filter(c => c.method !== 'GET').map(c => c.url)).toEqual(['/api/v1/cpm/loops/AIC30601/recompute']));
  });

  it('degrades without the new fields: the verdict from the ranking, no rows off the list', async () => {
    const { container } = mount('', { ...LAB, oldApi: true });
    await screen.findByText('Alarm State Machine');
    expect([...container.querySelectorAll('.cpm-pipeline-group')].map(g => g.textContent)).toEqual(['Alarm', 'CPLM', 'Platform']);
    const v = tile('Last fused verdict');
    await waitFor(() => expect(v.textContent).toContain('window ended 6 Nov 23:45 UTC'));
  });
});
