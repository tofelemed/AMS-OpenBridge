// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuditEventDialog } from './AuditEventDialog';

const go = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => go }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));

const event = (over: Record<string, unknown> = {}) => ({
  eventId: 'e1', timestampUtc: '2026-11-04T13:04:11.48+00:00', eventType: 'CPM_LOOP_ACTIVATED', userId: 'admin',
  entityType: 'CpmLoop', entityId: 'FIC00701', correlationId: 'c-71af', currentHash: 'abcdef0123456789ffff', ...over,
});
afterEach(() => { cleanup(); go.mockClear(); });

describe('audit event dialog', () => {
  it('opens an event with the facts served, and says what is not served', () => {
    render(<AuditEventDialog event={event()} loopIds={['FIC00701']} onClose={() => {}} />);
    expect(screen.getByText('c-71af')).toBeTruthy();
    expect(screen.getByText('abcdef0123456789ffff')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText('Before and after values').nextElementSibling?.textContent).toBe('Not available');
  });

  it('links a loop event to loop detail', () => {
    render(<AuditEventDialog event={event()} loopIds={['FIC00701']} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Open loop ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/registry?loop=FIC00701');
  });

  it('says when a loop is not in the registry, and offers no link', () => {
    render(<AuditEventDialog event={event({ entityId: 'GONE1' })} loopIds={['FIC00701']} onClose={() => {}} />);
    expect(screen.getByText('GONE1 is not in the loop registry.')).toBeTruthy();
    expect(screen.queryByText('Open loop ↗')).toBeNull();
  });

  it('offers no loop link for an event that is not about a loop', () => {
    render(<AuditEventDialog event={event({ entityType: 'Display', entityId: 'd-1' })} loopIds={[]} onClose={() => {}} />);
    expect(screen.queryByText('Open loop ↗')).toBeNull();
    expect(screen.queryByText(/not in the loop registry/)).toBeNull();
  });

  it('a bulk event is not one loop: no registry claim, no link', () => {
    render(<AuditEventDialog event={event({ entityId: 'bulk:5', eventType: 'CPM_LOOPS_BULK_RETIRED' })} loopIds={['FIC00701']} onClose={() => {}} />);
    expect(screen.queryByText(/not in the loop registry/)).toBeNull();
    expect(screen.queryByText('Open loop ↗')).toBeNull();
  });

  it('a retired loop is in the registry and still links', () => {
    render(<AuditEventDialog event={event({ entityId: 'OLD1', eventType: 'CPM_LOOP_DELETED' })} loopIds={['OLD1']} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Open loop ↗'));
    expect(go).toHaveBeenCalledWith('/cpm/registry?loop=OLD1');
  });

  it('says Not recorded for an empty actor and Not available for no correlation', () => {
    render(<AuditEventDialog event={event({ userId: '', correlationId: null })} loopIds={[]} onClose={() => {}} />);
    expect(screen.getByText('Actor').nextElementSibling?.textContent).toBe('Not recorded');
    expect(screen.getByText('Correlation').nextElementSibling?.textContent).toBe('Not available');
  });

  it('copies the hash and the correlation id', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    render(<AuditEventDialog event={event()} loopIds={[]} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Hash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Correlation' }));
    expect(write).toHaveBeenCalledWith('abcdef0123456789ffff');
    expect(write).toHaveBeenCalledWith('c-71af');
  });

  it('does not claim the loop is missing while the registry has not loaded', () => {
    render(<AuditEventDialog event={event()} loopIds={undefined} onClose={() => {}} />);
    expect(screen.queryByText(/not in the loop registry/)).toBeNull();
    expect(screen.queryByText('Open loop ↗')).toBeNull();
  });
});
