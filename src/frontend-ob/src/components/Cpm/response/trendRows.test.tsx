// CHG-195 (owner rule 15 Nov 2026): one trend per row on every System Response tab, never two charts side by side. Fit quality:
// Residuals, then Residual autocorrelation, then the delay curve, each full width; the candidate models table after them.
// Frequency: magnitude, then phase, each full width, then the margins. Each chart keeps its title and zoom buttons.
import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { decoded } from '../evidence/views/fixtures';
import { ResidualPanel } from './ResidualPanel';
import { CandidateModelsTable } from './CandidateModelsTable';
import { BodePanel } from './BodePanel';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

/** The chart titles of every chart that is a direct child of a one-column trend list, in page order. */
const rowCharts = (root: HTMLElement) => [...root.querySelectorAll('.cpm-response-trend-rows > .cpm-chart')].map(c => c.querySelector('.cpm-chart__title')?.textContent);

describe('One trend per row', () => {
  it('draws Residuals, then Residual autocorrelation, each in its own row with its zoom tools', () => {
    const residuals = decoded({ gate: 'G12', kind: 'residuals', x: [1, 2, 3], y: [0.1, -0.1, 0] });
    const acf = decoded({ gate: 'G12', kind: 'residual_acf', x: [0, 1, 2], y: [1, 0.4, 0.1] });
    const { container } = render(<ResidualPanel residuals={residuals} acf={acf} timeZone="UTC" validation={undefined} />);
    expect(rowCharts(container)).toEqual(['Residuals', 'Residual autocorrelation']);
    for (const c of container.querySelectorAll('.cpm-chart')) expect(c.querySelector('[aria-label="Chart zoom"]')).toBeTruthy();
  });

  it('draws the delay curve full width before the candidate models table, which takes the full width after it', () => {
    const table = decoded({ gate: 'G12', kind: 'candidate_models', x: [0], y: [0.4], provenance: { state: 'ESTIMATED', rows: 'FOPDT(OP: process_gain=1.2,dead_time=30) bounds_hit=false flat_delay=false sign_uncertain=false cond=12.5' } });
    const curve = decoded({ gate: 'G12', kind: 'delay_objective_curve', x: [0, 10, 20], y: [3, 2, 1] });
    const { container } = render(<CandidateModelsTable table={table} delayCurve={curve} intervals={undefined} rejections={undefined} />);
    const rows = container.querySelector('.cpm-response-trend-rows') as HTMLElement;
    expect(rowCharts(container)).toEqual(['Delay search (best candidate)']);
    const order = [...rows.children].map(c => (c.classList.contains('cpm-chart') ? 'curve' : c.querySelector('table') ? 'table' : 'other'));
    expect(order).toEqual(['curve', 'table']);
  });

  it('draws the magnitude, then the phase, each in its own row, then the margins', () => {
    const bode = decoded({ gate: 'G12', kind: 'bode', x: [0.1, 1, 10], y: [10, 1, 0.1], columns: { phase_deg: [-10, -90, -170] }, provenance: { gain_crossings: '1', phase_crossings: '' } });
    const { container } = render(<BodePanel bode={bode} metrics={[]} controller={undefined} />);
    expect(rowCharts(container)).toEqual(['Loop gain', 'Loop phase']);
    const sections = [...container.querySelectorAll('section')].map(s => s.getAttribute('aria-label') ?? s.querySelector('.cpm-panel-title')?.textContent);
    expect(sections[sections.length - 1]).toBe('Margins');
  });

  it('puts no two charts side by side anywhere on the System Response tabs', () => {
    const sources = readdirSync(__dirname).filter(f => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f)).map(f => readFileSync(join(__dirname, f), 'utf8'));
    expect(sources.filter(s => s.includes('cpm-response-pair'))).toEqual([]);
  });

  // at 390 px the events table's width pushed the tab's grid column past the panel: a tab part may shrink, its table scrolls
  it('lets every part of a tab shrink to the panel, so a wide table scrolls inside it', () => {
    const css = readFileSync(join(__dirname, '../../../styles/cpm-response.css'), 'utf8');
    expect(css).toMatch(/\.cpm-response-tabs \.cpm-tabpanel > \* \{ min-width: 0; \}/);
  });
});
