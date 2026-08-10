/**
 * Authentication Service
 * Handles login, RS256 token generation/verification, and user management.
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
import {
  User,
  UserPublic,
  LoginRequest,
  AuthTokens,
  RefreshResult,
  TokenPayload,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
} from '../types';
import {
  AuthenticationError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'traverse-auth';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ams-services';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

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
    await pool.query('UPDATE users SET credentials_changed_at = NOW() WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }

  /** Persist a refresh token, deriving its expiry from the signed `exp` claim. */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
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

    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    );
    if (tokenResult.rows.length === 0) {
      throw new AuthenticationError('Refresh token not found or expired');
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

    await pool.query(
      'UPDATE refresh_tokens SET token = $1, expires_at = $2 WHERE token = $3',
      [newRefreshToken, expiresAt, refreshToken]
    );

    logger.info(`Token refreshed for user: ${user.username}`);

    return { token: newToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout user (invalidate refresh token).
   */
  async logout(refreshToken: string): Promise<void> {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    logger.info('User logged out');
  }

  /**
   * Create new user
   */
  async createUser(userData: CreateUserRequest): Promise<UserPublic> {
    const { username, email, password, full_name, role } = userData;

    const usernameCheck = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );
    if (usernameCheck.rows.length > 0) {
      throw new ConflictError('Username already exists');
    }

    const emailCheck = await pool.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email]
    );
    if (emailCheck.rows.length > 0) {
      throw new ConflictError('Email already exists');
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, username, email, full_name, role, is_active, created_at`,
      [username, email, password_hash, full_name || null, role || 'Viewer']
    );

    const user = result.rows[0];
    logger.info(`User created: ${username}`);

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
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserPublic> {
    const result = await pool.query(
      'SELECT user_id, username, email, full_name, role, is_active, created_at FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return result.rows[0];
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    updateData: UpdateUserRequest
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

    if (updateData.role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(updateData.role);
    }

    if (updateData.is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(updateData.is_active);
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

    // Phase 3: a role change or deactivation must take effect promptly, so revoke
    // this user's live tokens (their next request re-mints with the new role/perms
    // or is rejected if deactivated).
    if (updateData.role !== undefined || updateData.is_active !== undefined) {
      await this.revokeUserTokens(userId);
    }

    logger.info(`User updated: ${userId}`);
    return result.rows[0];
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

  /**
   * Get all users (with pagination)
   */
  async getAllUsers(
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ users: UserPublic[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [usersResult, countResult] = await Promise.all([
      pool.query(
        `SELECT user_id, username, email, full_name, role, is_active, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*) as total FROM users'),
    ]);

    return {
      users: usersResult.rows,
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * Delete user by ID
   */
  async deleteUser(userId: string): Promise<void> {
    const userCheck = await pool.query(
      'SELECT user_id FROM users WHERE user_id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    logger.info(`User deleted: ${userId}`);
  }

  /**
   * Get users page with stats (batch endpoint)
   * Combines users list, pagination, and statistics in one call
   * Supports filters: search (full_name, email), role, status
   */
  async getUsersPage(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      search?: string;
      role?: string;
      status?: string;
    }
  ): Promise<{
    users: UserPublic[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    stats: {
      total: number;
      active: number;
      inactive: number;
      byRole: Record<string, number>;
    };
    filterOptions: {
      roles: string[];
      statuses: Array<{ value: string; label: string }>;
    };
  }> {
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters?.search && filters.search.trim()) {
      whereClauses.push(
        `(LOWER(full_name) LIKE LOWER($${paramIndex}) OR LOWER(email) LIKE LOWER($${paramIndex}))`
      );
      queryParams.push(`%${filters.search.trim()}%`);
      paramIndex++;
    }

    if (filters?.role && filters.role !== 'all') {
      whereClauses.push(`role = $${paramIndex}`);
      queryParams.push(filters.role);
      paramIndex++;
    }

    if (filters?.status && filters.status !== 'all') {
      const isActive = filters.status === 'active';
      whereClauses.push(`is_active = $${paramIndex}`);
      queryParams.push(isActive);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const usersQuery = `
      SELECT user_id, username, email, full_name, role, is_active, created_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(pageSize, offset);

    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countParams = queryParams.slice(0, paramIndex - 1);

    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active,
        COUNT(*) FILTER (WHERE is_active = FALSE) as inactive
      FROM users
      ${whereClause}
    `;

    const roleStatsQuery = `
      SELECT role, COUNT(*) as role_count
      FROM users
      ${whereClause}
      GROUP BY role
    `;

    const allRolesQuery = `
      SELECT DISTINCT role
      FROM users
      ORDER BY role
    `;

    const [usersResult, countResult, statsResult, roleStatsResult, allRolesResult] = await Promise.all([
      pool.query(usersQuery, queryParams),
      pool.query(countQuery, countParams),
      pool.query(statsQuery, countParams),
      pool.query(roleStatsQuery, countParams),
      pool.query(allRolesQuery),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const statsRow = statsResult.rows[0];
    const byRole = roleStatsResult.rows.reduce(
      (acc, row) => {
        acc[row.role] = parseInt(row.role_count);
        return acc;
      },
      {} as Record<string, number>
    );

    const availableRoles = allRolesResult.rows.map((row) => row.role);

    return {
      users: usersResult.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        total: parseInt(statsRow.total),
        active: parseInt(statsRow.active),
        inactive: parseInt(statsRow.inactive),
        byRole,
      },
      filterOptions: {
        roles: availableRoles,
        statuses: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    };
  }
}
