// CHG-165: the Events tab: the three counts once, then the loop's events as a table (time, type, path, state, finding, model);
// censored rows on request; choosing an event hands it to the page.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { EventsTab } from './EventsTab';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);
const ev = (over: Partial<ResponseEventSummary>): ResponseEventSummary => ({
  eventId: 'e1', methodRunId: 'r1', eventType: 'INPUT_TEST', pathId: 'OP_TO_PV', t0Ms: Date.UTC(2026, 9, 7, 5, 43, 24), tEndMs: null, captureState: 'COMPLETE', censorReason: '',
  evaluationState: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', modelState: 'CANDIDATE', purpose: 'LIVE', bundleHash: 'b', resultRevision: 1, emittedAtMs: null, ...over,
});
const model = { modelId: 'm1', loopId: 'FIC1', pathId: 'OP_TO_PV', family: 'FOPDT', estimator: '', uncertaintyMethod: '', trainingSupport: null, validationSupport: null,
  parameters: { process_gain: { value: 0.21, unit: '', uncertainty: null, method: '', reason: null } }, modelState: 'CANDIDATE', approvedDomain: null, controllerSnapshotId: null,
  contextRevision: 1, createdFromEvent: 'e1', methodRunId: 'r1', bundleHash: 'b', revision: 1, reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: '2026-10-07T09:51:31Z', supersededBy: null } as SystemModel;
const base = { timeZone: 'UTC', loading: false, hasMore: false, models: [model], modelsStatus: 'ready' as const, censoredCount: 0, showCensored: false,
  onToggleCensored: () => {}, onMore: () => {}, onSelect: () => {}, onModels: () => {} };

describe('EventsTab', () => {
  it('lists each event once: time, type and path in words, one state, the finding, the model it produced', () => {
    const onSelect = vi.fn();
    render(<EventsTab {...base} events={[ev({}), ev({ eventId: 'e2', modelState: 'NONE', finding: 'NO_RESPONSE' })]} selectedId="e1" onSelect={onSelect} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Input test')).toBeTruthy();
    expect(within(rows[0]).getByText('OP → PV')).toBeTruthy();
    expect(within(rows[0]).getByText('Candidate')).toBeTruthy();
    expect(within(rows[0]).getByText('Response characterised')).toBeTruthy();
    expect(within(rows[0]).getByText('FOPDT · K 0.21')).toBeTruthy();
    expect(within(rows[1]).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(rows[0]).getByRole('button').getAttribute('aria-current')).toBe('true');
    fireEvent.click(within(rows[1]).getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e2' }));
  });

  it('keeps censored rows out until asked, with their count in the choice', () => {
    const toggle = vi.fn();
    render(<EventsTab {...base} events={[ev({})]} selectedId={undefined} censoredCount={3} onToggleCensored={toggle} />);
    const pick = screen.getByRole('combobox', { name: 'Censored events' }) as HTMLSelectElement;
    expect(pick.value).toBe('hide');
    expect(screen.getByRole('option', { name: 'Hide censored (3)' })).toBeTruthy();
    fireEvent.change(pick, { target: { value: 'show' } });
    expect(toggle).toHaveBeenCalledWith(true);
  });

  it('reads a censored row by its reason', () => {
    render(<EventsTab {...base} events={[ev({ captureState: 'CENSORED', censorReason: 'SOURCE_GAP', modelState: 'NONE' })]} selectedId={undefined} censoredCount={1} showCensored />);
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('Censored')).toBeTruthy();
    expect(within(row).getByText('Source gap')).toBeTruthy();
  });

  it('loads older events on request and opens the models from the model tile', () => {
    const onMore = vi.fn(); const onModels = vi.fn();
    render(<EventsTab {...base} events={[ev({})]} selectedId={undefined} hasMore onMore={onMore} onModels={onModels} />);
    fireEvent.click(screen.getByText('Older events'));
    expect(onMore).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /System model/ }));
    expect(onModels).toHaveBeenCalled();
  });
});
