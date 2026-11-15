// CHG-195 (owner review item 19): the tabs that read one event say plainly why a chart is missing. A censored event was cut
// short before its response finished, so it never has a fit: Fit quality says that, never "charts not kept". An event with no
// charts says so in one plain line on Response.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { ResponseEventDetail } from '../../../api/cpm/response';
import { EventPanes, type EventPanesProps } from './EventPanes';
import { selfRegulating, T0S } from './trends/trendFixtures';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const result = (over: Record<string, unknown> = {}): ResponseEventDetail['result'] => ({
  event_id: 'e1', method_run_id: 'r1', loop_id: 'FIC1', path_id: 'OP_TO_PV', evaluation_state: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED',
  model_state: 'CANDIDATE', subgates: {}, window_start_ms: 1, window_end_ms: 2, bundle_hash: 'b', purpose: 'LIVE', capture_state: 'COMPLETE', ...over,
});
const none = { methodRunId: 'r1', etag: '"none"', readiness: 'NONE', count: 0, reconstructable: true, artifacts: [] } as unknown as EvidenceManifest;
const draw = (tab: EventPanesProps['tab'], r: ResponseEventDetail['result'], manifest: EvidenceManifest = none) => render(
  <EventPanes tab={tab} timeZone="UTC" t0Ms={1}
    detail={{ data: { result: r, metrics: [] }, isError: false, isLoading: false } as unknown as EventPanesProps['detail']}
    manifest={{ data: manifest, isError: false } as unknown as EventPanesProps['manifest']}
    arts={{ byKind: {}, loading: false, errors: [], unavailable: [] }} />,
);

describe('EventPanes', () => {
  it('says on Fit quality that a censored event was cut short, so no model was fitted, and not that charts were not kept', () => {
    draw('fit', result({ capture_state: 'CENSORED', evaluation_state: 'CENSORED', model_state: 'NONE' }));
    expect(screen.getByRole('note').textContent).toBe('This event was interrupted before the response finished, so no model was fitted.');
    expect(screen.queryByText(/Charts/)).toBeNull();
  });

  // the event's result JSON carries the state as evaluation_state (no capture_state key): lab answer 2026-11-15
  it('reads a censored event from its evaluation state, as the event answer carries it', () => {
    const r = result({ evaluation_state: 'CENSORED', model_state: 'NONE', finding: 'SUPERSEDED_BY_EVENT' });
    delete (r as Record<string, unknown>).capture_state;
    draw('fit', r);
    expect(screen.getByRole('note').textContent).toBe('This event was interrupted before the response finished, so no model was fitted.');
  });

  it('says the same for a censored event whose charts are still held: it has no fit to show', () => {
    const held = { ...none, readiness: 'COMPLETE', count: 1, artifacts: [{ gate: 'G12', kind: 'accepted_samples', readiness: 'COMPLETE' }] } as unknown as EvidenceManifest;
    draw('fit', result({ capture_state: 'CENSORED', model_state: 'NONE' }), held);
    expect(screen.getByRole('note').textContent).toBe('This event was interrupted before the response finished, so no model was fitted.');
    expect(screen.queryByText('No residuals for this event')).toBeNull();
  });

  it('says in one plain line on Response that a censored event has no charts', () => {
    draw('response', result({ capture_state: 'CENSORED', model_state: 'NONE' }));
    expect(screen.getByRole('note').textContent).toBe('Charts are not available for this event.');
  });

  // CHG-197 (owner Q10): the result row, then the trends one per row, then the reported quantities
  const held = { ...none, readiness: 'COMPLETE', count: 1, artifacts: [{ gate: 'G12', kind: 'accepted_samples', readiness: 'COMPLETE' }] } as unknown as EvidenceManifest;
  const withCharts = (r: ResponseEventDetail['result']) => {
    const e = selfRegulating();
    return render(
      <EventPanes tab="response" timeZone="UTC" t0Ms={T0S * 1000} pvUnit="m3/h"
        detail={{ data: { result: r, metrics: e.metrics }, isError: false, isLoading: false } as unknown as EventPanesProps['detail']}
        manifest={{ data: held, isError: false } as unknown as EventPanesProps['manifest']}
        arts={{ byKind: e.byKind, loading: false, errors: [], unavailable: [] }} />,
    );
  };

  it('draws the Response tab as the result, the trends one per row, then the reported quantities', () => {
    const { container } = withCharts(result());
    const trends = container.querySelector('[aria-label="Response trends"]')!;
    expect([...trends.querySelectorAll('h2')].map(h => h.textContent))
      .toEqual(['Measured response', 'Input', 'Dead time and time constant', 'Rise time and settling', 'Error from the setpoint', 'Model fit']);
    const order = [...container.querySelectorAll('h2')].map(h => h.textContent);
    expect(order[order.length - 1]).toBe('Reported quantities');
    const row = container.querySelector('.cpm-response-result')!;
    expect(row.compareDocumentPosition(trends) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a censored event with its charts held: the plain note, then the measured response and the input only', () => {
    const { container } = withCharts(result({ capture_state: 'CENSORED', evaluation_state: 'CENSORED', model_state: 'NONE' }));
    expect(screen.getByRole('note').textContent).toBe('This event was interrupted before the response finished, so no model was fitted.');
    expect([...container.querySelectorAll('[aria-label="Response trends"] h2')].map(h => h.textContent)).toEqual(['Measured response', 'Input']);
  });

  it('says in one plain line on Fit quality that an accepted event has no charts', () => {
    draw('fit', result());
    expect(screen.getByRole('note').textContent).toBe('Charts are not available for this event.');
  });
});
