// CHG-172 (owner answers 3a, 3b): Add user sends "Active account"; Edit user sends only what changed, so an email fix no longer
// signs the person out (the server ends a user's sessions whenever role or is_active is in the request). The checks keep
// their words.
import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, changedFields, createPayload, formOf, validateForm } from './userForm';
import type { AdminUser } from '../../../api/usersApi';

const user: AdminUser = {
  user_id: 'u1', username: 'a_engineer', email: 'engineer.a@example.test', full_name: 'A. Engineer',
  role: 'Engineer', is_active: true, created_at: '2026-11-03T08:00:00Z',
};

describe('Add user', () => {
  it('sends Active account as it is ticked', () => {
    const form = { ...EMPTY_FORM, username: 'shift_b', email: 'shift.b@example.test', password: 'Passw0rdX', role: 'Operator', is_active: false };
    expect(createPayload(form)).toEqual({
      username: 'shift_b', email: 'shift.b@example.test', password: 'Passw0rdX', full_name: undefined, role: 'Operator', is_active: false,
    });
    expect(createPayload({ ...form, is_active: true, full_name: 'Shift B' })).toMatchObject({ is_active: true, full_name: 'Shift B' });
  });

  it('starts as a Viewer with Active account ticked', () => {
    expect(EMPTY_FORM).toEqual({ username: '', email: '', full_name: '', password: '', role: 'Viewer', is_active: true });
  });

  it('keeps every check word for word', () => {
    const ok = { ...EMPTY_FORM, username: 'shift_b', email: 'shift.b@example.test', password: 'Passw0rdX' };
    expect(validateForm(ok, false)).toBeNull();
    expect(validateForm({ ...ok, username: 'ab' }, false)).toBe('Username must be 3+ chars (letters, numbers, underscores).');
    expect(validateForm({ ...ok, username: 'shift-b' }, false)).toBe('Username must be 3+ chars (letters, numbers, underscores).');
    expect(validateForm({ ...ok, password: 'password1' }, false)).toBe('Password must be 8+ chars with upper, lower, and a number.');
    expect(validateForm({ ...ok, email: 'not-an-address' }, false)).toBe('Enter a valid email address.');
  });
});

describe('Edit user', () => {
  it('starts from the stored account', () => {
    expect(formOf(user)).toEqual({ username: 'a_engineer', email: 'engineer.a@example.test', full_name: 'A. Engineer', password: '', role: 'Engineer', is_active: true });
    expect(formOf({ ...user, full_name: undefined }).full_name).toBe('');
  });

  it('sends only the email when only the email changed, so the person stays signed in', () => {
    expect(changedFields(user, { ...formOf(user), email: 'a.engineer@example.test' })).toEqual({ email: 'a.engineer@example.test' });
  });

  it('sends the role or the status only when they changed', () => {
    expect(changedFields(user, { ...formOf(user), role: 'Operator' })).toEqual({ role: 'Operator' });
    expect(changedFields(user, { ...formOf(user), is_active: false })).toEqual({ is_active: false });
    expect(changedFields(user, { ...formOf(user), full_name: 'Alex Engineer', role: 'Admin' })).toEqual({ full_name: 'Alex Engineer', role: 'Admin' });
  });

  it('sends nothing when nothing changed', () => {
    expect(changedFields(user, formOf(user))).toEqual({});
    expect(changedFields({ ...user, full_name: undefined }, formOf({ ...user, full_name: undefined }))).toEqual({});
  });

  it('checks only the email', () => {
    expect(validateForm({ ...formOf(user), email: 'bad' }, true)).toBe('Enter a valid email address.');
    expect(validateForm(formOf(user), true)).toBeNull();
  });
});
