/**
 * CHG-171 fix 5 — audit events name the actor by user NAME and id.
 *
 * audit-service stores UserId (max 100 chars) and the Before/After JSON; it has no separate
 * name field. The platform's .NET emitters put the user name (preferred_username) in UserId,
 * so auth-service does the same and carries { user_id, username } inside AfterState.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditPayload } from '../src/services/audit-emitter';

const actor = { user_id: '6f1c0d3e-0000-4000-8000-000000000001', username: 'alice' };

test('UserId is the actor\'s user name and AfterState carries name and id', () => {
  const p = JSON.parse(buildAuditPayload('USER_CREATED', actor, 'User', 'u-2', undefined, { role: 'Viewer' }));
  assert.equal(p.EventType, 'USER_CREATED');
  assert.equal(p.UserId, 'alice');
  assert.equal(p.EntityType, 'User');
  assert.equal(p.EntityId, 'u-2');
  assert.deepEqual(p.AfterState, { role: 'Viewer', actor });
  assert.equal('BeforeState' in p, false);
});

test('an event without an after state still records the actor', () => {
  const p = JSON.parse(buildAuditPayload('USER_DELETED', actor, 'User', 'u-2', { username: 'bob' }, undefined));
  assert.deepEqual(p.BeforeState, { username: 'bob' });
  assert.deepEqual(p.AfterState, { actor });
});

test('no actor reads as system', () => {
  const p = JSON.parse(buildAuditPayload('X', undefined, 'Role', 'r'));
  assert.equal(p.UserId, 'system');
});

test('UserId never exceeds the audit store\'s 100 characters', () => {
  const p = JSON.parse(buildAuditPayload('X', { user_id: 'id', username: 'a'.repeat(150) }, 'Role', 'r'));
  assert.equal(p.UserId.length, 100);
});
