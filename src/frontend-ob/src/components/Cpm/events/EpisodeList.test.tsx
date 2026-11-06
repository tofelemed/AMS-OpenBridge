// @vitest-environment jsdom
// Loop Events list: one fixed grid for the head and every row, and a row button whose name is its visible text.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { EpisodeList } from './EpisodeList';

afterEach(cleanup);

const frame = (id: number): CpmEventFrame => ({
  id, loop_id: 'FIC10301', window_kind: '12h', family: 'OSCILLATION',
  opened_at: '2026-09-02T07:30:00Z', closed_at: null, peak_diagnosis: 'SUSPECTED_OSCILLATION',
  peak_confidence: 1, last_diagnosis: null, last_confidence: null, severity: null, window_count: 1,
  ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED',
  condition_state: 'OPEN', result_revision: 1, qualified_support_ms: null, close_reason: null,
  shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
} as CpmEventFrame);

describe('EpisodeList', () => {
  it('uses one grid class on the head and every row, with the four columns', () => {
    const { container } = render(<EpisodeList title="Episodes" events={[frame(1), frame(2)]} selectedId={2} now={0} onSelect={() => {}} />);
    const grids = container.querySelectorAll('.cpm-events-grid');
    expect(grids).toHaveLength(3);
    const head = container.querySelector('.cpm-event-head')!;
    expect(Array.from(head.children).map(c => c.textContent)).toEqual(['Loop / peak diagnosis', 'Severity', 'Review', 'Opened']);
  });

  it('names the row button from its visible text, with no label that reorders it', () => {
    render(<EpisodeList title="Episodes" events={[frame(7)]} selectedId={undefined} now={0} onSelect={() => {}} />);
    const btn = screen.getByRole('button', { name: /FIC10301/ });
    expect(btn.getAttribute('aria-label')).toBeNull();
    expect(btn.textContent).toContain('EVT-7 · 12h');
  });
});
