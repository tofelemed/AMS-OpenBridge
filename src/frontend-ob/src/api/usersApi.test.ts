// CHG-172 (owner answer 3c): the Users page shows the server's own refusals (CHG-171's 409 and 403) instead of the generic
// "Admin access required."; a 403 with no message keeps the old words. Add user sends is_active (answer 3a).
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post, put } = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock('./http', () => ({ authedAxios: { post, put, get: vi.fn(), delete: vi.fn() } }));

import { createUser, extractApiError, updateUser } from './usersApi';

const refusal = (status: number, data?: unknown) => {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', String(status), config, null, { status, statusText: '', headers: {}, config, data });
};

beforeEach(() => { post.mockReset(); put.mockReset(); });

describe('the Users page error words', () => {
  it('shows the server refusal for a 409', () => {
    expect(extractApiError(refusal(409, { success: false, error: 'You cannot change your own role.' }))).toBe('You cannot change your own role.');
    expect(extractApiError(refusal(409, { error: 'This change would leave no active user with the rbac.manage permission. Give it to another active user first.' })))
      .toBe('This change would leave no active user with the rbac.manage permission. Give it to another active user first.');
  });

  it('shows the server refusal for a 403', () => {
    const words = "Assigning the role 'SuperAdmin' needs the rbac.manage permission, because the role has permissions you do not hold.";
    expect(extractApiError(refusal(403, { success: false, error: words }))).toBe(words);
    expect(extractApiError(refusal(403, { error: 'Missing required permission: admin.users.edit' }))).toBe('Missing required permission: admin.users.edit');
  });

  it('keeps Admin access required for a 403 without a message, and the session words for a 401', () => {
    expect(extractApiError(refusal(403))).toBe('Admin access required.');
    expect(extractApiError(refusal(401, { error: 'jwt expired' }))).toBe('Your session expired. Please sign in again.');
    expect(extractApiError(new Error('x'))).toBe('An unexpected error occurred.');
  });
});

describe('the user requests', () => {
  it('posts Add user with is_active to the same endpoint', async () => {
    post.mockResolvedValue({ data: { data: { user_id: 'n' } } });
    await createUser({ username: 'shift_b', email: 'shift.b@example.test', password: 'Passw0rdX', role: 'Viewer', is_active: false });
    expect(post).toHaveBeenCalledWith('/api/auth/users', { username: 'shift_b', email: 'shift.b@example.test', password: 'Passw0rdX', role: 'Viewer', is_active: false });
  });

  it('puts only the given fields to the same endpoint', async () => {
    put.mockResolvedValue({ data: { data: { user_id: 'u1' } } });
    await updateUser('u1', { email: 'a@example.test' });
    expect(put).toHaveBeenCalledWith('/api/auth/users/u1', { email: 'a@example.test' });
  });
});
