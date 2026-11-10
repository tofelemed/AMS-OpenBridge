// @vitest-environment jsdom
// CHG-159 (owner review, 10 Nov): one head row over the chart — signals, Normalise and the overlay on the left; the zoom
// buttons and Open in Trend on the right, as the owner's design shows.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
import RangeToolbar from './RangeToolbar';

afterEach(cleanup);
const base = {
  loop: undefined, signals: ['pv'], onToggleSignal: () => {}, overlays: [{ key: 'iae', label: 'IAE', resolution: '15m' }],
  overlayKey: 'iae', onOverlay: () => {}, trendHref: '/trend?x', onOpenTrend: () => {}, normalize: false, onToggleNormalize: () => {},
};

describe('RangeToolbar head row', () => {
  it('puts the tools it is given at the right end, before Open in Trend', () => {
    const { container } = render(<RangeToolbar {...base} tools={<button type="button">Zoom area</button>} />);
    const end = container.querySelector('.cpm-hist-row__end') as HTMLElement;
    expect(within(end).getAllByRole('button').map(b => b.textContent)).toEqual(['Zoom area', 'Open in Trend ↗']);
  });

  it('keeps the signals, Normalise and the overlay on the left', () => {
    const { container } = render(<RangeToolbar {...base} tools={<button type="button">Zoom area</button>} />);
    const end = container.querySelector('.cpm-hist-row__end') as HTMLElement;
    expect(within(end).queryByRole('button', { name: /Normalise/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Signals' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'KPI overlay' })).toBeTruthy();
  });
});
