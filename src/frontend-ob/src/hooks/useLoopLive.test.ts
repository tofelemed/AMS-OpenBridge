import { describe, expect, it } from 'vitest';
import type { LiveMetric } from '../store/mqttStore';
import { liveQuality, qualityLabel } from './useLoopLive';

const metric = (value: LiveMetric['value'], quality?: number) => ({ value, quality, ts: 0 }) as LiveMetric;

describe('signal quality', () => {
  it.each([[45], [100], [250], [0]])('never reads a PV of %d as a quality code', pv => {
    expect(liveQuality({ quality: undefined, pv: metric(pv) }).label).toBe('UNKNOWN');
  });

  it('uses the PV sample\'s own quality field when it has one', () => {
    expect(liveQuality({ quality: undefined, pv: metric(45, 192) }).label).toBe('GOOD');
    expect(liveQuality({ quality: undefined, pv: metric(250, 0) }).label).toBe('BAD');
    expect(liveQuality({ quality: undefined, pv: metric(45, 64) }).label).toBe('UNCERTAIN');
  });

  it('prefers the quality metric', () => {
    expect(liveQuality({ quality: metric(0), pv: metric(45, 192) }).label).toBe('BAD');
    expect(liveQuality({ quality: metric('GOOD'), pv: metric(45, 0) }).label).toBe('GOOD');
  });

  it('says there is no signal when nothing arrived', () => {
    expect(liveQuality({ quality: undefined, pv: undefined }).label).toBe('NO SIGNAL');
  });

  it('still reads a real quality metric as a code', () => {
    expect(qualityLabel(metric(192)).label).toBe('GOOD');
    expect(qualityLabel(metric(64)).label).toBe('UNCERTAIN');
    expect(qualityLabel(metric(0)).label).toBe('BAD');
  });
});
