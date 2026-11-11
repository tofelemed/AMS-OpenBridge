/**
 * The Add user / Edit user form: its fields, the checks (word for word since before CHG-172) and the requests it sends.
 *
 * CHG-172 (owner answers 3a, 3b): Add user sends "Active account" (the page dropped it, so an unticked account was created
 * active). Edit user sends only the fields that changed: the server ends a user's sessions whenever the request carries role
 * or is_active (user-admin.service.ts), so sending both on every save signed the person out after an email fix.
 */
import type { AdminUser, CreateUserPayload, UpdateUserPayload } from '../../../api/usersApi';

export interface UserForm {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: string;
  is_active: boolean;
}

export const EMPTY_FORM: UserForm = { username: '', email: '', full_name: '', password: '', role: 'Viewer', is_active: true };

export const formOf = (u: AdminUser): UserForm => ({
  username: u.username, email: u.email, full_name: u.full_name ?? '', password: '', role: u.role ?? 'Viewer', is_active: u.is_active,
});

/** The first failing check, or null. Username and password are checked only when adding. */
export function validateForm(form: UserForm, editing: boolean): string | null {
  if (!editing) {
    if (!/^[a-zA-Z0-9_]+$/.test(form.username) || form.username.length < 3) {
      return 'Username must be 3+ chars (letters, numbers, underscores).';
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/.test(form.password)) {
      return 'Password must be 8+ chars with upper, lower, and a number.';
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export const createPayload = (form: UserForm): CreateUserPayload => ({
  username: form.username,
  email: form.email,
  password: form.password,
  full_name: form.full_name || undefined,
  role: form.role,
  is_active: form.is_active,
});

/** What an edit changes; empty when nothing did. Role and status only when they changed, so nobody is signed out for less. */
export function changedFields(user: AdminUser, form: UserForm): UpdateUserPayload {
  const out: UpdateUserPayload = {};
  if (form.email !== user.email) out.email = form.email;
  if (form.full_name !== (user.full_name ?? '')) out.full_name = form.full_name;
  if (form.role !== user.role) out.role = form.role;
  if (form.is_active !== user.is_active) out.is_active = form.is_active;
  return out;
}
