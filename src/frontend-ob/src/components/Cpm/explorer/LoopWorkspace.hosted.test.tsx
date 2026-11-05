// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmLoop } from '../../../api/cpmApi';
import { LoopWorkspace } from './LoopWorkspace';
import { loopTabOf } from './loopTabOf';

vi.mock('../../../hooks/useCpm', () => ({
  useLatestGates: () => ({ data: undefined, isError: false }),
  useCpmReadiness: () => ({ data: undefined }),
  useCpmEvents: () => ({ data: { events: [] } }),
}));
vi.mock('../health/useInstrumentHealth', () => ({ useInstrumentHealth: () => ({ data: undefined }) }));
vi.mock('./SummaryTab', () => ({ default: () => <p>summary body</p> }));
vi.mock('./SignalsTab', () => ({ default: () => <p>signals body</p> }));
vi.mock('./RelationshipsTab', () => ({ default: () => <p>relationships body</p> }));
vi.mock('./CalculationsTab', () => ({ default: () => <p>calculations body</p> }));
vi.mock('./HistoryTab', () => ({ default: () => <p>history body</p> }));

afterEach(cleanup);

const LOOP = { loopId: 'L1', displayName: 'Loop one', tags: { PV: 'a', SP: 'b' }, links: [] } as unknown as CpmLoop;

describe('LoopWorkspace inside the Loop page', () => {
  it('draws no tab row of its own, and leaves the panel to the page', () => {
    render(<LoopWorkspace loop={LOOP} tab="Summary" windowKind="12h" hosted onTab={() => {}} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByText('summary body')).toBeTruthy();
  });

  it('shows Relationships under Signals, so neither is lost', () => {
    render(<LoopWorkspace loop={LOOP} tab="Signals" windowKind="12h" hosted onTab={() => {}} />);
    expect(screen.getByText('signals body')).toBeTruthy();
    expect(screen.getByText('relationships body')).toBeTruthy();
  });

  it('opens History and Calculations on their own', () => {
    render(<LoopWorkspace loop={LOOP} tab="History" windowKind="12h" hosted onTab={() => {}} />);
    expect(screen.getByText('history body')).toBeTruthy();
    expect(screen.queryByText('calculations body')).toBeNull();
  });
});

describe('LoopWorkspace on its old page', () => {
  it('keeps its five tabs with their counts, and Signals alone', () => {
    render(<LoopWorkspace loop={LOOP} tab="Signals" windowKind="12h" onTab={() => {}} />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Summary', 'Signals2', 'Calculations0', 'Relationships0', 'History0']);
    expect(screen.queryByText('relationships body')).toBeNull();
  });
});

describe('a readiness link on the Loop page', () => {
  it('opens the tab that holds the cause', () => {
    expect(loopTabOf('Signals')).toBe('signals');
    expect(loopTabOf('Relationships')).toBe('signals');
    expect(loopTabOf('Calculations')).toBe('calculations');
    expect(loopTabOf('History')).toBe('history');
  });
});
