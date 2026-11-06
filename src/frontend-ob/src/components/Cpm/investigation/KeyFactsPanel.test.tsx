// @vitest-environment jsdom
/** CHG-129: six identical answers read as one line; any real value brings the tiles back. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { KEY_FACTS } from './keyFacts';
import { KeyFacts } from './KeyFactsPanel';

const availability = vi.hoisted(() => ({ value: (_field: string) => ({ state: 'insufficient', short: 'Insufficient data', reason: 'too few qualified samples in the window' }) }));
vi.mock('../metricAvailability', async importOriginal => ({
  ...(await importOriginal<typeof import('../metricAvailability')>()),
  contextOfMatrix: () => ({}),
  metricAvailability: (_c: unknown, field: string) => availability.value(field),
}));

afterEach(cleanup);

const matrix = {} as CpmGateMatrix;

describe('KeyFacts', () => {
  it('says one line and names every fact when all share one answer', () => {
    const { container } = render(<KeyFacts matrix={matrix} metrics={{}} />);
    expect(container.querySelector('.cpm-kpi-row')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('Insufficient data.');
    expect(text).toContain('Too few qualified samples in the window for:');
    for (const f of KEY_FACTS) expect(text).toContain(f.label);
  });

  it('brings the tiles back as soon as one fact differs', () => {
    availability.value = field => (field === KEY_FACTS[0].field
      ? { state: 'measured', short: '', reason: null } as never
      : { state: 'insufficient', short: 'Insufficient data', reason: 'too few qualified samples in the window' });
    const { container } = render(<KeyFacts matrix={matrix} metrics={{ [KEY_FACTS[0].field]: 1 }} />);
    expect(container.querySelector('.cpm-kpi-row')).not.toBeNull();
    expect(screen.getByText(KEY_FACTS[1].label)).toBeTruthy();
  });
});
