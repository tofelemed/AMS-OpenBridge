/**
 * CHG-172 (owner answer 3a) — Add user's "Active account" box: the page now sends `is_active`, and the
 * service stores it. Before, the box was dropped by the page and the INSERT ignored it, so an unticked
 * account was created active. Without the field an account is created active, as before.
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, FakeUser, seedStandardRoles } from './support/fake-db';
import { actorOf, captureAudit, PASSWORD } from './support/helpers';
import { UserAdminService } from '../src/services/user-admin.service';
import { validateCreateUser } from '../src/utils/validation';

let db: FakeDb;
let svc: UserAdminService;
let audit: unknown[][];
let su: FakeUser;

beforeEach(() => {
  db = seedStandardRoles(new FakeDb()).install();
  su = db.addUser({ username: 'superadmin', role: 'SuperAdmin' });
  svc = new UserAdminService();
  audit = captureAudit();
});
afterEach(() => mock.restoreAll());

test('an account created with Active account unticked is inactive', async () => {
  const created = await svc.createUser(
    { username: 'shift_b', email: 'shift.b@example.test', password: PASSWORD, role: 'Viewer', is_active: false }, actorOf(su));
  assert.equal(created.is_active, false);
  assert.equal(db.user(created.user_id)!.is_active, false);
  const after = (audit[0] as any[])[5];
  assert.equal(after.is_active, false);
});

test('an account created with Active account ticked is active', async () => {
  const created = await svc.createUser(
    { username: 'shift_c', email: 'shift.c@example.test', password: PASSWORD, role: 'Viewer', is_active: true }, actorOf(su));
  assert.equal(created.is_active, true);
});

test('an account created without the field is active, as before', async () => {
  const created = await svc.createUser(
    { username: 'shift_d', email: 'shift.d@example.test', password: PASSWORD, role: 'Viewer' }, actorOf(su));
  assert.equal(created.is_active, true);
  assert.equal(db.user(created.user_id)!.is_active, true);
});

const runCreateValidation = async (body: Record<string, unknown>): Promise<unknown> => {
  let passed: unknown = 'not called';
  await validateCreateUser({ body } as any, {} as any, (err?: unknown) => { passed = err ?? null; });
  return passed;
};

test('the create validation refuses an Active account value that is not true or false', async () => {
  const base = { username: 'shift_e', email: 'shift.e@example.test', password: PASSWORD, role: 'Viewer' };
  assert.equal(await runCreateValidation({ ...base, is_active: false }), null);
  const err = await runCreateValidation({ ...base, is_active: 'sometimes' }) as { message: string; statusCode: number };
  assert.equal(err.message, 'is_active must be a boolean');
  assert.equal(err.statusCode, 400);
});
