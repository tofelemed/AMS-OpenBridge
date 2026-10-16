// CHG-100: the whole priority-queue row previews its loop; the loop-id button opens the Explorer only (it does not also
// preview), and the selected row carries the selected class.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmRankedLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, title }: { children?: React.ReactNode; onClick?: () => void; title?: string }) =>
    <button type="button" title={title} onClick={() => onClick?.()}>{children}</button>,
}));

import { PriorityQueue } from './PriorityQueue';

const loop = (id: string): CpmRankedLoop => ({
  rank: 1, loopId: id, displayName: `Loop ${id}`, site: 'hdpe', area: 'section_400', unit: null, loopType: 'FIC', criticality: 'medium',
  windowEnd: '2026-10-16T07:00:00Z', diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.2, mae: 1 },
  observabilityFlags: [], leadingHypothesis: null,
} as unknown as CpmRankedLoop);

afterEach(cleanup);

describe('priority queue rows (CHG-100)', () => {
  it('a click anywhere on the row previews the loop; the loop button only opens it', () => {
    const onPreview = vi.fn();
    const onOpenLoop = vi.fn();
    const { container } = render(<PriorityQueue loops={[loop('FIC1'), loop('FIC2')]} loading={false} error={null} retry={() => {}}
      shelvedCount={0} selectedId="FIC2" onPreview={onPreview} onOpenLoop={onOpenLoop} onViewAll={() => {}} onShelved={() => {}} />);
    const rows = container.querySelectorAll('.cpm-queue-row');
    expect(rows[1].className).toMatch(/cpm-event-row--selected/);
    expect(rows[0].className).toMatch(/cpm-row-click/);
    fireEvent.click(rows[0].querySelector('.cpm-queue-row__head')!);   // not a button
    expect(onPreview).toHaveBeenCalledWith('FIC1');
    onPreview.mockClear();
    fireEvent.click(screen.getByTitle('Open FIC1 in the Loop Explorer'));
    expect(onOpenLoop).toHaveBeenCalledWith('FIC1');
    expect(onPreview).not.toHaveBeenCalled();
  });
});
