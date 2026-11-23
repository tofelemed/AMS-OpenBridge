// @vitest-environment jsdom
// The matrix is one ARIA grid with one tab stop: the result link belongs to the row's arrow-key model, not to Tab.
// CHG-226: a loop kept at its last stored result says so under its result link, once per row.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import GateMatrixGrid from './GateMatrixGrid';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';

vi.mock('../../../cpa/siteTime', async orig => ({ ...(await orig<typeof import('../../../cpa/siteTime')>()), siteZone: () => 'UTC' }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, title }: { children?: React.ReactNode; onClick?: () => void; title?: string }) =>
    <button type="button" title={title} onClick={() => onClick?.()}>{children}</button>,
}));

const row = (id: string): CpmHeatmapLoop => ({
  loopId: id, displayName: id, loopType: 'FIC', windowEnd: null, diagnosis: 'NORMAL', confidence: null, gates: { G1: 'PASS', G2: 'PASS' },
} as CpmHeatmapLoop);

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const mount = (rows = [row('FIC1'), row('FIC2'), row('FIC3')]) => render(
  <MemoryRouter>
    <GateMatrixGrid rows={rows} start={0} total={rows.length} orderedGateKeys={['G1', 'G2']}
      tierGroups={[{ label: 'Core', keys: ['G1', 'G2'] }]} selectedLoopId={null} windowKind="12h" resetKey="a"
      onSelectLoop={() => {}} onOpenLoop={() => {}} onOpenGate={() => {}} />
    <Where />
  </MemoryRouter>);

afterEach(cleanup);

describe('gate matrix keyboard model', () => {
  it('has one tab stop in the whole grid, result links included', () => {
    const { container } = mount();
    const stops = [...container.querySelectorAll('tbody button, tbody a')].filter(b => b.getAttribute('tabindex') !== '-1');
    expect(stops).toHaveLength(1);
  });

  it('reaches a row\'s result link with End, and opens Investigation from it', () => {
    const { container } = mount();
    const first = container.querySelector('[data-r="0"][data-c="0"]') as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: 'End' });
    const link = container.querySelector('[data-r="0"][data-c="3"]') as HTMLElement;
    expect(link).toBeTruthy();
    expect(document.activeElement).toBe(link);
    fireEvent.click(screen.getAllByTitle('Review FIC1 in Investigation')[0]);
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation');
  });
});

describe('gate matrix, a last stored result (CHG-226)', () => {
  it('says "Last stored result" with the time under the result link, once per row, outside the keyboard model', () => {
    const { container } = mount([
      { ...row('FIC1'), lastStored: true, resultAt: '2026-11-23T10:15:00Z', updatingSince: '2026-11-23T11:00:00Z' }, row('FIC2'),
    ]);
    const [first, second] = [...container.querySelectorAll('tbody tr')];
    const result = first.querySelector('.cpm-matrix__result-link')!;
    expect(result.querySelector('button')!.textContent).not.toMatch(/Last stored/);
    expect(result.querySelector('.cpm-matrix__stored')?.textContent).toBe('Last stored result · 23 Nov · 10:15');
    expect(first.textContent!.match(/Last stored result/g)).toHaveLength(1);
    expect(second.textContent).not.toMatch(/Last stored result/);
  });

  it('says nothing for a new result or when the fields are absent', () => {
    mount([{ ...row('FIC1'), lastStored: false, resultAt: '2026-11-23T10:15:00Z' }, row('FIC2')]);
    expect(screen.queryByText(/Last stored result/)).toBeNull();
  });
});
