/**
 * CHG-171 — role changes cannot remove the last administrator (fix 1), Reset restores the
 * seeded defaults (fix 3), and role events name the actor by user name and id (fix 5).
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, FakeUser, seedStandardRoles } from './support/fake-db';
import { captureAudit, fakeRes, refused } from './support/helpers';
import { PermissionService } from '../src/services/permission.service';
import { PermissionController } from '../src/controllers/permission.controller';
import { PERMISSION_CATALOG, defaultPermissionsForRole } from '../src/rbac/permission-catalog';

const lastHolder = (k: string) =>
  `This change would leave no active user with the ${k} permission. Give it to another active user first.`;

let db: FakeDb;
let svc: PermissionService;
let su: FakeUser;

beforeEach(() => {
  db = seedStandardRoles(new FakeDb()).install();
  PERMISSION_CATALOG.forEach((p) => db.state.permissions.add(p.key));
  su = db.addUser({ username: 'superadmin', role: 'SuperAdmin' });
  svc = new PermissionService();
});
afterEach(() => mock.restoreAll());

const without = (role: string, key: string) => db.keysOf(role).filter((k) => k !== key);

test('removing rbac.manage from the role of its last active holders is refused', async () => {
  const before = db.keysOf('SuperAdmin');
  await refused(svc.setRolePermissions('SuperAdmin', without('SuperAdmin', 'rbac.manage')), 409, lastHolder('rbac.manage'));
  assert.deepEqual(db.keysOf('SuperAdmin'), before);
});

test('removing admin.users.edit from the role of its last active holders is refused', async () => {
  await refused(svc.setRolePermissions('SuperAdmin', without('SuperAdmin', 'admin.users.edit')), 409,
    lastHolder('admin.users.edit'));
});

test('allowed while an active user of another role still holds the key', async () => {
  db.addRole('RoleAdmin', ['rbac.manage'], false);
  db.addUser({ username: 'roleadmin', role: 'RoleAdmin' });
  await svc.setRolePermissions('SuperAdmin', without('SuperAdmin', 'rbac.manage'));
  assert.ok(!db.keysOf('SuperAdmin').includes('rbac.manage'));
});

test('allowed when the role has no active user', async () => {
  db.addRole('Spare', ['rbac.manage', 'alarm.view'], false);
  db.addUser({ username: 'gone', role: 'Spare', is_active: false });
  await svc.setRolePermissions('Spare', ['alarm.view']);
  assert.deepEqual(db.keysOf('Spare'), ['alarm.view']);
});

test('deleting a role whose users are the last holders, moving them to a role without the key, is refused', async () => {
  db.addRole('RoleAdmin', ['rbac.manage', 'admin.users.edit'], false);
  db.addUser({ username: 'roleadmin', role: 'RoleAdmin' });
  db.user(su.user_id)!.is_active = false;
  await refused(svc.deleteRole('RoleAdmin', 'Viewer'), 409, lastHolder('rbac.manage'));
  assert.ok(db.state.roles.has('RoleAdmin'));
});

test('Reset of Engineer restores the seeded defaults, cpm.analysis.create and cpm.context.manage included', async () => {
  db.state.rolePerms.set('Engineer', new Set(['cpm.manage']));
  const out = await svc.resetRolePermissions('Engineer');
  assert.deepEqual([...out].sort(), defaultPermissionsForRole('Engineer').sort());
  assert.ok(db.keysOf('Engineer').includes('cpm.analysis.create'));
  assert.ok(db.keysOf('Engineer').includes('cpm.context.manage'));
});

test('Reset of SuperAdmin keeps gate configuration (cpm.config.*)', async () => {
  const out = await svc.resetRolePermissions('SuperAdmin');
  assert.ok(out.includes('cpm.config.activate'));
  assert.ok(out.includes('rbac.manage'));
});

test('role events name the actor by user name and id', async () => {
  const audit = captureAudit();
  const req: any = {
    params: { role: 'Engineer' },
    body: { permissions: ['alarm.view'] },
    user: { sub: su.user_id, user_id: su.user_id, preferred_username: su.username, username: su.username, permission: [] },
  };
  const res = fakeRes();
  await new PermissionController().setRolePermissions(req, res as any);
  assert.equal(res.statusCode, 200);
  const [type, actor, entity, id] = audit[0] as any[];
  assert.deepEqual([type, actor, entity, id],
    ['RBAC_ROLE_PERMISSIONS_CHANGED', { user_id: su.user_id, username: 'superadmin' }, 'RolePermissions', 'Engineer']);
});

test('a refused role change answers 409 with the message', async () => {
  const req: any = {
    params: { role: 'SuperAdmin' },
    body: { permissions: without('SuperAdmin', 'rbac.manage') },
    user: { sub: su.user_id, user_id: su.user_id, preferred_username: su.username, username: su.username, permission: [] },
  };
  const res = fakeRes();
  await new PermissionController().setRolePermissions(req, res as any);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { success: false, error: lastHolder('rbac.manage') });
});
