import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { auditEmitter } from '../../src/services/audit-emitter';
import type { FakeUser } from './fake-db';

export const actorOf = (u: FakeUser) => ({ user_id: u.user_id, username: u.username });

/** Capture every audit emit (the real emitter is disabled in tests: no Kafka). */
export function captureAudit(): unknown[][] {
  const calls: unknown[][] = [];
  mock.method(auditEmitter, 'emit', (...args: unknown[]) => { calls.push(args); });
  return calls;
}

/** Assert a promise rejects with this HTTP status and message. */
export async function refused(p: Promise<unknown>, status: number, message: string): Promise<void> {
  await assert.rejects(p, (e: any) => {
    assert.equal(e.message, message);
    assert.equal(e.statusCode, status);
    return true;
  });
}

/** Minimal Express response double. */
export function fakeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res as { statusCode: number; body: any; status: (c: number) => any; json: (b: unknown) => any };
}

export const PASSWORD = 'Str0ngPassw0rd';
