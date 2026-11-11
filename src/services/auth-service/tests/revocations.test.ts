/**
 * CHG-171 fix 4 — a deleted user's session ends at once.
 *
 * The gateway (src/services/gateway/Auth/RevocationCache.cs) polls GET /internal/revocations
 * every 5 s, rebuilds its snapshot from each answer, and rejects a token whose subject is listed
 * with is_active = false. A deleted user has no row, so the feed must keep listing them, as
 * inactive, until every token they could still hold has expired.
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, FakeUser, seedStandardRoles } from './support/fake-db';
import { actorOf, captureAudit, fakeRes } from './support/helpers';
import { UserAdminService } from '../src/services/user-admin.service';
import { RevocationTombstones, revocationTombstones } from '../src/services/revocation-tombstones';
import { revocationsHandler } from '../src/routes/revocations.route';

const KEY = 'unit-test-service-key';
let db: FakeDb;
let su: FakeUser;
let viewer: FakeUser;

beforeEach(() => {
  process.env.TRAVERSE_SERVICE_KEY = KEY;
  db = seedStandardRoles(new FakeDb()).install();
  su = db.addUser({ username: 'superadmin', role: 'SuperAdmin' });
  viewer = db.addUser({ username: 'viewer1', role: 'Viewer' });
  captureAudit();
  revocationTombstones.clear();
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.TRAVERSE_SERVICE_KEY;
});

async function poll(sinceEpoch = Math.floor(Date.now() / 1000) - 1800) {
  const req: any = { header: (h: string) => (h === 'X-Service-Key' ? KEY : undefined), query: { sinceEpoch: String(sinceEpoch) } };
  const res = fakeRes();
  await revocationsHandler(req, res as any);
  assert.equal(res.statusCode, 200);
  return res.body.data as { user_id: string; changed: number; is_active: boolean }[];
}

test('a deleted user is on the next feed answer as inactive', async () => {
  assert.equal((await poll()).some((e) => e.user_id === viewer.user_id), false, 'not listed before');
  await new UserAdminService().deleteUser(viewer.user_id, actorOf(su));
  const entry = (await poll()).find((e) => e.user_id === viewer.user_id);
  assert.ok(entry, 'listed after deletion');
  assert.equal(entry!.is_active, false);
  assert.ok(entry!.changed > 0);
});

test('the deleted user stays listed whatever window the gateway asks for', async () => {
  await new UserAdminService().deleteUser(viewer.user_id, actorOf(su));
  const far = Math.floor(Date.now() / 1000) + 3600;
  assert.ok((await poll(far)).some((e) => e.user_id === viewer.user_id && !e.is_active));
});

test('existing revoked and inactive users are still listed (unchanged behaviour)', async () => {
  db.user(viewer.user_id)!.is_active = false;
  const data = await poll(db.now + 10);
  assert.deepEqual(data.map((e) => [e.user_id, e.is_active]), [[viewer.user_id, false]]);
});

test('a tombstone lasts the access-token lifetime plus a margin, then drops off', () => {
  const t = new RevocationTombstones(60_000);
  t.record('u-1', 1_000_000);
  assert.deepEqual(t.live(1_000_000 + 59_000).map((e) => e.user_id), ['u-1']);
  assert.deepEqual(t.live(1_000_000 + 61_000), []);
});

test('the default lifetime covers a 1 h access token', () => {
  assert.ok(revocationTombstones.retentionMs >= 60 * 60 * 1000);
});

test('the feed still refuses a wrong service key', async () => {
  const req: any = { header: () => 'wrong', query: {} };
  const res = fakeRes();
  await revocationsHandler(req, res as any);
  assert.equal(res.statusCode, 403);
});
