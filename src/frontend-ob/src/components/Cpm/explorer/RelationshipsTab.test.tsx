// @vitest-environment jsdom
/** Relationships: each linked loop opens its own Relationships tab; lineage is a closed disclosure; the G13 text is behind a ?. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';

const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => nav }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmCalculations: () => ({ data: { gates: [{ observedInResults: true }], engine: 'Flink' } }),
  useLatestGates: () => ({ data: { metadata: { calculationVersion: '2.9' } } }),
}));

import { RelationshipsTab } from './RelationshipsTab';

afterEach(() => { cleanup(); nav.mockReset(); });

const loop = (links: unknown[]) => ({ loopId: 'L1', tags: { PV: 'a' }, links } as unknown as CpmLoop);
const tab = (l: CpmLoop) => render(<MemoryRouter><RelationshipsTab loop={l} /></MemoryRouter>);

describe('RelationshipsTab', () => {
  it('opens the Relationships tab of a linked loop', () => {
    tab(loop([{ relType: 'PEER', toLoopId: 'L2', origin: 'asset-model' }]));
    fireEvent.click(screen.getByRole('button', { name: 'L2' }));
    const href = String(nav.mock.calls[0][0]);
    expect(href).toContain('/cpm/explorer');
    expect(href).toContain('loop=L2');
    expect(href).toContain('tab=Relationships');
  });

  it('keeps the lineage in a disclosure that starts closed', () => {
    const { container } = tab(loop([]));
    const d = container.querySelector('details');
    expect(d).toBeTruthy();
    expect(d!.open).toBe(false);
    expect(d!.textContent).toContain('UNS signals');
  });

  it('keeps the G13 explanation behind a ? and offers the Loop Registry when there are no links', () => {
    tab(loop([]));
    expect(screen.queryByText('Peer topology (G13)')).toBeNull();
    expect(screen.queryByText(/Create asset relationships, then republish evidence/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Peer topology (G13)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Loop Registry →' }));
    expect(String(nav.mock.calls[0][0])).toContain('/cpm/registry');
  });
});
