// CHG-059 (SME #23): plant facts ride beside the causes; a loop with only facts still gets a banner, not as a fault.
import { describe, expect, it } from 'vitest';
import type { CpmReadiness } from '../../../api/cpmApi';
import { readinessCauses } from './readinessCauses';

const r = (checks: Array<{ id: string; ok: boolean }>, notes?: string[]) =>
  ({ checks: checks.map(c => ({ ...c, label: c.id, message: null })), notes } as unknown as CpmReadiness);

describe('readinessCauses notes', () => {
  it('a loop with only plant facts reads as what it can be checked for', () => {
    const s = readinessCauses(r([{ id: 'tag_vp', ok: true }], ['No valve on this loop: valve (stiction) diagnosis does not apply.']), 'FIC1');
    expect(s?.causes).toEqual([]);
    expect(s?.notes).toHaveLength(1);
    expect(s?.headline).toBe('What this loop can be checked for');
  });
  it('nothing failing and no facts → no banner; an old server without notes still works', () => {
    expect(readinessCauses(r([{ id: 'tag_vp', ok: true }], []), 'FIC1')).toBeNull();
    expect(readinessCauses(r([{ id: 'peer_links', ok: false }]), 'FIC1')?.headline).toBe('Configuration limits');
  });
});

describe('readinessCauses kinds', () => {
  it('labels each cause by what it is: blocking, configuration, or data still to arrive', () => {
    const s = readinessCauses(r([{ id: 'tag_pv', ok: false }, { id: 'peer_links', ok: false }, { id: 'evidence_short', ok: false }, { id: 'evidence_verdict', ok: false }]), 'FIC1');
    expect(s?.causes.map(c => [c.id, c.kind])).toEqual([
      ['tag_pv', 'blocking'], ['peer_links', 'configuration'], ['evidence_short', 'data'], ['evidence_verdict', 'data']]);
  });
});

it('a mapped VP with no samples is data, not configuration', () => {
  const rr = { checks: [{ id: 'tag_vp', ok: false, label: 'VP', message: null, state: 'TEMPORARILY_UNAVAILABLE' }] } as unknown as CpmReadiness;
  expect(readinessCauses(rr, 'FIC1')?.causes[0].kind).toBe('data');
});
