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
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Original result', 'Re-run']);   // CHG-184: no id
    fireEvent.change(screen.getByLabelText('Result of this window'), { target: { value: 'abc123def456' } });
    expect(onChange).toHaveBeenCalledWith('abc123def456');
  });
  it('shows the re-run as selected when it is the one open, original still offered first', () => {
    render(<WindowResultSelect row={rerun} others={[original]} onChange={() => {}} />);
    expect((screen.getByLabelText('Result of this window') as HTMLSelectElement).value).toBe('abc123def456');
    expect(screen.getAllByRole('option')[0].textContent).toBe('Original result');
  });
  it('numbers several re-runs in the order they were computed, never by id (CHG-184)', () => {
    const later = row('2026-10-05T12:30:00Z', { replayId: 'zzz999' });
    later.metadata = { ...later.metadata, computedAt: '2026-10-06T09:00:00Z' };
    const earlier = row('2026-10-05T12:30:00Z', { replayId: 'yyy888' });
    earlier.metadata = { ...earlier.metadata, computedAt: '2026-10-06T08:00:00Z' };
    render(<WindowResultSelect row={later} others={[original, earlier]} onChange={() => {}} />);
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options.map(o => o.textContent)).toEqual(['Original result', 'Re-run 1', 'Re-run 2']);
    expect(options.map(o => o.value)).toEqual(['', 'yyy888', 'zzz999']);
    expect((screen.getByLabelText('Result of this window') as HTMLSelectElement).value).toBe('zzz999');
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
