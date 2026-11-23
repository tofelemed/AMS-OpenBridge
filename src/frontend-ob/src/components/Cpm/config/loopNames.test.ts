import { describe, expect, it } from 'vitest';
import { realName } from './loopNames';

describe('realName', () => {
  it('keeps a name the plant gave and drops the registry stand-ins', () => {
    expect(realName({ loopId: 'FIC10302', displayName: 'Reactor feed flow' })).toBe('Reactor feed flow');
    expect(realName({ loopId: 'FIC10301', displayName: 'Flow controller FIC10301 (FCS0101)' })).toBe('');
    expect(realName({ loopId: 'FIC10301', displayName: 'Flow controller (FCS0101)' })).toBe('');
    expect(realName({ loopId: 'TIC20001', displayName: 'Temperature controller (TCS0201)' })).toBe('');
    expect(realName({ loopId: 'PIC1', displayName: 'Pressure controller' })).toBe('');
    expect(realName({ loopId: 'PIC1', displayName: 'Pressure controller · FCS0101' })).toBe('');
    expect(realName({ loopId: 'PIC1', displayName: 'FCS0101' })).toBe('');
    expect(realName({ loopId: 'TIC2', displayName: 'Feed preheater outlet temperature' })).toBe('Feed preheater outlet temperature');
    expect(realName({ loopId: 'TIC2' })).toBe('');
  });
});
