// @vitest-environment jsdom
// The bar's mode word: LIVE only with fresh samples when the page says so; nothing on an empty chart; NO NEW SAMPLES when
// pens exist but samples stopped. A caller that passes no verdict (chart, dialog) keeps the old rule.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { BoxZoom } from '../../charts/useBoxZoom';

vi.mock('../../charts/ChartZoomBar', () => ({ default: () => null }));
import { TrendTimeBar } from './TrendTimeBar';

afterEach(cleanup);

const bar = (over: Partial<React.ComponentProps<typeof TrendTimeBar>> = {}) => render(
  <TrendTimeBar windowStart={0} windowEnd={1} fmtClock={String} rangeMs={900000} live playing onRange={() => undefined} onStep={() => undefined}
    onTogglePlay={() => undefined} onNow={() => undefined} box={{} as BoxZoom} hasData={false} {...over} />);
const mode = () => screen.queryByTestId('trend-mode')?.textContent ?? null;

describe('TrendTimeBar mode', () => {
  it('reads LIVE with fresh samples', () => { bar({ sampleFresh: true, hasPens: true }); expect(mode()).toBe('LIVE'); });
  it('shows nothing with no pens and no samples', () => { bar({ sampleFresh: false, hasPens: false }); expect(mode()).toBeNull(); });
  it('reads NO NEW SAMPLES when pens exist and samples stopped', () => { bar({ sampleFresh: false, hasPens: true }); expect(mode()).toBe('NO NEW SAMPLES'); });
  it('keeps PAUSED and HISTORICAL', () => {
    bar({ sampleFresh: false, playing: false }); expect(mode()).toBe('PAUSED'); cleanup();
    bar({ sampleFresh: false, live: false }); expect(mode()).toBe('HISTORICAL');
  });
  it('keeps today\'s LIVE when the caller passes no verdict', () => { bar(); expect(mode()).toBe('LIVE'); });
});
