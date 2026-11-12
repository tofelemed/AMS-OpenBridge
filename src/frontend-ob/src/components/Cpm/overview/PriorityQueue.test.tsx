// CHG-100: the whole priority-queue row previews its loop; the loop tag opens Investigation only (it does not also
// preview), and the selected row carries the selected class.
// CHG-177 (owner review, Overview v2): one line per row (priority, tag, state, diagnosis, in band, ?) under a heading line
// that says the column words once; no name and no section; an empty queue is one line; no shelved link (owner: "remove
// shelve link"); View all is a flat link; the order rule moved to How to read.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmRankedLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, title, variant, ...rest }: { children?: React.ReactNode; onClick?: () => void; title?: string; variant?: string; 'aria-label'?: string }) =>
    <button type="button" title={title} data-variant={variant} aria-label={rest['aria-label']} onClick={() => onClick?.()}>{children}</button>,
}));

import { PriorityQueue } from './PriorityQueue';

const loop = (id: string, over: Partial<CpmRankedLoop> = {}): CpmRankedLoop => ({
  rank: 1, loopId: id, displayName: `Loop ${id}`, site: 'hdpe', area: 'section_400', unit: null, loopType: 'FIC', criticality: 'medium',
  windowEnd: '2026-10-16T07:00:00Z', diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.2, mae: 1 },
  observabilityFlags: [], leadingHypothesis: null, priority: 'HIGH', ...over,
} as unknown as CpmRankedLoop);

afterEach(cleanup);

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const render = (ui: React.ReactElement) => rtlRender(
  <MemoryRouter><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>);
const queue = (over: Partial<React.ComponentProps<typeof PriorityQueue>> = {}) => render(
  <PriorityQueue loops={[]} loading={false} error={null} retry={() => {}} shelvedCount={0} selectedId={undefined}
    windowKind="12h" onPreview={() => {}} onViewAll={() => {}} {...over} />);

describe('priority queue rows (CHG-100)', () => {
  it('names the preview button with the words on it, so voice control can find it', () => {
    const { container } = queue({ loops: [loop('FIC1')] });
    const button = container.querySelector('.cpm-queue-row__preview') as HTMLButtonElement;
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.textContent).toContain('Preview FIC1');
  });

  it('a click anywhere on the row previews the loop; the loop tag only opens Investigation', () => {
    const onPreview = vi.fn();
    const { container } = queue({ loops: [loop('FIC1'), loop('FIC2')], selectedId: 'FIC2', onPreview });
    const rows = container.querySelectorAll('.cpm-queue-row');
    expect(rows[1].className).toMatch(/cpm-event-row--selected/);
    expect(rows[0].className).toMatch(/cpm-row-click/);
    fireEvent.click(rows[0].querySelector('.cpm-pill')!);   // not a button
    expect(onPreview).toHaveBeenCalledWith('FIC1');
    onPreview.mockClear();
    fireEvent.click(screen.getByTitle('Review FIC1 in Investigation'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation?loop=FIC1&profile=12h');
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('the loop tag reads "FIC1 →" and is named "Review FIC1" for assistive technology', () => {
    queue({ loops: [loop('FIC1')] });
    const tag = screen.getByTitle('Review FIC1 in Investigation');
    expect(tag.textContent).toBe('FIC1 →');
    expect(tag.getAttribute('aria-label')).toBe('Review FIC1');
  });
});

describe('priority queue, one line each (CHG-177)', () => {
  it('a row holds priority, tag, diagnosis, in band and its ?, without the loop name or section', () => {
    const { container } = queue({ loops: [loop('FIC1')] });
    const row = container.querySelector('.cpm-queue-row')!;
    expect(row.textContent).toContain('High');
    expect(row.textContent).toContain('FIC1 →');
    expect(row.textContent).toContain('Oscillation confirmed');
    expect(row.textContent).toContain('20%');
    expect(screen.getByRole('button', { name: 'Why FIC1 is here' })).toBeTruthy();
    expect(row.textContent).not.toContain('Loop FIC1');
    expect(row.textContent).not.toMatch(/Section/i);
  });

  it('says the column words once, in a heading line above the rows', () => {
    const { container } = queue({ loops: [loop('FIC1'), loop('FIC2')] });
    const head = container.querySelector('.cpm-event-head')!;
    expect([...head.children].map(c => c.textContent)).toEqual(['Priority', 'Loop', 'Diagnosis', 'In band', '']);
    expect(head.compareDocumentPosition(container.querySelector('.cpm-queue-row')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on a row the column words are narrow-screen words only (the heading is hidden there)', () => {
    const { container } = queue({ loops: [loop('FIC1')] });
    const row = container.querySelector('.cpm-queue-row')!;
    expect([...row.querySelectorAll('.cpm-ov-word')].map(w => w.textContent)).toEqual([' priority', ' in band']);
  });

  it('marks an acknowledged loop with the tone, glyph and word of Loop Events', () => {
    const { container } = queue({ loops: [loop('FIC1', { ackState: 'ACKNOWLEDGED' })] });
    const pill = [...container.querySelectorAll('.cpm-pill')].find(p => p.textContent?.includes('Acknowledged'))!;
    expect(pill.className).toContain('cpm-pill--good');
    expect(pill.querySelector('.cpm-pill__glyph')?.textContent).toBe('✓');
  });

  it('marks a loop whose shelf expired back in the queue, in the words of Loop Events', () => {
    const { container } = queue({ loops: [loop('FIC1', { ackState: 'SHELVED' })] });
    const pill = [...container.querySelectorAll('.cpm-pill')].find(p => p.textContent?.includes('Shelf expired'))!;
    expect(pill.textContent).toBe('!Shelf expired · unreviewed');
    expect(pill.className).toContain('cpm-pill--warn');
  });

  it('marks nothing on an unacknowledged loop', () => {
    const { container } = queue({ loops: [loop('FIC1', { ackState: 'UNACKNOWLEDGED' })] });
    expect(container.textContent).not.toMatch(/acknowledged|shelf/i);
  });
});

describe('priority queue head and empty line (CHG-177)', () => {
  it('is one line when empty: the title, No current findings and View all', () => {
    const { container } = queue();
    expect(container.querySelector('section')!.textContent).toBe('Loops requiring reviewNo current findingsView all →');
    expect(container.querySelector('.cpm-empty')).toBeNull();
  });

  it('says every current finding is shelved, without a shelved link', () => {
    const { container } = queue({ shelvedCount: 2 });
    expect(container.querySelector('section')!.textContent).toBe('Loops requiring reviewEvery current finding is shelvedView all →');
    expect(screen.queryByRole('button', { name: /shelved/i })).toBeNull();
  });

  it('has no shelved link beside View all, even with rows and shelved loops', () => {
    queue({ loops: [loop('FIC1')], shelvedCount: 2 });
    expect(screen.queryByText(/shelved/)).toBeNull();
  });

  it('says Loading… in the same line', () => {
    const { container } = queue({ loading: true });
    expect(container.querySelector('section')!.textContent).toBe('Loops requiring reviewLoading…View all →');
  });

  it('keeps a failure on screen with Retry', () => {
    const retry = vi.fn();
    queue({ error: new Error('boom'), retry });
    expect(screen.getByText('Priority queue unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });

  it('View all is a flat link, like All events', () => {
    const onViewAll = vi.fn();
    queue({ onViewAll });
    const viewAll = screen.getByRole('button', { name: 'View all →' });
    expect(viewAll.getAttribute('data-variant')).toBe('flat');
    fireEvent.click(viewAll);
    expect(onViewAll).toHaveBeenCalled();
  });

  it('has no ? on the title: the order rule is in How to read', () => {
    queue({ loops: [loop('FIC1')] });
    expect(screen.queryByRole('button', { name: 'How this is ordered' })).toBeNull();
  });
});
