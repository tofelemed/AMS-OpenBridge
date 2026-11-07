// CHG-153: a link to a restricted page is shown only to a role the route lets in.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => nav }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../../hooks/useCpm', () => ({
  useCpmResolutions: () => ({ data: { fusion: { firesOn: ['12h', '24h'] }, windows: [] } }),
  useLatestGates: () => ({ isLoading: false, isError: false, data: undefined }),
}));

import { NoEvaluatedLoops } from './investigation/CaseTriage';
import { CalculationsTab } from './explorer/CalculationsTab';
import { nextChecks } from './investigation/nextChecks';
import { row } from './evidence/windowFixtures';

const asUser = (permissions: string[]) =>
  useAuthStore.setState({ user: { user_id: 'u', username: 'eng', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });
const scope = { active: false, set: vi.fn() } as never;
const LOOP = { loopId: 'L1', tags: {}, links: [] } as never;

beforeEach(() => asUser(['cpm.view']));
afterEach(() => { cleanup(); nav.mockReset(); });

describe('Pipeline Health links', () => {
  it('Case triage offers Pipeline Health only with system.manage', () => {
    render(<MemoryRouter><NoEvaluatedLoops scope={scope} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Pipeline Health/ })).toBeNull();
    cleanup();
    asUser(['system.manage']);
    render(<MemoryRouter><NoEvaluatedLoops scope={scope} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Pipeline Health/ })).toBeTruthy();
  });

  it('Calculations offers Pipeline Health only with system.manage', () => {
    render(<MemoryRouter><CalculationsTab loop={LOOP} pageWindowKind="12h" /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Pipeline Health/ })).toBeNull();
    cleanup();
    asUser(['system.manage']);
    render(<MemoryRouter><CalculationsTab loop={LOOP} pageWindowKind="12h" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Pipeline Health/ }).getAttribute('href')).toBe('/cpm/pipeline');
  });

  it('Next checks name the engine only when the user may open it', () => {
    const m = row('2026-11-05T10:15:00Z', { diagnosis: 'NOT_EVALUATED' });
    const links = (canPipeline: boolean) => nextChecks(m, { loopId: 'L1', windowKind: '12h', canPipeline }).map(c => c.link);
    expect(links(false)).toEqual(['Loop Explorer ↗']);
    expect(links(true)).toEqual(['Loop Explorer ↗', 'Pipeline Health ↗']);
  });
});
