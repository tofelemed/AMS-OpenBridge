// CHG-078: a signal card reads either "live" or its age — never "live · 13 days ago".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveSource } from './OperatingState';

describe('signal card source label (CHG-078)', () => {
  const now = Date.UTC(2026, 9, 10, 12, 0, 0);
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  it('a current value is live, with no age', () => {
    expect(liveSource(now - 60_000)).toBe('live');
    expect(liveSource(undefined)).toBe('live');
  });
  it('a stalled value is only its age, never "live"', () => {
    expect(liveSource(now - 13 * 86_400_000)).toBe('last received 13 days ago');
    expect(liveSource(now - 3 * 3_600_000)).toBe('last received 3 h ago');
    expect(liveSource(now - 13 * 86_400_000)).not.toMatch(/live/);
  });
});
