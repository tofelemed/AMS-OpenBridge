// CHG-200 (final test #31): Compare window sizes says what its Windows count counts: "0 evaluated · 12 declined", never a bare
// "0" beside the declined pill.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { CpmKpiRow, CpmWindowSpec } from '../../../api/cpmApi';
import { KindRow } from './CompareAcrossKinds';

vi.mock('./WindowResults', () => ({ isDeclined: (r: { declined?: boolean }) => !!r.declined, fmtVal: (v: unknown) => String(v ?? '—') }));
afterEach(cleanup);

describe('KindRow', () => {
  it('names the evaluated count beside the declined one', () => {
    const rows = [{ declined: true }, { declined: true }, { mae: 1 }] as unknown as CpmKpiRow[];
    const { container } = render(<table><tbody><KindRow spec={{ kind: '1m' } as CpmWindowSpec} rows={rows} isLoading={false} field="mae" pct={false} active={false} onPick={() => {}} /></tbody></table>);
    expect(container.querySelectorAll('td')[4].textContent).toBe('1 evaluated · 2 declined');
  });
});
