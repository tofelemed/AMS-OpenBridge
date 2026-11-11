// @vitest-environment jsdom
// CHG-174: the selected event's panel (it was the row dialog); the loop link and registry rules carried over from that dialog.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AuditEventPanel } from './AuditEventPanel';

const go = vi.fn();
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../../../ui/shell/shellHooks', () => ({ useShellBand: () => 'wide' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => go }));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));

const names = { bundle: () => undefined, deployment: () => undefined };
const event = (over: Record<string, unknown> = {}) => ({
  eventId: 'e-1', timestampUtc: '2026-11-04T13:04:11Z', eventType: 'CPM_LOOP_ACTIVATED', userId: 'admin',
  entityType: 'CpmLoop', entityId: 'FIC00701', correlationId: 'c-71af', currentHash: 'abcdef0123456789ffff', ...over,
});
const show = (over: Record<string, unknown> = {}, loopIds: string[] | null = ['FIC00701'], held: string[] = []) =>
  render(<AuditEventPanel event={event(over)} names={names} has={p => held.includes(p)} loopIds={loopIds ?? undefined} open onClose={() => {}} />);
const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

afterEach(() => { cleanup(); go.mockClear(); });

describe('the selected event', () => {
  it('names the action once, the actor, the time with seconds and year, the entity, and keeps Before and after values: Not available', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Loop activated' })).toBeTruthy();
    expect(screen.getByText('CPM loop')).toBeTruthy();
    expect(value('Actor')).toBe('admin');
    expect(value('When · UTC')).toBe('4 Nov 2026 13:04:11');
    expect(value('Entity')).toBe('FIC00701');
    expect(value('Before and after values')).toBe('Not available');
  });

  it('links a loop in the registry, a retired one too', () => {
    show({ entityId: 'OLD1', eventType: 'CPM_LOOP_RETIRED' }, ['OLD1']);
    fireEvent.click(screen.getByText('OLD1 ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/registry?loop=OLD1');
  });

  it('says when a loop is not in the registry, and offers no link', () => {
    show({ entityId: 'GONE1' });
    expect(screen.getByText('GONE1 is not in the loop registry.')).toBeTruthy();
    expect(screen.queryByText(/↗/)).toBeNull();
  });

  it('a bulk event is not one loop: no registry claim, no link', () => {
    show({ entityId: 'bulk:5', eventType: 'CPM_LOOPS_BULK_RETIRED' });
    expect(value('Entity')).toBe('5 loops');
    expect(screen.queryByText(/not in the loop registry|↗/)).toBeNull();
  });

  it('does not claim the loop is missing while the registry has not answered', () => {
    show({}, null);
    expect(screen.queryByText(/not in the loop registry|↗/)).toBeNull();
  });

  it('an HMI display has no link in this build (the designer is outside the CPA slice)', () => {
    show({ entityType: 'Display', entityId: 'd19f0a2c-1111-4222-8333-944445555666', eventType: 'DISPLAY_PUBLISHED' }, [], ['display.edit']);
    expect(screen.queryByText(/↗/)).toBeNull();
  });

  it('a user event opens Administration › Users for a user administrator', () => {
    show({ entityType: 'User', entityId: '5f3c91e2-1111-4222-8333-944445555666', eventType: 'USER_UPDATED' }, [], ['admin.users.edit']);
    fireEvent.click(screen.getByText('Users ↗'));
    expect(go).toHaveBeenCalledWith('/admin/users');
  });

  it('an event with no actor reads Not recorded by name; no correlation reads Not recorded in Record details', () => {
    show({ userId: '', correlationId: null });
    expect(value('Actor')).toBe('Not recorded by name');
    fireEvent.click(screen.getByText('Record details'));
    const chain = within(screen.getByRole('dialog')).getByRole('region', { name: 'Chain' });
    expect(within(chain).getByText('Correlation').nextElementSibling?.textContent).toBe('Not recorded');
  });

  it('copies the whole hash and the correlation, and says so', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    show();
    fireEvent.click(screen.getByText('Record details'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy correlation' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('abcdef0123456789ffff'));
    expect(write).toHaveBeenCalledWith('c-71af');
    expect(screen.getByText('abcdef012345…')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/copied/));
  });
});
