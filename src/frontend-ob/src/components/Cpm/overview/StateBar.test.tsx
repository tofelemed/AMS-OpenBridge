// @vitest-environment jsdom
/** CHG-127: the bar draws what the server counted, each state links to its own list, and colour is never alone. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FleetKpis } from '../../../api/cpm/fleetKpis';
import { StateBar } from './StateBar';

afterEach(cleanup);

const figure = (key: string, label: string, count: number) => ({ key, label, count, denominator: 241, denominatorLabel: 'monitored loops', rule: 'r' });
const k = (over: Partial<FleetKpis>): FleetKpis => ({
  monitored: 241, states: { assessed: 0, notAssessable: 0, stale: 165, neverEvaluated: 76 },
  assessed: { acceptable: 0, noFaultLimited: 0, finding: 0, symptomOnly: 0, unrecognised: 0 }, ...over,
} as FleetKpis);
const bar = (data: FleetKpis) => render(<MemoryRouter><StateBar k={data} scope={{ site: 'hdpe', windowKind: '12h' }} /></MemoryRouter>);

describe('StateBar', () => {
  it('draws the server\'s states, in its order, leaving out the empty ones', () => {
    const { container } = bar(k({ segments: [figure('bar-acceptable', 'Performing', 96), figure('bar-manual', 'Manual', 0), figure('bar-stale', 'Stale', 145)] as FleetKpis['segments'] }));
    expect(container.querySelectorAll('.cpm-state__seg')).toHaveLength(2);
    expect([...container.querySelectorAll('.cpm-state__legend li')].map(l => l.textContent)).toEqual(['Performing 96 (39.8 %)', 'Stale 145 (60.2 %)']);
  });

  it('sizes each segment by its count', () => {
    const { container } = bar(k({ segments: [figure('bar-stale', 'Stale', 165), figure('bar-never-evaluated', 'Never evaluated', 76)] as FleetKpis['segments'] }));
    expect([...container.querySelectorAll<HTMLElement>('.cpm-state__seg')].map(s => s.style.flexGrow)).toEqual(['165', '76']);
  });

  it('opens each state\'s own list, keeping the scope and window', () => {
    bar(k({ segments: [figure('bar-stale', 'Stale', 165)] as FleetKpis['segments'] }));
    const href = screen.getByRole('link', { name: /Stale/ }).getAttribute('href') ?? '';
    expect(href).toContain('review=bar-stale');
    expect(href).toContain('site=hdpe');
    expect(href).toContain('window=12h');
  });

  it('shows the real states an older cplm-api can answer', () => {
    const { container } = bar(k({}));
    expect([...container.querySelectorAll('.cpm-state__legend li')].map(l => l.textContent)).toEqual(['Stale 165 (68.5 %)', 'Never evaluated 76 (31.5 %)']);
  });

  it('keeps the pointer shortcut out of the tab order, because the legend has the same links', () => {
    const { container } = bar(k({ segments: [figure('bar-stale', 'Stale', 165)] as FleetKpis['segments'] }));
    expect(container.querySelector('.cpm-state__bar')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.cpm-state__seg')?.getAttribute('tabindex')).toBe('-1');
  });
});
