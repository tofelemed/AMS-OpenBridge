// @vitest-environment jsdom
// CHG-174: the selected event's panel (it was the row dialog); the loop link and registry rules carried over from that dialog.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuditEventPanel } from './AuditEventPanel';

const go = vi.fn();
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../../ui/shell/shellHooks', () => ({ useShellBand: () => 'wide' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => go }));
vi.mock('../../../cpa/activeZone', () => ({ activeZone: () => 'UTC' }));

const names = { bundle: () => undefined, deployment: () => undefined };
const event = (over: Record<string, unknown> = {}) => ({
  eventId: 'e-1', timestampUtc: '2026-11-04T13:04:11Z', eventType: 'CPM_LOOP_ACTIVATED', userId: 'admin',
  entityType: 'CpmLoop', entityId: 'FIC00701', correlationId: 'c-71af', currentHash: 'abcdef0123456789ffff', ...over,
});
const show = (over: Record<string, unknown> = {}, loopIds: string[] | null = ['FIC00701'], held: string[] = [], me: { user_id: string; username: string; full_name?: string } | null = null) =>
  render(<AuditEventPanel event={event(over)} names={names} has={p => held.includes(p)} loopIds={loopIds ?? undefined} me={me} open onClose={() => {}} />);
const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

afterEach(() => { cleanup(); go.mockClear(); });

describe('the selected event', () => {
  it('names the action once, the actor, the time with seconds and year, the entity, and keeps Before and after values: Not available', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Loop activated' })).toBeTruthy();
    expect(screen.getByText('Loop')).toBeTruthy();
    expect(value('Actor')).toBe('admin');
    expect(value('When · UTC')).toBe('4 Nov 2026 13:04:11');
    expect(value('Entity')).toBe('FIC00701');
    expect(value('Before and after values')).toBe('Not available');
  });

  it('links a loop in the registry, a retired one too', () => {
    show({ entityId: 'OLD1', eventType: 'CPM_LOOP_RETIRED' }, ['OLD1']);
    fireEvent.click(screen.getByText('OLD1 ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/registry/OLD1');
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

  it('an event with no actor reads Unknown user, with no talk of ids (CHG-202)', () => {
    show({ userId: '' });
    expect(value('Actor')).toBe('Unknown user');
    show({ userId: '7c41e0d2-9b1a-4f7e-8d2c-0a1b2c3d4e5f' });
    expect(screen.getAllByText('Unknown user')).toHaveLength(2);
    expect(screen.queryByText(/user id|Record details/)).toBeNull();
  });

  it('the signed-in person reads by their name (CHG-202)', () => {
    show({ userId: 'admin' }, ['FIC00701'], [], { user_id: 'u-1', username: 'admin', full_name: 'Super Administrator' });
    expect(value('Actor')).toBe('Super Administrator');
  });

  it('has no Record details: the panel is the record in words, with no hash, correlation or code (owner Q6, CHG-202)', () => {
    show();
    expect(screen.queryByText('Record details')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toMatch(/abcdef0123|c-71af|CPM_LOOP_ACTIVATED/);
  });

  it('an object known only by an id shows its type once, and no Entity row (CHG-202)', () => {
    show({ entityType: 'data-source-config', entityId: '043f185b-1111-4222-8333-944445555666', eventType: 'ingestion.datasource.tested' }, []);
    expect(screen.getByRole('heading', { name: 'Data source tested' })).toBeTruthy();
    expect(screen.getAllByText('Data source')).toHaveLength(1);
    expect(screen.queryByText('Entity')).toBeNull();
    expect(document.body.textContent).not.toMatch(/043f185b/);
  });
});
