// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmLoop } from '../../../api/cpmApi';
import { LoopWorkspace } from './LoopWorkspace';

vi.mock('../../../hooks/useCpm', () => ({
  useLatestGates: () => ({ data: undefined, isError: false }),
  useCpmEvents: () => ({ data: { events: [] } }),
}));
vi.mock('./SummaryTab', () => ({ default: () => <p>summary body</p> }));
vi.mock('./SignalsTab', () => ({ default: () => <p>signals body</p> }));
vi.mock('./RelationshipsTab', () => ({ default: () => <p>relationships body</p> }));
vi.mock('./CalculationsTab', () => ({ default: () => <p>calculations body</p> }));
vi.mock('./HistoryTab', () => ({ default: () => <p>history body</p> }));
vi.mock('./LoopModelCard', () => ({ LoopModelLink: () => <button type="button">Loop model & setup →</button> }));

afterEach(cleanup);

const LOOP = { loopId: 'L1', displayName: 'Loop one', tags: { PV: 'a', SP: 'b' }, links: [] } as unknown as CpmLoop;

describe('LoopWorkspace', () => {
  it('keeps its five tabs with their counts', () => {
    render(<LoopWorkspace loop={LOOP} tab="Signals" windowKind="12h" onTab={() => {}} />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Summary', 'Signals2', 'Calculations0', 'Relationships0', 'History0']);
  });

  it('shows Relationships on its own tab, not under Signals', () => {
    render(<LoopWorkspace loop={LOOP} tab="Signals" windowKind="12h" onTab={() => {}} />);
    expect(screen.getByText('signals body')).toBeTruthy();
    expect(screen.queryByText('relationships body')).toBeNull();
  });

  it('does not bring back the summary card, which lives in the band on Summary', () => {
    render(<LoopWorkspace loop={LOOP} tab="Summary" windowKind="12h" onTab={() => {}} />);
    expect(screen.getByText('summary body')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'L1' })).toBeNull();
  });

  it('opens History on its own', () => {
    render(<LoopWorkspace loop={LOOP} tab="History" windowKind="12h" onTab={() => {}} />);
    expect(screen.getByText('history body')).toBeTruthy();
    expect(screen.queryByText('calculations body')).toBeNull();
  });

  // CHG-158 (owner review): Loop model & setup → sits at the end of the tab row on Summary, not on a row of its own
  it('puts Loop model & setup → at the end of the tab row on Summary only', () => {
    const { container } = render(<LoopWorkspace loop={LOOP} tab="Summary" windowKind="12h" onTab={() => {}} />);
    expect(container.querySelector('.cpm-tabs-row__end')?.textContent).toBe('Loop model & setup →');
    cleanup();
    render(<LoopWorkspace loop={LOOP} tab="Signals" windowKind="12h" onTab={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Loop model & setup →' })).toBeNull();
  });
});
