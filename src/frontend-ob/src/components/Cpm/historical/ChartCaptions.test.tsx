// @vitest-environment jsdom
// CHG-159 (owner review, 10 Nov): the empty-signal line names the loop, not the historian path (root.site1.cpm.…).
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ChartCaptions from './ChartCaptions';

afterEach(cleanup);
const quiet = {
  overlay: { label: 'IAE', resolution: '15m' },
  kpi: { isError: false, isLoading: false, error: null, refetch: () => {}, empty: false, truncatedFrom: null, cap: 500 },
  mode: { isError: false, empty: false },
  history: { isError: false, error: null, refetch: () => {} },
};

describe('ChartCaptions', () => {
  it('names the loop, not its historian path, when no signal values are stored', () => {
    const { container } = render(<ChartCaptions loopId="FIC10401" signals={['pv', 'sp', 'op']} hasAnyLane hasPlottableSignal={false} {...quiet} />);
    expect(screen.getByText(/No PV, SP, OP values stored for FIC10401 in this range/)).toBeTruthy();
    expect(container.textContent).not.toContain('root.');
  });
});
