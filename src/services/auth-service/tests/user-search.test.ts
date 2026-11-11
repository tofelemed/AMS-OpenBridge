/**
 * CHG-172 (owner answer 3d) — the Users page search finds a user by their user name, as well as by
 * full name and email address, ignoring case; the counts follow the same match.
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, seedStandardRoles } from './support/fake-db';
import { UserQueryService } from '../src/services/user-query.service';

let db: FakeDb;
let svc: UserQueryService;

beforeEach(() => {
  db = seedStandardRoles(new FakeDb()).install();
  db.addUser({ username: 'platform_admin', role: 'SuperAdmin', full_name: 'Platform Administrator', email: 'platform.admin@example.test' });
  db.addUser({ username: 'k_operator', role: 'Viewer', full_name: null, email: 'operator.k@example.test' });
  db.addUser({ username: 'm_engineer', role: 'Engineer', full_name: 'M. Engineer', email: 'eng.m@example.test', is_active: false });
  svc = new UserQueryService();
});
afterEach(() => mock.restoreAll());

test('the search finds a user by their user name', async () => {
  const page = await svc.getUsersPage(1, 50, { search: 'k_operator' });
  assert.deepEqual(page.users.map((u) => u.username), ['k_operator']);
  assert.equal(page.pagination.total, 1);
  assert.deepEqual(page.stats, { total: 1, active: 1, inactive: 0, byRole: { Viewer: 1 } });
});

test('the user name match ignores case', async () => {
  const page = await svc.getUsersPage(1, 50, { search: 'K_OPERATOR' });
  assert.deepEqual(page.users.map((u) => u.username), ['k_operator']);
});

test('the search still finds full names and email addresses', async () => {
  const byName = await svc.getUsersPage(1, 50, { search: 'platform administrator' });
  assert.deepEqual(byName.users.map((u) => u.username), ['platform_admin']);
  const byEmail = await svc.getUsersPage(1, 50, { search: 'ENG.M@' });
  assert.deepEqual(byEmail.users.map((u) => u.username), ['m_engineer']);
});

test('the search combines with the role and status filters', async () => {
  const engineers = await svc.getUsersPage(1, 50, { search: 'engineer', role: 'Engineer', status: 'inactive' });
  assert.deepEqual(engineers.users.map((u) => u.username), ['m_engineer']);
  const none = await svc.getUsersPage(1, 50, { search: 'engineer', status: 'active' });
  assert.deepEqual(none.users, []);
  assert.equal(none.pagination.total, 0);
});

test('without a search every user is listed, newest first', async () => {
  const page = await svc.getUsersPage(1, 50, {});
  assert.deepEqual(page.users.map((u) => u.username), ['m_engineer', 'k_operator', 'platform_admin']);
  assert.deepEqual(page.filterOptions.roles, ['Engineer', 'SuperAdmin', 'Viewer']);
});
