// @vitest-environment jsdom
/**
 * CHG-128: one loop control on every loop page. It follows the header scope, and a loop outside the scope stays selected
 * and says so. CHG-160 (owner review): the control is a search field. Typing lists the loops that match, the arrow lists
 * every loop, and there is one list: no Find loop box in a popover, no Loop Registry link, no Clear loop.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const field = () => screen.getByRole('combobox');
const showAll = () => fireEvent.click(screen.getByRole('button', { name: 'Show all loops' }));
const options = () => within(screen.getByRole('listbox')).queryAllByRole('option');
const tags = () => options().map(o => o.querySelector('strong')?.textContent);

describe('LoopBand', () => {
  it('names the loop once, without repeating its tag', () => {
    const { container } = band('/cpm/loop');
    expect(container.querySelector('.cpm-loop-combo__value')?.textContent).toBe('FIC00701 Flow controller (FCS0102)');
    expect(field().getAttribute('aria-label')).toBe('Loop FIC00701 Flow controller (FCS0102)');
  });

  it('is a search field: typing lists the loops that match, and choosing one reports it', () => {
    const onLoop = vi.fn();
    band('/cpm/loop', { onLoop });
    fireEvent.change(field(), { target: { value: 'reactor' } });
    expect(tags()).toEqual(['TIC10101']);
    fireEvent.mouseDown(options()[0]);
    expect(onLoop).toHaveBeenCalledWith('TIC10101');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('lists every loop from the arrow, even after a search', () => {
    band('/cpm/loop');
    fireEvent.change(field(), { target: { value: 'reactor' } });
    showAll();
    expect(tags()).toEqual(['FIC00701', 'OLD00001', 'TIC10101']);
    expect((field() as HTMLInputElement).value).toBe('');
  });

  it('opens the list when the field is clicked, and closes it from the arrow', () => {
    band('/cpm/loop');
    fireEvent.click(field());
    expect(field().getAttribute('aria-expanded')).toBe('true');
    showAll();
    expect(field().getAttribute('aria-expanded')).toBe('false');
  });

  it('has one list and nothing else in it: no Find loop box, no Loop Registry, no Clear loop', () => {
    band('/cpm/loop');
    showAll();
    expect(screen.queryByLabelText('Find loop')).toBeNull();
    expect(screen.queryByRole('button', { name: /Loop Registry|Clear loop/ })).toBeNull();
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
  });

  it('works from the keyboard: arrows move, Enter chooses, Escape closes', () => {
    const onLoop = vi.fn();
    band('/cpm/loop', { onLoop });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(field().getAttribute('aria-expanded')).toBe('true');
    // it opens on the chosen loop, so one step down is the next tag
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onLoop).toHaveBeenCalledWith('OLD00001');
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says when nothing matches', () => {
    band('/cpm/loop');
    fireEvent.change(field(), { target: { value: 'zzz' } });
    expect(options()).toHaveLength(0);
    expect(screen.getByText('No loop matches the search.')).toBeTruthy();
  });

  it('lists only the loops in the header scope', () => {
    band('/cpm/loop?site=hdpe&area=section_100', { loopId: 'TIC10101' });
    showAll();
    expect(tags()).toEqual(['TIC10101']);
  });

  it('says so, readably, when the loop is outside the scope', () => {
    band('/cpm/loop?site=hdpe&area=section_100');
    expect(screen.getByRole('status').textContent).toMatch(/FIC00701 is outside the plant scope/);
  });

  it('says so when the loop is not in the registry', () => {
    band('/cpm/loop', { loopId: 'NOPE' });
    expect(screen.getByRole('status').textContent).toMatch(/NOPE is not in the loop registry/);
  });

  it('asks for a loop when none is chosen', () => {
    band('/cpm/loop', { loopId: null });
    expect(field().getAttribute('aria-label')).toBe('Loop');
    expect(field().getAttribute('placeholder')).toBe('Search loops');
  });

  it('holds what the tab needs, and pushes the end to the far side', () => {
    const { container } = band('/cpm/loop', { children: <span>tab control</span>, end: <span>end control</span> });
    expect(screen.getByText('tab control')).toBeTruthy();
    expect(container.querySelector('.cpm-band__end')?.textContent).toBe('end control');
  });

  // CHG-153: a bookmark to a retired loop must not read as a running one
  it('marks a retired loop Retired beside the control, and in the list', () => {
    band('/cpm/loop', { loopId: 'OLD00001' });
    expect(screen.getAllByText('Retired')).toHaveLength(1);
    showAll();
    expect(screen.getAllByText('Retired')).toHaveLength(2);
  });

  it('marks nothing on a loop that runs', () => {
    band('/cpm/loop');
    showAll();
    expect(screen.queryAllByText('Retired')).toHaveLength(1);   // only the retired loop in the list
  });

  it('draws the band as a card when the page asks for it', () => {
    const { container } = band('/cpm/loop', { card: true });
    expect(container.querySelector('.cpm-band--card')).toBeTruthy();
    cleanup();
    expect(band('/cpm/loop').container.querySelector('.cpm-band--card')).toBeNull();
  });
});
