import { describe, expect, it } from 'vitest';
import { serviceName } from './loopName';

describe('serviceName', () => {
  it('drops the tag the name repeats', () => {
    expect(serviceName({ loopId: 'FIC00701', displayName: 'Flow controller FIC00701 (FCS0102)' })).toBe('Flow controller (FCS0102)');
  });

  it('leaves a name that does not repeat it', () => {
    expect(serviceName({ loopId: 'FIC10302', displayName: 'Reactor feed flow' })).toBe('Reactor feed flow');
  });

  it('keeps a tag that is only part of a longer word', () => {
    expect(serviceName({ loopId: 'B2', displayName: 'B2 027 Pressure Control' })).toBe('027 Pressure Control');
    expect(serviceName({ loopId: 'B2', displayName: 'AB2 pressure' })).toBe('AB2 pressure');
  });

  it('falls back to the full name when the name is only the tag', () => {
    expect(serviceName({ loopId: 'FIC1', displayName: 'FIC1' })).toBe('FIC1');
  });

  it('copes with no name', () => {
    expect(serviceName({ loopId: 'FIC1', displayName: null })).toBe('');
  });
});
