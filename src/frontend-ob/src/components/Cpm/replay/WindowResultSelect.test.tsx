// CHG-140: a re-run that shares its end with the original stays reachable on Replay, the original first and labelled.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WindowResultSelect } from './WindowResultSelect';
import { useRefreshOnRerun } from './useRefreshOnRerun';
import { row } from '../evidence/windowFixtures';

afterEach(cleanup);
const original = row('2026-10-05T12:30:00Z');
const rerun = row('2026-10-05T12:30:00Z', { replayId: 'abc123def456' });

describe('WindowResultSelect', () => {
  it('lists the original first, then each re-run labelled, and writes the chosen one', () => {
    const onChange = vi.fn();
    render(<WindowResultSelect row={original} others={[rerun]} onChange={onChange} />);
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Original result', 'Re-run abc123def456']);
    fireEvent.change(screen.getByLabelText('Result of this window'), { target: { value: 'abc123def456' } });
    expect(onChange).toHaveBeenCalledWith('abc123def456');
  });
  it('shows the re-run as selected when it is the one open, original still offered first', () => {
    render(<WindowResultSelect row={rerun} others={[original]} onChange={() => {}} />);
    expect((screen.getByLabelText('Result of this window') as HTMLSelectElement).value).toBe('abc123def456');
    expect(screen.getAllByRole('option')[0].textContent).toBe('Original result');
  });
  it('is absent when the window has only one result', () => {
    render(<WindowResultSelect row={original} others={[]} onChange={() => {}} />);
    expect(screen.queryByLabelText('Result of this window')).toBeNull();
  });
});

describe('useRefreshOnRerun', () => {
  it('refreshes the window reads when the re-run finishes, and not before', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrap = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { rerender } = renderHook(({ done }) => useRefreshOnRerun(done), { wrapper: wrap, initialProps: { done: false } });
    expect(spy).not.toHaveBeenCalled();
    rerender({ done: true });
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: string[] }).queryKey.join('/'));
    expect(keys).toEqual(expect.arrayContaining(['cpm/window-at', 'cpm/window-summaries']));
  });
});
