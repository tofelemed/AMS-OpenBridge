// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useWindowKind } from './useWindowKind';

const kindAt = (url: string, param: string) => renderHook(() => useWindowKind(param), {
  wrapper: ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
}).result.current[0];

describe('useWindowKind', () => {
  it('reads the page\'s own name', () => {
    expect(kindAt('/x?kind=24h', 'kind')).toBe('24h');
  });

  it('reads an old ?window=24h on a page that uses `kind`', () => {
    expect(kindAt('/x?window=24h', 'kind')).toBe('24h');
  });

  it('never takes a window END for a kind', () => {
    expect(kindAt('/x?window=2026-11-04T12:00:00Z', 'kind')).toBe('12h');
  });
});
