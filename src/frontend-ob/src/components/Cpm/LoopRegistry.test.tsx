// Task 23: the Loop Registry list shows Loop, Loop type and VP; a row opens the loop's detail page.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LoopRegistry } from './LoopRegistry';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./ProfileAside', () => ({ default: (p: { loop: CpmLoop }) => <aside>detail of {p.loop.loopId}</aside> }));
vi.mock('./AddLoopWizard', () => ({ default: () => <div>wizard</div> }));
vi.mock('./BulkImportDialog', () => ({ default: () => <div>import</div> }));

const loop = (id: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: id, assetId: null, displayName: `${id} service`, site: 'hdpe', area: 'A1', unit: 'U1', loopType: 'FIC',
  criticality: 'medium', isActive: true, monitoringEnabled: true, tags: { VP: 'x' }, observabilityFlags: [], links: [],
  stepTestApproved: false, thresholdProfileId: 'prof-1', model: null, ...over,
} as CpmLoop);

let loops: CpmLoop[] = [];
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useFleetSummary: () => ({ data: { capability: { loopsCappedByMissingVp: 236, loopsWithoutDisturbanceContext: 241 } } }),
}));

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><LoopRegistry /><Where /></MemoryRouter>);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});

beforeEach(() => { loops = [loop('FIC1'), loop('FIC2', { loopType: 'PIC' })]; asUser(['cpm.manage']); });
afterEach(cleanup);

describe('LoopRegistry list', () => {
  it('shows Loop, Loop type and VP only', () => {
    open('/cpm/registry');
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads).toEqual(['Loop', 'Loop type', 'VP']);
    for (const gone of ['Profile', 'State', 'Loop model (registry)', 'Type']) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.queryByText('Registered assets')).toBeNull();
    expect(screen.queryByText(/Pick a loop in the registry list/)).toBeNull();
    expect(screen.getAllByText('service').length).toBe(2);
  });

  it('opens detail from a row and keeps search and page for Back', () => {
    open('/cpm/registry?search=FIC&page=2');
    // page 2 of a one-page list is clamped, the row is still there
    fireEvent.click(screen.getByRole('link', { name: /FIC1/ }));
    const where = screen.getByTestId('where').textContent!;
    expect(where).toContain('loop=FIC1');
    expect(where).toContain('search=FIC');
    fireEvent.click(screen.getByRole('button', { name: '← Loop Registry' }));
    const back = screen.getByTestId('where').textContent!;
    expect(back).not.toContain('loop=');
    expect(back).toContain('search=FIC');
  });

  it('disables Add loop and Bulk import with a reason without cpm.manage', () => {
    asUser([]);
    open('/cpm/registry');
    expect((screen.getByRole('button', { name: 'Add loop' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Bulk import' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(2);
  });

  it('enables them with cpm.manage', () => {
    open('/cpm/registry');
    expect((screen.getByRole('button', { name: 'Add loop' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Needs the cpm.manage permission')).toBeNull();
  });

  it('shows configuration limits as a compact line', () => {
    open('/cpm/registry');
    const line = screen.getByLabelText('Configuration limits');
    expect(within(line).getByText('236')).toBeTruthy();
    expect(within(line).getByText('241')).toBeTruthy();
    expect(line.textContent).toMatch(/valve positions/);
    expect(line.textContent).toMatch(/peer links/);
  });

  it('marks a retired loop and can show them', () => {
    loops = [loop('FIC1'), loop('OLD1', { isActive: false })];
    open('/cpm/registry');
    expect(screen.queryByText('OLD1')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Show retired/ }));
    expect(screen.getByText('OLD1')).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
  });

  it('shows the existing detail panel for ?loop= until the detail page lands', () => {
    open('/cpm/registry?loop=FIC2');
    expect(screen.getByText('detail of FIC2')).toBeTruthy();
  });
});
