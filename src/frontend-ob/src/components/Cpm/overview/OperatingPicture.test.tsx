// @vitest-environment jsdom
// CHG-155 (owner review of Overview): the count of monitored loops is a small note with no ?, the cards carry no change since
// 24 h ago, and the loop state breakdown bar is gone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useFleetKpis } from '../kpi/useFleetKpis';
import { OperatingPicture } from './OperatingPicture';

vi.mock('../kpi/useFleetKpis', () => ({ useFleetKpis: vi.fn() }));

const figure = (key: string, label: string, count: number) =>
  ({ key, label, count, denominator: 241, denominatorLabel: 'monitored loops', rule: 'Rule' });
const kpis = {
  monitored: 241, computedAt: '2026-11-08T06:00:00Z',
  kpis: [figure('stale', 'Stale', 165), figure('never-evaluated', 'Never evaluated', 76)],
  previous: { asOf: '', monitored: 241, kpis: [{ key: 'stale', count: 4, denominator: 241 }] },
  segments: [{ key: 'bar-stale', label: 'Stale', count: 165, denominator: 241, denominatorLabel: 'monitored loops', rule: 'r' }],
  states: { assessed: 0, notAssessable: 0, stale: 165, neverEvaluated: 76 },
  notAssessableByReason: [],
  assessed: { acceptable: 0, noFaultLimited: 0, finding: 0, symptomOnly: 0, unrecognised: 0 },
};

beforeEach(() => { vi.mocked(useFleetKpis).mockReturnValue({ data: kpis, isError: false } as never); });
afterEach(cleanup);

const show = () => render(<MemoryRouter><OperatingPicture /></MemoryRouter>);

describe('OperatingPicture', () => {
  it('names the monitored count as a small note, with no ?', () => {
    const { container } = show();
    const note = container.querySelector('.cpm-op__count');
    expect(note?.textContent).toBe('241 loops monitored');
    expect(note?.tagName).not.toMatch(/^H\d$/);
    expect(screen.queryByRole('button', { name: 'Last updated' })).toBeNull();
  });

  it('shows no change since 24 h ago on any card', () => {
    const { container } = show();
    expect(container.textContent).not.toMatch(/\bpp\b/);
    expect(container.querySelector('.cpm-kpicard__delta')).toBeNull();
  });

  it('has no loop state breakdown', () => {
    const { container } = show();
    expect(screen.queryByText('Loop state breakdown')).toBeNull();
    expect(container.querySelector('.cpm-state')).toBeNull();
  });

  it('keeps every card as a link to its drill-down', () => {
    show();
    expect(screen.getAllByRole('link').map(l => new URLSearchParams(l.getAttribute('href')!.split('?')[1]).get('review')))
      .toEqual(['stale', 'never-evaluated']);
  });

  // CHG-177 (owner review, Overview v2): the note and the cards sit on the page grid, with no card around them.
  it('has no card around the note and the cards', () => {
    const { container } = show();
    expect(container.querySelector('.cpm-surface')).toBeNull();
    const cards = container.querySelector('[role="list"][aria-label="Loop KPIs"]')!;
    expect(cards.className).toContain('cpm-ov-cards');
    expect(container.querySelector('.cpm-op__count')!.nextElementSibling).toBe(cards);
  });
});
