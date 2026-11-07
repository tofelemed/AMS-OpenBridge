// CHG-100: the whole priority-queue row previews its loop; the loop tag opens Investigation only (it does not also
// preview), and the selected row carries the selected class.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmRankedLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, title, ...rest }: { children?: React.ReactNode; onClick?: () => void; title?: string; 'aria-label'?: string }) =>
    <button type="button" title={title} aria-label={rest['aria-label']} onClick={() => onClick?.()}>{children}</button>,
}));

import { PriorityQueue } from './PriorityQueue';

const loop = (id: string): CpmRankedLoop => ({
  rank: 1, loopId: id, displayName: `Loop ${id}`, site: 'hdpe', area: 'section_400', unit: null, loopType: 'FIC', criticality: 'medium',
  windowEnd: '2026-10-16T07:00:00Z', diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.2, mae: 1 },
  observabilityFlags: [], leadingHypothesis: null,
} as unknown as CpmRankedLoop);

afterEach(cleanup);

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const render = (ui: React.ReactElement) => rtlRender(
  <MemoryRouter><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>);

describe('priority queue rows (CHG-100)', () => {
  it('names the preview button with the words on it, so voice control can find it', () => {
    const { container } = render(<PriorityQueue loops={[loop('FIC1')]} loading={false} error={null} retry={() => {}}
      shelvedCount={0} selectedId={null} onPreview={() => {}} onViewAll={() => {}} onShelved={() => {}} />);
    const button = container.querySelector('.cpm-queue-row__preview') as HTMLButtonElement;
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.textContent).toContain('Preview FIC1');
  });

  it('a click anywhere on the row previews the loop; the loop tag only opens Investigation', () => {
    const onPreview = vi.fn();
    const { container } = render(<PriorityQueue loops={[loop('FIC1'), loop('FIC2')]} loading={false} error={null} retry={() => {}}
      shelvedCount={0} selectedId="FIC2" windowKind="12h" onPreview={onPreview} onViewAll={() => {}} onShelved={() => {}} />);
    const rows = container.querySelectorAll('.cpm-queue-row');
    expect(rows[1].className).toMatch(/cpm-event-row--selected/);
    expect(rows[0].className).toMatch(/cpm-row-click/);
    fireEvent.click(rows[0].querySelector('.cpm-queue-row__head')!);   // not a button
    expect(onPreview).toHaveBeenCalledWith('FIC1');
    onPreview.mockClear();
    fireEvent.click(screen.getByTitle('Review FIC1 in Investigation'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation?loop=FIC1&profile=12h');
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('the loop tag reads "FIC1 →" and is named "Review FIC1" for assistive technology', () => {
    render(<PriorityQueue loops={[loop('FIC1')]} loading={false} error={null} retry={() => {}}
      shelvedCount={0} selectedId={null} windowKind="12h" onPreview={() => {}} onViewAll={() => {}} onShelved={() => {}} />);
    const tag = screen.getByTitle('Review FIC1 in Investigation');
    expect(tag.textContent).toBe('FIC1 →');
    expect(tag.getAttribute('aria-label')).toBe('Review FIC1');
  });
});
