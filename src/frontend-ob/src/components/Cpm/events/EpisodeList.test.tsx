// @vitest-environment jsdom
// Loop Events list: one fixed grid for the head and every row, and a row button whose name is its visible text.
// CHG-167 (owner review): no list title; "Opened · UTC" over "5 Oct 07:45"; the review pill is tone + glyph + word.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { setActiveZone } from '../../../cpa/activeZone';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { EpisodeList } from './EpisodeList';

beforeAll(() => setActiveZone('UTC'));
afterEach(cleanup);

const frame = (id: number, over: Partial<CpmEventFrame> = {}): CpmEventFrame => ({
  id, loop_id: 'FIC10301', window_kind: '12h', family: 'OSCILLATION',
  opened_at: '2026-10-05T07:45:00Z', closed_at: null, peak_diagnosis: 'SUSPECTED_OSCILLATION',
  peak_confidence: 1, last_diagnosis: null, last_confidence: null, severity: null, window_count: 1,
  ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED',
  condition_state: 'OPEN', result_revision: 1, qualified_support_ms: null, close_reason: null,
  shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null, ...over,
} as CpmEventFrame);

describe('EpisodeList', () => {
  it('uses one grid class on the head and every row, with the four columns and the zone once', () => {
    const { container } = render(<EpisodeList events={[frame(1), frame(2)]} selectedId={2} now={0} onSelect={() => {}} />);
    expect(container.querySelectorAll('.cpm-events-grid')).toHaveLength(3);
    const head = container.querySelector('.cpm-event-head')!;
    expect(Array.from(head.children).map(c => c.textContent)).toEqual(['Loop / peak diagnosis', 'Severity', 'Review', 'Opened · UTC']);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('names the row button from its visible text, with no label that reorders it', () => {
    render(<EpisodeList events={[frame(7)]} selectedId={undefined} now={0} onSelect={() => {}} />);
    const btn = screen.getByRole('button', { name: /FIC10301/ });
    expect(btn.getAttribute('aria-label')).toBeNull();
    expect(btn.textContent).toContain('EVT-7 · 12h');
  });

  it('writes the opening time once, and the review as tone, glyph and word with its state line under it', () => {
    const { container } = render(<EpisodeList events={[frame(7, { shelf_state: 'EXPIRED', shelve_until: '2026-09-21T12:24:25Z' })]}
      selectedId={undefined} now={Date.now()} onSelect={() => {}} />);
    const row = container.querySelector('.cpm-event-row')!;
    expect(row.lastElementChild?.textContent).toBe('5 Oct 07:45');
    const review = row.querySelector('.cpm-event-row__states')!;
    expect(review.querySelector('.cpm-pill__glyph')?.textContent).toBe('!');
    expect(review.querySelector('.cpm-pill__dot')).toBeNull();
    expect(review.textContent).toBe('!Shelf expired · unreviewedOpen');
    expect(row.querySelectorAll('.cpm-pill__dot')).toHaveLength(1);   // the severity keeps its dot
  });
});
