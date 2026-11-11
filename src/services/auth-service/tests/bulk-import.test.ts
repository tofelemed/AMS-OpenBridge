/**
 * CHG-171 — bulk user import follows the same rules as the Add / Edit dialogs:
 * no role beyond the importer's own rights without rbac.manage (fix 2), no change to the
 * importer's own role or active flag and no removal of the last administrator (fix 1),
 * and one audit record naming the importer (fix 5).
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, FakeUser, seedStandardRoles } from './support/fake-db';
import { actorOf, captureAudit, PASSWORD } from './support/helpers';
import { executeBulkImport } from '../src/services/bulkImportService';

const beyondOwn = (r: string) =>
  `Assigning the role '${r}' needs the rbac.manage permission, because the role has permissions you do not hold.`;

let db: FakeDb;
let audit: unknown[][];
let su: FakeUser;
let ua: FakeUser;
let viewer: FakeUser;

const row = (username: string, role: string, extra: Record<string, unknown> = {}) =>
  ({ username, email: `${username}@example.test`, password: PASSWORD, role, ...extra });

beforeEach(() => {
  db = seedStandardRoles(new FakeDb()).install();
  su = db.addUser({ username: 'superadmin', role: 'SuperAdmin' });
  ua = db.addUser({ username: 'useradmin', role: 'UserAdmin' });
  viewer = db.addUser({ username: 'viewer1', role: 'Viewer' });
  audit = captureAudit();
});
afterEach(() => mock.restoreAll());

test('a row that assigns a role beyond the importer\'s rights is refused; the others import', async () => {
  const out = await executeBulkImport([row('newsu', 'SuperAdmin'), row('newview', 'Viewer')], {}, actorOf(ua));
  assert.equal(out.created, 1);
  assert.deepEqual(out.errors, [{ row: 1, error: beyondOwn('SuperAdmin') }]);
  assert.equal(db.state.users.some((u) => u.username === 'newsu'), false);
});

test('with skipErrors off the whole import is refused with 403', async () => {
  await assert.rejects(
    executeBulkImport([row('newview', 'Viewer'), row('newsu', 'SuperAdmin')], { skipErrors: false }, actorOf(ua)),
    (e: any) => e.statusCode === 403 && e.message === beyondOwn('SuperAdmin')
  );
  assert.equal(db.state.users.some((u) => u.username === 'newview'), false, 'nothing was imported');
});

test('overwrite cannot raise an existing user beyond the importer\'s rights', async () => {
  const out = await executeBulkImport([row('viewer1', 'SuperAdmin', { email: viewer.email })],
    { overwriteDuplicates: true }, actorOf(ua));
  assert.deepEqual(out.errors, [{ row: 1, error: beyondOwn('SuperAdmin') }]);
  assert.equal(db.user(viewer.user_id)!.role, 'Viewer');
});

test('overwrite cannot change the importer\'s own role or deactivate them', async () => {
  db.addUser({ username: 'superadmin2', role: 'SuperAdmin' });
  const out = await executeBulkImport([
    row('superadmin', 'Viewer', { email: su.email }),
    row('superadmin', 'SuperAdmin', { email: su.email, is_active: 'false' }),
  ], { overwriteDuplicates: true }, actorOf(su));
  assert.deepEqual(out.errors, [
    { row: 1, error: 'You cannot change your own role.' },
    { row: 2, error: 'You cannot deactivate your own account.' },
  ]);
  assert.equal(db.user(su.user_id)!.role, 'SuperAdmin');
  assert.equal(db.user(su.user_id)!.is_active, true);
});

test('overwrite cannot remove the last active rbac.manage holder', async () => {
  const out = await executeBulkImport([row('superadmin', 'Viewer', { email: su.email })],
    { overwriteDuplicates: true }, actorOf(ua));
  assert.deepEqual(out.errors, [{ row: 1,
    error: 'This change would leave no active user with the rbac.manage permission. Give it to another active user first.' }]);
  assert.equal(db.user(su.user_id)!.role, 'SuperAdmin');
});

test('the import is audited once, naming the importer, with no passwords', async () => {
  await executeBulkImport([row('newview', 'Viewer'), row('viewer1', 'Engineer', { email: viewer.email })],
    { overwriteDuplicates: true }, actorOf(su));
  assert.equal(audit.length, 1);
  const [type, actor, entity, id, before, after] = audit[0] as any[];
  assert.deepEqual([type, actor, entity, id, before], ['USER_BULK_IMPORTED', actorOf(su), 'User', 'bulk-import', undefined]);
  assert.equal(after.created.length, 1);
  assert.deepEqual(after.created[0], { username: 'newview', role: 'Viewer', is_active: true });
  assert.deepEqual(after.updated[0], { username: 'viewer1', role: 'Engineer', is_active: true,
    before: { role: 'Viewer', is_active: true } });
  assert.doesNotMatch(JSON.stringify(audit), /Str0ng|password|hash/i);
});
