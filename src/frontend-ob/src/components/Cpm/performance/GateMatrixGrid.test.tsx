// @vitest-environment jsdom
// The matrix is one ARIA grid with one tab stop: the result link belongs to the row's arrow-key model, not to Tab.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import GateMatrixGrid from './GateMatrixGrid';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, title }: { children?: React.ReactNode; onClick?: () => void; title?: string }) =>
    <button type="button" title={title} onClick={() => onClick?.()}>{children}</button>,
}));

const row = (id: string): CpmHeatmapLoop => ({
  loopId: id, displayName: id, loopType: 'FIC', windowEnd: null, diagnosis: 'NORMAL', confidence: null, gates: { G1: 'PASS', G2: 'PASS' },
} as CpmHeatmapLoop);

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const mount = () => render(
  <MemoryRouter>
    <GateMatrixGrid rows={[row('FIC1'), row('FIC2'), row('FIC3')]} start={0} total={3} orderedGateKeys={['G1', 'G2']}
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
