// Final review I3: the plain-words guard of Governance (governance/plainWordsCheck.ts, CHG-202) run over every Gate Configuration
// page as a reader without permissions and as one with all of them, so a permission key, a code or a banned word cannot come back.
// The reader text is the text, every aria-label and every placeholder; a title is left out: a setting's code may appear on hover
// (spec, text rules). The fixtures use plain user names: a user name is data, not page text.
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { setActiveZone } from '../../../cpa/activeZone';
import { technicalIn } from '../governance/plainWordsCheck';
import { ConfigStartPage } from './ConfigStartPage';
import { ConfigScopePage } from './ConfigScopePage';
import { ConfigRegionsPage } from './ConfigRegionsPage';
import { ConfigChangePage } from './ConfigChangePage';
import { EffectiveConfigDrawer } from './EffectiveConfigDrawer';
import { BUNDLES, CATALOGUE, DEPLOYMENTS, respond } from './configTestData';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-info', () => ({ ObiInfo: () => null }));

/** Words the Gate Configuration text rules ban on top of Governance's guard (global constraints: no "verified", workers, PREPARE / APPLY, ISO). */
const BANNED: ReadonlyArray<[string, RegExp]> = [['verified', /verified/i], ['workers', /\bworkers?\b/i], ['PREPARE / APPLY', /\b(PREPARE|APPLY)\b/], ['ISO', /\bISO\b/],
  ['No value', /No value/], ['unset', /unset/], ['Not set', /Not set/], ['NO_VALUE', /NO_VALUE/], ['FACTORY', /FACTORY/]];

const sum = (id: string, version: number, state: string, over: Record<string, unknown> = {}) => ({
  bundleId: id, version, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state,
  effectiveFrom: '2026-11-23T06:23:00Z', createdBy: 'engineer', createdAt: '2026-11-23T06:54:00Z', updatedAt: '2026-11-23T06:54:00Z', note: 'Wider region', validationErrors: 0, ...over,
});
const ROWS = {
  LOOP: [sum('l6', 6, 'ACTIVE_VERIFIED'), sum('l7', 7, 'ROLLED_BACK'), sum('l13', 13, 'PARTIALLY_ACKNOWLEDGED')],
  PROFILE: [sum('p1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' })],
  SITE: [sum('s1', 1, 'ACTIVE_VERIFIED', { scopeKind: 'SITE', scopeRef: null })],
};
const START = [...ROWS.LOOP, ...ROWS.PROFILE, ...ROWS.SITE, sum('d1', 1, 'DRAFT', { scopeRef: 'FIC10301' }), sum('f2', 2, 'ACTIVATION_FAILED', { scopeRef: 'FIC10301' })];
const plain = (b: unknown, over: Record<string, unknown> = {}) => ({ ...(b as object), createdBy: 'engineer', ...over });
const TABLE: Record<string, unknown> = {
  l6: plain(BUNDLES.l6), d1: plain(BUNDLES.d1), dv: plain(BUNDLES.dv), da: plain(BUNDLES.da),
  pv: plain(BUNDLES.dv, { bundleId: 'pv', scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' }),
  p1: plain(BUNDLES.dv, { bundleId: 'p1', scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED' }),
  s1: plain(BUNDLES.dv, { bundleId: 's1', scopeKind: 'SITE', scopeRef: null, state: 'ACTIVE_VERIFIED' }),
};
const REGIONS = { count: 2, loops: [
  { loopId: 'FIC10301', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 140, source: 'NONE' },
  { loopId: 'FIC10302', loopType: 'FIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 200, regionMin: 90, regionMax: 120, source: 'LOOP', bundleId: 'l6', bundleVersion: 6 },
] };
const BATCH = { batchId: 'b1', site: 'hdpe', count: 1, createdBy: 'engineer', rows: [
  { loopId: 'FIC10302', site: 'hdpe', bundleId: 'n2', version: 13, state: 'VALIDATED', pvMin: 5, pvMax: 45, error: null, problems: [], deploymentId: null, deploymentState: null, createdBy: 'engineer' },
] };

function answer(url: string): unknown {
  if (url.includes('/configuration/regions?')) return REGIONS;
  if (url.includes('/configuration/loop-settings/stale?')) return { site: 'hdpe', count: 2, loops: [{}, {}] };
  if (url.includes('/configuration/batches/b1?')) return BATCH;
  if (url.includes('/configuration/catalogue')) return { ...CATALOGUE, properties: CATALOGUE.properties.map(p => ({ ...p, editable: true })) };
  if (url.includes('/configuration/drafts?')) {
    const kind = new URL(`http://x${url}`).searchParams.get('scopeKind') as keyof typeof ROWS | null;
    return { site: 'hdpe', projection: 'summary', bundles: kind ? ROWS[kind] : START };
  }
  const one = url.match(/\/configuration\/drafts\/([^/?]+)$/);
  if (one && TABLE[one[1]]) return TABLE[one[1]];
  if (url.includes('/configuration/deployments?')) {
    const list = (DEPLOYMENTS[new URL(`http://x${url}`).searchParams.get('bundleId') ?? ''] ?? []).map(d => ({ ...(d as object), createdBy: 'engineer' }));
    return { count: list.length, deployments: list };
  }
  return respond(url);
}

/** The text a reader sees or hears, without titles (a setting's code may appear on hover). */
const readerText = (): string => [document.body.textContent ?? '',
  ...[...document.body.querySelectorAll('[aria-label],[placeholder]')].flatMap(el => [el.getAttribute('aria-label') ?? '', el.getAttribute('placeholder') ?? ''])].join('\n');
const problems = (text: string) => [...technicalIn(text), ...BANNED.filter(([, re]) => re.test(text)).map(([name, re]) => `${name}: ${re.exec(text)?.[0]}`)];

const READER = ['cpm.config.read'];
const ALL = ['cpm.config.read', 'cpm.config.draft', 'cpm.config.validate', 'cpm.config.shadow', 'cpm.config.approve', 'cpm.config.activate', 'cpm.config.rollback'];

async function pageText(url: string, permissions: string[]): Promise<string> {
  useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/cpm/config" element={<ConfigStartPage />} />
          <Route path="/cpm/config/loops/:loopId" element={<ConfigScopePage kind="LOOP" />} />
          <Route path="/cpm/config/types/:profileId" element={<ConfigScopePage kind="PROFILE" />} />
          <Route path="/cpm/config/plant/:site" element={<ConfigScopePage kind="SITE" />} />
          <Route path="/cpm/config/regions" element={<ConfigRegionsPage />} />
          <Route path="/cpm/config/changes/:bundleId" element={<ConfigChangePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() => {
    expect(screen.queryByText(/Loading/)).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
  const text = readerText();
  cleanup();
  return text;
}

const PAGES = [
  '/cpm/config', '/cpm/config/loops/FIC10302', '/cpm/config/loops/FIC10302?tab=region', '/cpm/config/loops/FIC10302?tab=versions',
  '/cpm/config/types/FLOW_FAST_SELF_REG?site=hdpe', '/cpm/config/plant/hdpe', '/cpm/config/regions?site=hdpe&batch=b1',
  ...['edit', 'check', 'try', 'approve', 'deploy'].flatMap(step => [`/cpm/config/changes/dv?step=${step}`, `/cpm/config/changes/l6?step=${step}`]),
  '/cpm/config/changes/d1?step=check', '/cpm/config/changes/da?step=deploy', '/cpm/config/changes/pv?step=try',
];

describe('Gate Configuration pages say nothing technical (I3 text guard)', () => {
  beforeAll(() => setActiveZone('UTC'));
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => answer(url));
  });
  afterEach(cleanup);

  it.each(PAGES)('%s, without permissions and with all of them', async (url) => {
    for (const permissions of [READER, ALL]) {
      const text = await pageText(url, permissions);
      expect(text.length).toBeGreaterThan(0);
      expect(problems(text).join(' | ')).toBe('');
    }
  });

  it('a reader without cpm.config.read sees a plain refusal', async () => {
    useAuthStore.setState({ user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: [] }, status: 'authenticated', accessToken: 't' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/cpm/config']}><Routes><Route path="/cpm/config" element={<ConfigStartPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByText("You don't have access to Gate Configuration.");
    expect(problems(readerText()).join(' | ')).toBe('');
  });

  it('the Loop Explorer drawer, with its parts and its version, says nothing technical', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><EffectiveConfigDrawer loopId="FIC10302" /></MemoryRouter></QueryClientProvider>);
    await screen.findByText('Where it runs');
    const text = readerText();
    expect(text).toContain('Own settings v6');
    expect(text).toContain('Short checks');
    expect(text).toContain('Verdicts');
    expect(text).not.toMatch(/AMS - |CPLM|Feature Engine/);
    expect(problems(text).join(' | ')).toBe('');
  });

  it('the guard itself catches a permission key, a code and a banned word', () => {
    expect(problems('Needs the cpm.config.draft permission')).not.toEqual([]);
    expect(problems('SUSPECTED_STICTION')).not.toEqual([]);
    expect(problems('Active (verified)')).not.toEqual([]);
    expect(problems('Needs permission to prepare changes')).toEqual([]);
    for (const w of ['No value', 'unset', 'Not set', 'NO_VALUE', 'FACTORY']) expect(problems(`a ${w} here`)).not.toEqual([]);
    expect(problems('Factory')).toEqual([]);
  });
});
