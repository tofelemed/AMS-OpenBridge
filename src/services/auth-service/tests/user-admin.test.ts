/**
 * CHG-171 — user administration refusals (fixes 1, 2), deletion revocation (fix 4) and the
 * audit trail of user changes (fix 5), at the service and controller level.
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, FakeUser, seedStandardRoles } from './support/fake-db';
import { actorOf, captureAudit, fakeRes, refused, PASSWORD } from './support/helpers';
import { UserAdminService } from '../src/services/user-admin.service';
import { AuthController } from '../src/controllers/auth.controller';
import { revocationTombstones } from '../src/services/revocation-tombstones';

const OWN_ROLE = 'You cannot change your own role.';
const OWN_DEACTIVATE = 'You cannot deactivate your own account.';
const OWN_DELETE = 'You cannot delete your own account.';
const lastHolder = (k: string) =>
  `This change would leave no active user with the ${k} permission. Give it to another active user first.`;
const beyondOwn = (r: string) =>
  `Assigning the role '${r}' needs the rbac.manage permission, because the role has permissions you do not hold.`;

let db: FakeDb;
let svc: UserAdminService;
let audit: unknown[][];
let su: FakeUser; // the only SuperAdmin (rbac.manage + admin.users.edit)
let ua: FakeUser; // a user administrator: admin.users.edit, no rbac.manage
let viewer: FakeUser;

beforeEach(() => {
  db = seedStandardRoles(new FakeDb()).install();
  su = db.addUser({ username: 'superadmin', role: 'SuperAdmin' });
  ua = db.addUser({ username: 'useradmin', role: 'UserAdmin' });
  viewer = db.addUser({ username: 'viewer1', role: 'Viewer' });
  svc = new UserAdminService();
  audit = captureAudit();
  revocationTombstones.clear();
});
afterEach(() => mock.restoreAll());

// ── Fix 1: own account ───────────────────────────────────────────────────────
test('refuses changing your own role', async () => {
  db.addUser({ username: 'superadmin2', role: 'SuperAdmin' });
  await refused(svc.updateUser(su.user_id, { role: 'Viewer' }, actorOf(su)), 409, OWN_ROLE);
  assert.equal(db.user(su.user_id)!.role, 'SuperAdmin');
});

test('refuses deactivating your own account', async () => {
  db.addUser({ username: 'superadmin2', role: 'SuperAdmin' });
  await refused(svc.updateUser(su.user_id, { is_active: false }, actorOf(su)), 409, OWN_DEACTIVATE);
  assert.equal(db.user(su.user_id)!.is_active, true);
});

test('refuses deleting your own account', async () => {
  db.addUser({ username: 'superadmin2', role: 'SuperAdmin' });
  await refused(svc.deleteUser(su.user_id, actorOf(su)), 409, OWN_DELETE);
  assert.ok(db.user(su.user_id));
});

test('saving your own record with role and active unchanged is allowed', async () => {
  const out = await svc.updateUser(su.user_id,
    { email: 'root@example.test', role: 'SuperAdmin', is_active: true }, actorOf(su));
  assert.equal(out.email, 'root@example.test');
});

// ── Fix 1: last administrator ────────────────────────────────────────────────
test('refuses demoting the last active rbac.manage holder', async () => {
  await refused(svc.updateUser(su.user_id, { role: 'Viewer' }, actorOf(ua)), 409, lastHolder('rbac.manage'));
  assert.equal(db.user(su.user_id)!.role, 'SuperAdmin');
});

test('refuses deactivating the last active rbac.manage holder', async () => {
  await refused(svc.updateUser(su.user_id, { is_active: false }, actorOf(ua)), 409, lastHolder('rbac.manage'));
  assert.equal(db.user(su.user_id)!.is_active, true);
});

test('refuses deleting the last active rbac.manage holder', async () => {
  await refused(svc.deleteUser(su.user_id, actorOf(ua)), 409, lastHolder('rbac.manage'));
  assert.ok(db.user(su.user_id));
});

test('refuses removing the last active admin.users.edit holder', async () => {
  db.addRole('RoleAdmin', ['rbac.manage'], false);
  const ra = db.addUser({ username: 'roleadmin', role: 'RoleAdmin' });
  db.user(su.user_id)!.is_active = false; // ua is now the only active admin.users.edit holder
  await refused(svc.updateUser(ua.user_id, { is_active: false }, actorOf(ra)), 409, lastHolder('admin.users.edit'));
});

test('an inactive holder does not count as the remaining administrator', async () => {
  db.addUser({ username: 'dormant', role: 'SuperAdmin', is_active: false });
  await refused(svc.deleteUser(su.user_id, actorOf(ua)), 409, lastHolder('rbac.manage'));
});

test('demoting an administrator is allowed while another active one remains, and ends their sessions', async () => {
  const su2 = db.addUser({ username: 'superadmin2', role: 'SuperAdmin' });
  const before = db.user(su2.user_id)!.credentials_changed_at;
  await svc.updateUser(su2.user_id, { role: 'Viewer' }, actorOf(su));
  assert.equal(db.user(su2.user_id)!.role, 'Viewer');
  assert.ok(db.user(su2.user_id)!.credentials_changed_at > before);
});

// ── Fix 2: role-assignment escalation ────────────────────────────────────────
test('a user administrator without rbac.manage cannot create a SuperAdmin', async () => {
  await refused(svc.createUser({ username: 'mallory', email: 'm@example.test', password: PASSWORD, role: 'SuperAdmin' },
    actorOf(ua)), 403, beyondOwn('SuperAdmin'));
  assert.equal(db.state.users.some((u) => u.username === 'mallory'), false);
});

test('a user administrator without rbac.manage cannot raise anyone to SuperAdmin', async () => {
  await refused(svc.updateUser(ua.user_id, { role: 'SuperAdmin' }, actorOf(ua)), 409, OWN_ROLE);
  await refused(svc.updateUser(viewer.user_id, { role: 'SuperAdmin' }, actorOf(ua)), 403, beyondOwn('SuperAdmin'));
  assert.equal(db.user(viewer.user_id)!.role, 'Viewer');
});

test('a user administrator may assign roles within their own rights', async () => {
  const created = await svc.createUser({ username: 'newview', email: 'n@example.test', password: PASSWORD, role: 'Viewer' },
    actorOf(ua));
  assert.equal(created.role, 'Viewer');
  await svc.updateUser(viewer.user_id, { role: 'UserAdmin' }, actorOf(ua));
  assert.equal(db.user(viewer.user_id)!.role, 'UserAdmin');
});

test('an rbac.manage holder may assign any role', async () => {
  const created = await svc.createUser({ username: 'second', email: 's@example.test', password: PASSWORD, role: 'SuperAdmin' },
    actorOf(su));
  assert.equal(created.role, 'SuperAdmin');
});

test('an unchanged role is not an assignment', async () => {
  const su2 = db.addUser({ username: 'superadmin2', role: 'SuperAdmin' });
  const out = await svc.updateUser(su2.user_id, { email: 'x@example.test', role: 'SuperAdmin' }, actorOf(ua));
  assert.equal(out.email, 'x@example.test');
});

// ── Fix 4: a deleted user's session ends at once ─────────────────────────────
test('deleting a user puts them on the revocation tombstone list at once', async () => {
  await svc.deleteUser(viewer.user_id, actorOf(su));
  assert.equal(db.user(viewer.user_id), undefined);
  assert.ok(revocationTombstones.live().some((t) => t.user_id === viewer.user_id));
});

// ── Fix 5: audit trail ───────────────────────────────────────────────────────
test('create is audited with the actor name and id, never the password', async () => {
  const created = await svc.createUser({ username: 'newview', email: 'n@example.test', password: PASSWORD, role: 'Viewer' },
    actorOf(su));
  assert.equal(audit.length, 1);
  const [type, actor, entity, id, before, after] = audit[0] as any[];
  assert.deepEqual([type, actor, entity, id, before], ['USER_CREATED', actorOf(su), 'User', created.user_id, undefined]);
  assert.deepEqual(after, { username: 'newview', email: 'n@example.test', full_name: null, role: 'Viewer', is_active: true });
  assert.doesNotMatch(JSON.stringify(audit), /Str0ng|password|hash/i);
});

test('update is audited with what changed', async () => {
  await svc.updateUser(viewer.user_id, { role: 'Engineer', email: 'v@example.test', is_active: true }, actorOf(su));
  const [type, actor, entity, id, before, after] = audit[0] as any[];
  assert.deepEqual([type, actor, entity, id], ['USER_UPDATED', actorOf(su), 'User', viewer.user_id]);
  assert.deepEqual(before, { username: 'viewer1', email: 'viewer1@example.test', role: 'Viewer' });
  assert.deepEqual(after, { username: 'viewer1', email: 'v@example.test', role: 'Engineer' });
});

test('delete is audited', async () => {
  await svc.deleteUser(viewer.user_id, actorOf(su));
  const [type, actor, entity, id, before] = audit[0] as any[];
  assert.deepEqual([type, actor, entity, id], ['USER_DELETED', actorOf(su), 'User', viewer.user_id]);
  assert.deepEqual(before, { username: 'viewer1', email: 'viewer1@example.test', role: 'Viewer', is_active: true });
});

test('a refused change writes nothing and is not audited', async () => {
  const snapshot = JSON.stringify(db.state.users);
  await assert.rejects(svc.updateUser(su.user_id, { role: 'Viewer' }, actorOf(ua)));
  await assert.rejects(svc.deleteUser(su.user_id, actorOf(su)));
  assert.equal(JSON.stringify(db.state.users), snapshot);
  assert.equal(audit.length, 0);
});

// ── Wiring: the controller passes the signed-in user as the actor ────────────
test('the controller refuses deleting your own account with the message for the UI', async () => {
  const req: any = { params: { id: su.user_id }, user: { sub: su.user_id, user_id: su.user_id,
    preferred_username: su.username, username: su.username, permission: [] } };
  const res = fakeRes();
  await new AuthController().deleteUser(req, res as any);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { success: false, error: OWN_DELETE });
});
