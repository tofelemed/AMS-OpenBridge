/**
 * Authentication Service
 * Handles login, RS256 token generation/verification, and the self-service profile/password.
 * User administration lives in user-admin.service.ts (writes) and user-query.service.ts (reads).
 *
 * Tokens are signed with RS256 (private key in this service only). The access
 * token embeds the user's functional permissions (resolved from their role) as
 * the `permission[]` claim, so downstream services authorize locally against the
 * public key with no call back here.
 */

import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import pool from '../config/database';
import logger from '../config/logger';
import { keyConfig, publicKeyForKid } from '../config/keys';
import { PermissionService } from './permission.service';
import { revokeUserTokens } from './token-revocation';
import {
  User,
  UserPublic,
  LoginRequest,
  AuthTokens,
  RefreshResult,
  TokenPayload,
  UpdateProfileRequest,
  ChangePasswordRequest,
} from '../types';
import {
  AuthenticationError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import { parseDuration } from '../utils/duration';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'traverse-auth';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ams-services';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

// ── Dual-clock session policy ────────────────────────────────────────────────
// Sliding idle + absolute max, enforced ONLY here on /refresh against Postgres.
// "Idle" means time since the last successful refresh — ordinary API traffic
// does not move the server clock; the frontend supplies the "no API call" UX.
const SESSION_IDLE_TIMEOUT_MS = parseDuration(
  process.env.SESSION_IDLE_TIMEOUT || '30m',
  30 * 60 * 1000
);
const SESSION_ABSOLUTE_TIMEOUT_MS = parseDuration(
  process.env.SESSION_ABSOLUTE_TIMEOUT || '12h',
  12 * 60 * 60 * 1000
);

/**
 * Per-role idle override: SESSION_IDLE_TIMEOUT_<ROLE> (e.g. _OPERATOR=8h).
 * Decision (2026-08-12): operators watching the live alarm console generate no
 * REST traffic, so they get a longer idle window instead of counting SignalR
 * frames as activity. The absolute clock still bounds every role.
 */
function idleTimeoutMsForRole(role: string | undefined): number {
  if (!role) return SESSION_IDLE_TIMEOUT_MS;
  const override = process.env[`SESSION_IDLE_TIMEOUT_${role.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  if (override) return parseDuration(override, SESSION_IDLE_TIMEOUT_MS);
  if (role.toLowerCase() === 'operator') return parseDuration('8h', 8 * 60 * 60 * 1000);
  return SESSION_IDLE_TIMEOUT_MS;
}

/** The policy the frontend mirrors — returned on login/refresh so FE/BE never drift. */
export function sessionPolicyForRole(role: string | undefined): { idleMs: number; absoluteMs: number } {
  return { idleMs: idleTimeoutMsForRole(role), absoluteMs: SESSION_ABSOLUTE_TIMEOUT_MS };
}

const permissionService = new PermissionService();

/** Read the `kid` header of a JWT without verifying it, to pick the right validation key. */
function kidOf(token: string): string | undefined {
  const decoded = jwt.decode(token, { complete: true }) as { header?: { kid?: string } } | null;
  return decoded?.header?.kid;
}

export class AuthService {
  /**
   * Sign an RS256 access token carrying the standard claims (.NET reads
   * `sub`, `preferred_username`, `role`, `permission[]`) plus legacy fields.
   */
  private signAccessToken(user: User, permissions: string[]): string {
    const payload = {
      sub: user.user_id,
      user_id: user.user_id,
      preferred_username: user.username,
      username: user.username,
      email: user.email,
      role: user.role,
      permission: permissions,
    };

    return jwt.sign(payload, keyConfig.privateKey, {
      algorithm: keyConfig.algorithm,
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      keyid: keyConfig.kid,
      // jti gives per-token identity for future gateway-side blocklisting; the
      // per-user credentials_changed_at epoch (checked in verifyToken) is what
      // provides revocation today.
      jwtid: randomUUID(),
    } as SignOptions);
  }

  /** Sign an RS256 refresh token (distinguished by `type: 'refresh'`). */
  private signRefreshToken(user: User): string {
    return jwt.sign(
      {
        sub: user.user_id,
        user_id: user.user_id,
        username: user.username,
        type: 'refresh',
      },
      keyConfig.privateKey,
      {
        algorithm: keyConfig.algorithm,
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        issuer: JWT_ISSUER,
        keyid: keyConfig.kid,
        // Without a jti the payload is fully deterministic, so two logins in the
        // same second minted byte-identical refresh tokens and the second INSERT
        // INTO refresh_tokens hit the unique constraint -> intermittent login 500
        // (two operator stations logging in simultaneously). jti makes every
        // refresh token unique.
        jwtid: randomUUID(),
      } as SignOptions
    );
  }

  /**
   * Revoke all live access + refresh tokens for a user (Phase 3). Bumps the
   * credentials_changed_at epoch (invalidates outstanding access tokens on their
   * next verifyToken) and deletes stored refresh tokens (blocks silent re-mint).
   */
  async revokeUserTokens(userId: string): Promise<void> {
    await revokeUserTokens(pool, userId);
  }

  /**
   * Persist a refresh token, deriving its expiry from the signed `exp` claim.
   * Login starts BOTH session clocks: last_used_at (sliding idle — bumped on
   * every rotation) and session_started_at (absolute — never touched again).
   */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, last_used_at, session_started_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [userId, refreshToken, expiresAt]
    );
  }

  /**
   * Login user and generate an access token + refresh token.
   * The caller (controller) delivers the refresh token as an httpOnly cookie.
   */
  async login(credentials: LoginRequest): Promise<AuthTokens> {
    const { username, password } = credentials;

    const userCheckResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userCheckResult.rows.length === 0) {
      logger.warn(`Login attempt failed: User not found - ${username}`);
      throw new AuthenticationError('Invalid credentials');
    }

    const user: User = userCheckResult.rows[0];

    if (!user.is_active) {
      logger.warn(`Login attempt failed: Account deactivated - ${username}`);
      throw new AuthenticationError('ACCOUNT_DEACTIVATED');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      logger.warn(`Login attempt failed: Invalid password - ${username}`);
      throw new AuthenticationError('Invalid credentials');
    }

    const permissions = await permissionService.getPermissionKeysForRole(user.role);
    const token = this.signAccessToken(user, permissions);
    const refreshToken = this.signRefreshToken(user);
    await this.storeRefreshToken(user.user_id, refreshToken);

    logger.info(`User logged in successfully: ${username}`);

    return {
      token,
      refreshToken,
      permissions,
      sessionPolicy: sessionPolicyForRole(user.role),
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
      },
    };
  }

  /**
   * Verify an RS256 access token (algorithm/issuer/audience pinned).
   */
  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, publicKeyForKid(kidOf(token)), {
        algorithms: [keyConfig.algorithm],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      } as VerifyOptions) as TokenPayload & { iat?: number };

      // Revocation check (Phase 3): reject a signature-valid token if the user is
      // now inactive or their credentials/permissions changed after the token was
      // issued. This makes a role/permission change or a deactivation take effect
      // immediately for every path that validates through auth-service (its own
      // admin routes now, the API gateway in Plan 04) rather than waiting out the
      // access-token TTL.
      const uid = decoded.sub || (decoded as any).user_id;
      if (uid) {
        const r = await pool.query(
          'SELECT is_active, EXTRACT(EPOCH FROM credentials_changed_at)::bigint AS changed FROM users WHERE user_id = $1',
          [uid]
        );
        if (r.rows.length === 0 || r.rows[0].is_active === false) {
          throw new AuthenticationError('Account is inactive');
        }
        const changed = Number(r.rows[0].changed);
        if (decoded.iat && changed && decoded.iat < changed) {
          throw new AuthenticationError('Token revoked; please sign in again');
        }
      }
      return decoded;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw new AuthenticationError('Token verification failed');
    }
  }

  /**
   * Rotate a refresh token: verify signature + DB presence + user still active,
   * then issue a fresh token pair and replace the stored refresh token.
   */
  async refreshToken(refreshToken: string): Promise<RefreshResult> {
    let decoded: { user_id?: string; sub?: string; type?: string };
    try {
      decoded = jwt.verify(refreshToken, publicKeyForKid(kidOf(refreshToken)), {
        algorithms: [keyConfig.algorithm],
        issuer: JWT_ISSUER,
      } as VerifyOptions) as typeof decoded;
    } catch (error) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Ages are computed on the DB clock so node/postgres clock skew cannot
    // affect session policy. This /refresh check is the ONLY server-side
    // enforcement point of the idle/absolute session clocks.
    const tokenResult = await pool.query(
      `SELECT rt.*, u.role AS user_role,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(rt.last_used_at, rt.created_at))) * 1000       AS idle_ms,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(rt.session_started_at, rt.created_at))) * 1000 AS session_age_ms
       FROM refresh_tokens rt
       JOIN users u ON u.user_id = rt.user_id
       WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [refreshToken]
    );
    if (tokenResult.rows.length === 0) {
      throw new AuthenticationError('Refresh token not found or expired');
    }

    const row = tokenResult.rows[0];
    const idleMs = Number(row.idle_ms);
    const sessionAgeMs = Number(row.session_age_ms);

    if (sessionAgeMs > SESSION_ABSOLUTE_TIMEOUT_MS) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      logger.info(`Session max duration reached (age ${Math.round(sessionAgeMs / 1000)}s)`);
      throw new AuthenticationError('Maximum session duration reached', 'SESSION_MAX_DURATION');
    }
    if (idleMs > idleTimeoutMsForRole(row.user_role)) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      logger.info(`Session idle timeout (idle ${Math.round(idleMs / 1000)}s, role ${row.user_role})`);
      throw new AuthenticationError('Session expired due to inactivity', 'SESSION_IDLE_TIMEOUT');
    }

    const userId = decoded.user_id || decoded.sub;
    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new AuthenticationError('User not found or inactive');
    }

    const user: User = userResult.rows[0];
    const permissions = await permissionService.getPermissionKeysForRole(user.role);
    const newToken = this.signAccessToken(user, permissions);
    const newRefreshToken = this.signRefreshToken(user);

    const decodedNew = jwt.decode(newRefreshToken) as { exp?: number } | null;
    const expiresAt = decodedNew?.exp
      ? new Date(decodedNew.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Rotate: bump the sliding idle clock; session_started_at is deliberately untouched.
    await pool.query(
      'UPDATE refresh_tokens SET token = $1, expires_at = $2, last_used_at = NOW() WHERE token = $3',
      [newRefreshToken, expiresAt, refreshToken]
    );

    logger.info(`Token refreshed for user: ${user.username}`);

    return {
      token: newToken,
      refreshToken: newRefreshToken,
      sessionPolicy: sessionPolicyForRole(user.role),
    };
  }

  /**
   * Logout user (invalidate refresh token).
   */
  async logout(refreshToken: string): Promise<void> {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    logger.info('User logged out');
  }

  /**
   * Update user's own profile (self-service)
   */
  async updateProfile(
    userId: string,
    updateData: UpdateProfileRequest
  ): Promise<UserPublic> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updateData.email !== undefined) {
      const emailCheck = await pool.query(
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

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE user_id = $${paramCount}
       RETURNING user_id, username, email, full_name, role, is_active, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    logger.info(`Profile updated: ${userId}`);
    return result.rows[0];
  }

  /**
   * Change user's password (self-service)
   */
  async changePassword(
    userId: string,
    passwordData: ChangePasswordRequest
  ): Promise<void> {
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user: User = userResult.rows[0];

    const isValidPassword = await bcrypt.compare(
      passwordData.current_password,
      user.password_hash
    );
    if (!isValidPassword) {
      throw new AuthenticationError('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(
      passwordData.new_password,
      BCRYPT_ROUNDS
    );

    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [newPasswordHash, userId]
    );

    // Phase 3: a password change invalidates all existing sessions.
    await this.revokeUserTokens(userId);

    logger.info(`Password changed for user: ${userId}`);
  }
}
