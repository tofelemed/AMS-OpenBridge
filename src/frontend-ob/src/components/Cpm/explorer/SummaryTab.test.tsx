// @vitest-environment jsdom
// CHG-158 (owner review): the gate key is a button in the Gate results head; Loop model & setup → moved to the tab row.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../access', () => ({ usePipelineAccess: () => false, pipelineStep: () => [] }));
vi.mock('../../../hooks/useCpm', () => ({
  useLatestGates: () => ({ data: { gates: [{ key: 'G0', status: 'PASS' }], observabilityFlags: [] }, isLoading: false, isError: false }),
}));
vi.mock('./summary/OperatingState', () => ({ default: () => null }));
vi.mock('./summary/LoopKpiCards', () => ({ LoopKpiCards: () => null }));
vi.mock('./summary/SummaryGateStrip', () => ({ default: () => <div data-testid="strip" /> }));

import SummaryTab from './SummaryTab';

afterEach(cleanup);
const LOOP = { loopId: 'FIC10401', tags: {}, links: [] } as unknown as CpmLoop;

describe('SummaryTab', () => {
  it('offers the gate key as a button in the Gate results head', () => {
    render(<MemoryRouter><SummaryTab loop={LOOP} windowKind="12h" onTab={() => {}} /></MemoryRouter>);
    const section = screen.getByRole('region', { name: 'Gate results' });
    expect(within(section.querySelector('.cpm-panel-head') as HTMLElement).getByRole('button', { name: 'Gate key' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Loop model & setup →' })).toBeNull();
  });
});
