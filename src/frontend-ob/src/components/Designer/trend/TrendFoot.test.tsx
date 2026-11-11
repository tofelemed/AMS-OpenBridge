// @vitest-environment jsdom
/** CHG-175: the Trend chart's foot strip says the state (tone, glyph, word), the zone once, and the notes that apply. */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrendFoot } from './TrendFoot';

afterEach(cleanup);

const foot = (p: Partial<React.ComponentProps<typeof TrendFoot>> = {}) =>
  render(<TrendFoot state="live" zoneName="UTC" {...p} />);
const text = () => screen.getByTestId('trend-foot').textContent?.replace(/\s+/g, ' ').trim();

describe('TrendFoot', () => {
  it('names each state with its glyph and word', () => {
    const words: Array<[React.ComponentProps<typeof TrendFoot>['state'], string]> = [
      ['live', '● Live'], ['stale', '◐ No new samples'], ['paused', '‖ Paused'], ['fixed', '○ Fixed period'],
    ];
    for (const [state, word] of words) {
      foot({ state });
      expect(text()).toContain(word);
      cleanup();
    }
  });

  it('shows No new samples in the caution tone, not the running colour of Live', () => {
    foot({ state: 'stale' });
    expect(screen.getByText('No new samples').closest('.trend-core__state')?.className).toContain('trend-core__state--warn');
    cleanup();
    foot({ state: 'live' });
    expect(screen.getByText('Live').closest('.trend-core__state')?.className).toContain('trend-core__state--ok');
  });

  it('names the zone once', () => {
    foot({ zoneName: 'GST' });
    expect(text()).toContain('times in GST');
    expect(text()?.match(/GST/g)).toHaveLength(1);
  });

  it('says Zoomed only while following live', () => {
    foot({ state: 'live', zoomed: true });
    expect(text()).toContain('Zoomed · Reset to follow live');
    cleanup();
    foot({ state: 'fixed', zoomed: true });
    expect(text()).not.toContain('Zoomed');
  });

  it('names a pen that was not read, once', () => {
    foot({ state: 'fixed', failed: ['OP'] });
    expect(text()).toContain('◐ OP not read · the values shown may be incomplete');
    cleanup();
    foot({ state: 'fixed', failed: ['OP', 'VP'] });
    expect(text()).toContain('◐ OP, VP not read');
  });
});
