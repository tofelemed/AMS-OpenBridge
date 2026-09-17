// 2026-09-17 audit F19/F20: compact event rows (time · type · path · one state · one-line finding) and
// the censored candidates left out until asked for - on the lab they are 321 of 328 events.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventList } from './EventList';
import type { ResponseEventSummary } from '../../../api/cpm/response';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);
const ev = (over: Partial<ResponseEventSummary>): ResponseEventSummary => ({
  eventId: 'e1', methodRunId: 'r1', eventType: 'INPUT_TEST', pathId: 'OP_TO_PV', t0Ms: Date.UTC(2026, 8, 17, 3, 25, 31), tEndMs: null, captureState: 'COMPLETE', censorReason: '',
  evaluationState: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', modelState: 'CANDIDATE', purpose: 'LIVE', bundleHash: 'b', resultRevision: 1, emittedAtMs: null, ...over,
});
const base = { timeZone: 'UTC', loading: false, hasMore: false, onMore: () => {}, onSelect: () => {}, onToggleCensored: () => {} };

describe('EventList', () => {
  it('renders one state and a one-line finding per row and marks the selection', () => {
    render(<EventList events={[ev({}), ev({ eventId: 'e2', modelState: 'VALIDATED' })]} selectedId="e2" censoredCount={0} showCensored={false} {...base} />);
    const rows = screen.getAllByRole('button', { name: /INPUT_TEST/ });
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/CANDIDATE/);
    expect(rows[0].textContent).toMatch(/Response characterised · model candidate/);
    expect(rows[0].textContent).not.toMatch(/EVALUATED|COMPLETE/);                              // one state, not two look-alike pills
    expect(rows[1].getAttribute('aria-current')).toBe('true');
  });

  it('says how many censored candidates are left out and offers to show them', () => {
    const onToggleCensored = vi.fn();
    render(<EventList events={[ev({})]} selectedId={undefined} censoredCount={321} showCensored={false} {...base} onToggleCensored={onToggleCensored} />);
    const toggle = screen.getByRole('button', { name: /Show 321 censored candidates/ });
    fireEvent.click(toggle);
    expect(onToggleCensored).toHaveBeenCalledWith(true);
  });

  it('with censored shown, a censored row reads its reason and the toggle hides them again', () => {
    render(<EventList events={[ev({}), ev({ eventId: 'e3', captureState: 'CENSORED', evaluationState: 'CENSORED', censorReason: 'SOURCE_GAP', modelState: 'NONE', finding: 'SOURCE_GAP' })]}
      selectedId={undefined} censoredCount={1} showCensored={true} {...base} />);
    expect(screen.getByText(/Candidate censored · source gap/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hide 1 censored candidate\b/ })).toBeTruthy();
  });

  it('states loading and emptiness', () => {
    const { rerender } = render(<EventList events={[]} selectedId={undefined} censoredCount={0} showCensored={false} {...base} loading={true} />);
    expect(screen.getByText(/Loading events/)).toBeTruthy();
    rerender(<EventList events={[]} selectedId={undefined} censoredCount={4} showCensored={false} {...base} />);
    expect(screen.getByText(/No complete response event/)).toBeTruthy();
  });
});
