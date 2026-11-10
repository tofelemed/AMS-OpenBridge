// @vitest-environment jsdom
/** CHG-128: one loop control on every loop page. It follows the header scope, and a loop outside the scope stays selected and says so. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoopBand } from './LoopBand';

const LOOPS: Array<Record<string, unknown>> = [
  { loopId: 'FIC00701', displayName: 'Flow controller FIC00701 (FCS0102)', site: 'hdpe', area: 'section_200', unit: 'u1', loopType: 'FIC' },
  { loopId: 'TIC10101', displayName: 'Reactor temperature', site: 'hdpe', area: 'section_100', unit: 'u2', loopType: 'TIC' },
  { loopId: 'OLD00001', displayName: 'Old loop', site: 'hdpe', area: 'section_200', unit: 'u2', loopType: 'FIC', isActive: false },
];
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: LOOPS }, isLoading: false, isError: false, error: null, refetch: () => {} }) }));

afterEach(cleanup);

const band = (url: string, props: Partial<React.ComponentProps<typeof LoopBand>> = {}) => render(
  <MemoryRouter initialEntries={[url]}>
    <LoopBand loopId="FIC00701" onLoop={() => {}} {...props} />
  </MemoryRouter>,
);
const control = () => screen.getByRole('button', { name: /^Loop: FIC00701/ });

describe('LoopBand', () => {
  it('names the loop once, without repeating its tag', () => {
    band('/cpm/loop');
    expect(control().textContent).toContain('FIC00701 Flow controller (FCS0102)');
  });

  it('opens the Find loop box and the tree, and reports the chosen loop', () => {
    const onLoop = vi.fn();
    band('/cpm/loop', { onLoop });
    fireEvent.click(control());
    expect(screen.getByLabelText('Find loop')).toBeTruthy();
    fireEvent.click(screen.getByText('TIC10101'));
    expect(onLoop).toHaveBeenCalledWith('TIC10101');
  });

  it('lists only the loops in the header scope', () => {
    band('/cpm/loop?site=hdpe&area=section_100', { loopId: 'TIC10101' });
    fireEvent.click(screen.getByRole('button', { name: /^Loop: TIC10101/ }));
    expect(screen.getByText('1 of 3 loop(s)')).toBeTruthy();
  });

  it('says so, readably, when the loop is outside the scope', () => {
    band('/cpm/loop?site=hdpe&area=section_100');
    expect(screen.getByRole('status').textContent).toMatch(/FIC00701 is outside the plant scope/);
  });

  it('says so when the loop is not in the registry', () => {
    band('/cpm/loop', { loopId: 'NOPE' });
    expect(screen.getByRole('status').textContent).toMatch(/NOPE is not in the loop registry/);
  });

  it('offers Clear loop only when the page can clear it', () => {
    const onClear = vi.fn();
    band('/cpm/loop', { onClear });
    fireEvent.click(control());
    fireEvent.click(screen.getByRole('button', { name: 'Clear loop' }));
    expect(onClear).toHaveBeenCalled();
    cleanup();
    band('/cpm/loop');
    fireEvent.click(control());
    expect(screen.queryByRole('button', { name: 'Clear loop' })).toBeNull();
  });

  it('holds what the tab needs, and pushes the end to the far side', () => {
    const { container } = band('/cpm/loop', { children: <span>tab control</span>, end: <span>end control</span> });
    expect(screen.getByText('tab control')).toBeTruthy();
    expect(container.querySelector('.cpm-band__end')?.textContent).toBe('end control');
  });

  // CHG-153: a bookmark to a retired loop must not read as a running one
  it('marks a retired loop Retired beside the control, and in the tree', () => {
    band('/cpm/loop', { loopId: 'OLD00001' });
    expect(screen.getAllByText('Retired')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Loop: OLD00001/ }));
    expect(screen.getAllByText('Retired')).toHaveLength(2);
  });

  // CHG-158: the header sets the plant scope, so the list is the loops themselves, by tag, with no site / area / unit groups
  it('lists the loops flat, by tag, without the plant groups', () => {
    const { container } = band('/cpm/loop');
    fireEvent.click(control());
    expect(container.ownerDocument.querySelector('.cpm-tree__group-head')).toBeNull();
    expect([...container.ownerDocument.querySelectorAll('.cpm-tree-item strong')].map(s => s.textContent)).toEqual(['FIC00701', 'OLD00001', 'TIC10101']);
  });

  it('draws the band as a card when the page asks for it', () => {
    const { container } = band('/cpm/loop', { card: true });
    expect(container.querySelector('.cpm-band--card')).toBeTruthy();
    cleanup();
    expect(band('/cpm/loop').container.querySelector('.cpm-band--card')).toBeNull();
  });

  it('marks nothing on a loop that runs', () => {
    band('/cpm/loop');
    fireEvent.click(control());
    expect(screen.queryAllByText('Retired')).toHaveLength(1);   // only the retired loop in the tree
  });
});
