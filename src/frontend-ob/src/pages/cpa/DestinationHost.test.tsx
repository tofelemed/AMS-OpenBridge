// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DestinationHost, type HostTab } from './DestinationHost';

vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => p !== 'denied' }),
}));
vi.mock('../../app/guards', () => ({
  RestrictedRoute: () => <p>restricted</p>,
  RouteFallback: () => null,
}));

afterEach(cleanup);

const Where = () => {
  const { search } = useLocation();
  return <output>{search}</output>;
};

const TABS: HostTab[] = [
  { value: 'summary', label: 'Summary', kindParam: 'window', render: () => <p>summary page</p> },
  { value: 'historical', label: 'Historical', kindParam: 'kind', windowIsEnd: true, own: ['window'], render: () => <p>historical page</p> },
  { value: 'signals', label: 'Signals', badge: 5, own: ['event'], render: () => <p>signals page</p> },
  { value: 'locked', label: 'Locked', permission: 'denied', render: () => <p>locked page</p> },
];

const open = (search: string) => render(
  <MemoryRouter initialEntries={[`/cpm/loop${search}`]}>
    <DestinationHost label="Loop" tabs={TABS} />
    <Where />
  </MemoryRouter>,
);
const address = () => new URLSearchParams(screen.getByRole('status').textContent ?? '');

describe('DestinationHost', () => {
  it('opens the first tab, offers only permitted tabs and shows the count', () => {
    open('');
    expect(screen.getByText('summary page')).toBeTruthy();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Summary', 'Historical', 'Signals5']);
  });

  it('keeps the loop and the plant scope on a tab change', () => {
    open('?loop=L&site=a&area=b&unit=c');
    fireEvent.click(screen.getByRole('tab', { name: 'Historical' }));
    expect(screen.getByText('historical page')).toBeTruthy();
    const q = address();
    expect([q.get('tab'), q.get('loop'), q.get('site'), q.get('area'), q.get('unit')]).toEqual(['historical', 'L', 'a', 'b', 'c']);
  });

  it('keeps a 24h choice on a tab change', () => {
    open('?loop=L&window=24h');
    fireEvent.click(screen.getByRole('tab', { name: 'Historical' }));
    const q = address();
    expect([q.get('kind'), q.get('window')]).toEqual(['24h', null]);
  });

  it('leaves a selection on its tab', () => {
    open('?tab=signals&loop=L&event=E');
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(address().get('event')).toBeNull();
    expect(address().get('loop')).toBe('L');
  });

  it('keeps a 24h choice from a link to a page where window is an end', () => {
    open('?tab=historical&window=24h');
    const q = address();
    expect([q.get('kind'), q.get('window')]).toEqual(['24h', null]);
    expect(screen.getByText('historical page')).toBeTruthy();
  });

  it('leaves an evaluated end alone', () => {
    open('?tab=historical&window=2026-11-04T12:00:00Z');
    expect(address().get('window')).toBe('2026-11-04T12:00:00Z');
  });
});
