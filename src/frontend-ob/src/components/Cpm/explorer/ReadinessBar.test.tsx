// @vitest-environment jsdom
// CHG-158 (owner review): "Not producing verdicts" opens closed; its head carries the counts, each cause its kind, and a link to fix it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReadinessBar } from './ReadinessBar';
import type { ReadinessSummary } from './readinessCauses';

vi.mock('../access', () => ({ usePipelineAccess: () => true }));
afterEach(cleanup);

const SUMMARY = {
  headline: 'Not producing verdicts', blocking: 1, notes: [],
  causes: [
    { id: 'flink_jobs', label: 'CPLM Flink jobs running', message: 'One or more CPLM jobs are not running.', kind: 'blocking', target: { kind: 'route', href: '/cpm/pipeline', label: 'Pipeline Health' } },
    { id: 'tag_vp', label: 'Signal VP', message: 'Map its tag.', kind: 'configuration', target: { kind: 'tab', tab: 'Signals', label: 'Signals' } },
  ],
} as unknown as ReadinessSummary;

const bar = (onTab = vi.fn()) => render(<MemoryRouter><ReadinessBar summary={SUMMARY} onTab={onTab} /></MemoryRouter>);

describe('ReadinessBar', () => {
  it('opens closed, with the headline and the counts in its head', () => {
    bar();
    const head = screen.getByRole('button', { name: /Not producing verdicts/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect([...head.querySelectorAll('.cpm-causes__count')].map(c => c.textContent)).toEqual(['1 blocking', '2 to fix']);
    expect(screen.queryByText('CPLM Flink jobs running')).toBeNull();
  });

  it('lists each cause under its kind with the link that fixes it once opened', () => {
    const onTab = vi.fn();
    const { container } = bar(onTab);
    fireEvent.click(screen.getByRole('button', { name: /Not producing verdicts/ }));
    expect([...container.querySelectorAll('.cpm-causes__kind')].map(k => k.textContent)).toEqual(['Blocking', 'Configuration']);
    fireEvent.click(screen.getByRole('button', { name: 'Signals →' }));
    expect(onTab).toHaveBeenCalledWith('Signals');
  });
});
