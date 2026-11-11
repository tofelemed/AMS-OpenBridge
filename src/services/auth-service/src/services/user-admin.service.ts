/**
 * User administration writes: create, update, delete (moved from auth.service.ts in CHG-171;
 * same SQL, same success responses). CHG-171 adds, server-side:
 *   - the access-control rules of access-guard.ts (own account, last administrator, role escalation);
 *   - an audit record for every user change, naming the actor by user name and id;
 *   - immediate revocation on delete (the user stays on the gateway's revocation feed).
 */
import bcrypt from 'bcrypt';
import pool from '../config/database';
import logger from '../config/logger';
import { Actor, CreateUserRequest, UpdateUserRequest, UserPublic } from '../types';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { auditEmitter } from './audit-emitter';
import {
  GuardUser,
  assertCanAssignRole,
  assertOwnAccountChange,
  assertUserKeepsHolders,
  loadUser,
  withAccessLock,
} from './access-guard';
import { revokeUserTokens } from './token-revocation';
import { revocationTombstones } from './revocation-tombstones';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

/** The user fields an audit record may show. Never passwords or hashes. */
const AUDITED_FIELDS = ['email', 'full_name', 'role', 'is_active'] as const;

/** is_active as the database will read it ("false" and "0" pass validation as strings). */
export function asBoolean(v: unknown): boolean {
  if (typeof v === 'string') return !['false', '0', 'no', ''].includes(v.trim().toLowerCase());
  return Boolean(v);
}

/** Before/after of the audited fields that changed, each with the user name. */
function auditDiff(before: GuardUser, after: UserPublic): [Record<string, unknown>, Record<string, unknown>] {
  const b: Record<string, unknown> = { username: before.username };
  const a: Record<string, unknown> = { username: before.username };
  for (const f of AUDITED_FIELDS) {
    const was = before[f] ?? null;
    const now = after[f] ?? null;
    if (was !== now) {
      b[f] = was;
      a[f] = now;
    }
  }
  return [b, a];
}

export class UserAdminService {
  /** Create a user. Refused (403) if the role has permissions the actor lacks and the actor lacks rbac.manage. */
  async createUser(userData: CreateUserRequest, actor: Actor): Promise<UserPublic> {
    const { username, email, password, full_name } = userData;
    const role = userData.role || 'Viewer';
    await assertCanAssignRole(pool, actor, role);

    const usernameCheck = await pool.query('SELECT user_id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      throw new ConflictError('Username already exists');
    }

    const emailCheck = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      throw new ConflictError('Email already exists');
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, username, email, full_name, role, is_active, created_at`,
      [username, email, password_hash, full_name || null, role]
    );

    const user = result.rows[0];
    logger.info(`User created: ${username}`);
    auditEmitter.emit('USER_CREATED', actor, 'User', user.user_id, undefined, {
      username: user.username,
      email: user.email,
      full_name: user.full_name ?? null,
      role: user.role,
      is_active: user.is_active,
    });

    return {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    };
  }

  /**
   * Update a user. Refused: your own role or deactivating yourself (409), a change leaving no
   * active rbac.manage / admin.users.edit holder (409), a role beyond your rights without rbac.manage (403).
   */
  async updateUser(userId: string, updateData: UpdateUserRequest, actor: Actor): Promise<UserPublic> {
    const active = updateData.is_active === undefined ? undefined : asBoolean(updateData.is_active);
    const sent = [updateData.email, updateData.full_name, updateData.role, active];
    if (sent.every((v) => v === undefined)) {
      throw new ValidationError('No fields to update');
    }

    const { user, before } = await withAccessLock(async (db) => {
      const target = await loadUser(db, userId);
      if (!target) throw new NotFoundError('User');

      assertOwnAccountChange(actor, target, { role: updateData.role, is_active: active });
      const roleChanges = updateData.role !== undefined && updateData.role !== target.role;
      if (roleChanges) await assertCanAssignRole(db, actor, updateData.role!);
      if (roleChanges || (active === false && target.is_active)) {
        await assertUserKeepsHolders(db, target, {
          role: updateData.role ?? target.role,
          is_active: active ?? target.is_active,
        });
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (updateData.email !== undefined) {
        const emailCheck = await db.query(
          'SELECT user_id FROM users WHERE email = $1 AND user_id != $2',
          [updateData.email, userId]
        );
        if (emailCheck.rows.length > 0) {
          throw new ConflictError('Email already exists');
        }
        updates.push(`email = $${paramCount++}`);
        values.push(updateData.email);
      }
      if (updateData.full_name !== undefined) {
        updates.push(`full_name = $${paramCount++}`);
        values.push(updateData.full_name || null);
      }
      if (updateData.role !== undefined) {
        updates.push(`role = $${paramCount++}`);
        values.push(updateData.role);
      }
      if (active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(active);
      }
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(userId);

      const result = await db.query(
        `UPDATE users SET ${updates.join(', ')}
         WHERE user_id = $${paramCount}
         RETURNING user_id, username, email, full_name, role, is_active, created_at`,
        values
      );
      if (result.rows.length === 0) throw new NotFoundError('User');

      // Phase 3: a role change or deactivation must take effect promptly, so revoke this user's
      // live tokens (their next request re-mints with the new role/perms or is rejected).
      if (updateData.role !== undefined || active !== undefined) {
        await revokeUserTokens(db, userId);
      }
      return { user: result.rows[0] as unknown as UserPublic, before: target };
    });

    logger.info(`User updated: ${userId}`);
    const [b, a] = auditDiff(before, user);
    auditEmitter.emit('USER_UPDATED', actor, 'User', userId, b, a);
    return user;
  }

  /**
   * Delete a user. Refused: your own account (409), or the last active rbac.manage /
   * admin.users.edit holder (409). The user's session ends at once (revocation feed tombstone).
   */
  async deleteUser(userId: string, actor: Actor): Promise<void> {
    const target = await withAccessLock(async (db) => {
      const t = await loadUser(db, userId);
      if (!t) throw new NotFoundError('User');
      assertOwnAccountChange(actor, t, { deleting: true });
      await assertUserKeepsHolders(db, t, { role: t.role, is_active: false });
      // Refresh tokens go with the row (ON DELETE CASCADE): no new access token can be minted.
      await db.query('DELETE FROM users WHERE user_id = $1', [userId]);
      return t;
    });

    // The row is gone, so the gateway's revocation feed lists the user from a tombstone, as
    // inactive, until the last access token they could hold has expired.
    revocationTombstones.record(userId);
    logger.info(`User deleted: ${userId}`);
    auditEmitter.emit('USER_DELETED', actor, 'User', userId, {
      username: target.username,
      email: target.email,
      role: target.role,
      is_active: target.is_active,
    }, undefined);
  }
}
