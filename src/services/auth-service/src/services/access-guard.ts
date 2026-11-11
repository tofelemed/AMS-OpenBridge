/**
 * CHG-171 — server-side access-control rules for user and role changes (Administration audit,
 * approved 11 Nov 2026). Before this the only guard was a client-side toast.
 *
 *  1. Own account: nobody changes their own role, or deactivates or deletes their own account.
 *  2. Last administrator: no change may leave NO active user holding rbac.manage, or none holding
 *     admin.users.edit (role reassignment, deactivation, deletion, a role losing the key, a role
 *     deleted with its users moved). A change that does not take the key from anyone is never
 *     refused, so an already-broken state can still be repaired.
 *  3. Escalation: assigning a role whose permissions are not all the actor's own needs rbac.manage.
 *
 * The checked changes run in a transaction holding one advisory lock, so two administrators
 * removing each other at the same moment cannot both pass the count.
 */
import pool from '../config/database';
import { Actor } from '../types';
import { AuthorizationError, ConflictError } from '../utils/errors';

/** A pool or a transaction client. */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export interface GuardUser {
  user_id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

/** The permissions without which nobody could administer users or roles any more. */
export const CRITICAL_KEYS = ['rbac.manage', 'admin.users.edit'] as const;

/** Refusal messages, shown verbatim by the Administration page. */
export const REFUSAL = {
  ownRole: 'You cannot change your own role.',
  ownDeactivate: 'You cannot deactivate your own account.',
  ownDelete: 'You cannot delete your own account.',
  lastHolder: (key: string) =>
    `This change would leave no active user with the ${key} permission. Give it to another active user first.`,
  beyondOwn: (role: string) =>
    `Assigning the role '${role}' needs the rbac.manage permission, because the role has permissions you do not hold.`,
};

/** Any constant: the transaction-scoped advisory lock that serialises access-control changes. */
const ACCESS_LOCK_SQL = 'SELECT pg_advisory_xact_lock(717101)';
const USER_SQL = 'SELECT user_id, username, email, full_name, role, is_active FROM users WHERE user_id = $1';
const ROLE_KEYS_SQL = 'SELECT permission_key FROM role_permissions WHERE role_name = $1 ORDER BY permission_key';
const ACTOR_KEYS_SQL = `SELECT rp.permission_key FROM users u JOIN role_permissions rp ON rp.role_name = u.role
  WHERE u.user_id = $1 AND u.is_active = TRUE`;
const HOLDERS_EXCEPT_USER_SQL = `SELECT COUNT(*)::int AS n FROM users u JOIN role_permissions rp ON rp.role_name = u.role
  WHERE rp.permission_key = $1 AND u.is_active = TRUE AND u.user_id <> $2`;
const HOLDERS_OUTSIDE_ROLE_SQL = `SELECT COUNT(*)::int AS n FROM users u JOIN role_permissions rp ON rp.role_name = u.role
  WHERE rp.permission_key = $1 AND u.is_active = TRUE AND u.role <> $2`;
const ACTIVE_IN_ROLE_SQL = 'SELECT COUNT(*)::int AS n FROM users WHERE role = $1 AND is_active = TRUE';

/** Take the access-control lock inside an already-open transaction. */
export async function lockAccessChanges(db: Db): Promise<void> {
  await db.query(ACCESS_LOCK_SQL);
}

/** Run `work` in one transaction holding the access-control lock. */
export async function withAccessLock<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockAccessChanges(client);
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function loadUser(db: Db, userId: string): Promise<GuardUser | null> {
  const r = await db.query(USER_SQL, [userId]);
  return (r.rows[0] as unknown as GuardUser | undefined) ?? null;
}

export async function roleKeys(db: Db, role: string): Promise<string[]> {
  const r = await db.query(ROLE_KEYS_SQL, [role]);
  return r.rows.map((x) => String(x.permission_key));
}

const count = (r: { rows: Record<string, unknown>[] }): number => Number(r.rows[0]?.n ?? 0);

/** Rule 1. `change.role` / `change.is_active` are the requested values (undefined = not sent). */
export function assertOwnAccountChange(
  actor: Actor,
  target: GuardUser,
  change: { role?: string; is_active?: boolean; deleting?: boolean }
): void {
  if (target.user_id !== actor.user_id) return;
  if (change.deleting) throw new ConflictError(REFUSAL.ownDelete);
  if (change.role !== undefined && change.role !== target.role) throw new ConflictError(REFUSAL.ownRole);
  if (change.is_active === false && target.is_active) throw new ConflictError(REFUSAL.ownDeactivate);
}

/**
 * Rule 3. Returns a checker for one actor; it reads the actor's own permissions once and each
 * role's permissions once (bulk import calls it for every row).
 */
export function roleAssignmentChecker(db: Db, actor: Actor): (role: string) => Promise<void> {
  let own: Promise<Set<string>> | undefined;
  const roles = new Map<string, Promise<string[]>>();
  return async (role: string) => {
    own ??= actor.user_id
      ? db.query(ACTOR_KEYS_SQL, [actor.user_id]).then((r) => new Set(r.rows.map((x) => x.permission_key as string)))
      : Promise.resolve(new Set<string>());
    const mine = await own;
    if (mine.has('rbac.manage')) return;
    if (!roles.has(role)) roles.set(role, roleKeys(db, role));
    const beyond = (await roles.get(role)!).filter((k) => !mine.has(k));
    if (beyond.length > 0) throw new AuthorizationError(REFUSAL.beyondOwn(role));
  };
}

export async function assertCanAssignRole(db: Db, actor: Actor, role: string): Promise<void> {
  await roleAssignmentChecker(db, actor)(role);
}

/** Rule 2 for one user changing role and/or active flag (deletion = inactive). */
export async function assertUserKeepsHolders(
  db: Db,
  target: GuardUser,
  next: { role: string; is_active: boolean }
): Promise<void> {
  if (!target.is_active) return; // an inactive user holds nothing today
  const now = await roleKeys(db, target.role);
  const after = !next.is_active ? [] : next.role === target.role ? now : await roleKeys(db, next.role);
  for (const key of CRITICAL_KEYS) {
    if (!now.includes(key) || after.includes(key)) continue;
    if (count(await db.query(HOLDERS_EXCEPT_USER_SQL, [key, target.user_id])) === 0) {
      throw new ConflictError(REFUSAL.lastHolder(key));
    }
  }
}

/** Rule 2 for a role whose permission set becomes `nextKeys` (or whose users move to such a role). */
export async function assertRoleKeepsHolders(db: Db, role: string, nextKeys: string[]): Promise<void> {
  const now = await roleKeys(db, role);
  const losing = CRITICAL_KEYS.filter((k) => now.includes(k) && !nextKeys.includes(k));
  if (losing.length === 0) return;
  if (count(await db.query(ACTIVE_IN_ROLE_SQL, [role])) === 0) return; // nobody holds it through this role
  for (const key of losing) {
    if (count(await db.query(HOLDERS_OUTSIDE_ROLE_SQL, [key, role])) === 0) {
      throw new ConflictError(REFUSAL.lastHolder(key));
    }
  }
}
