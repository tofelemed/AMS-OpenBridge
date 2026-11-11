/**
 * User directory reads: one user, the plain list and the Users page batch (moved unchanged from
 * auth.service.ts in CHG-171 to keep each file under the 500-line limit).
 */

import pool from '../config/database';
import { UserPublic } from '../types';
import { NotFoundError } from '../utils/errors';

export class UserQueryService {
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
   * Get users page with stats (batch endpoint)
   * Combines users list, pagination, and statistics in one call
   * Supports filters: search (username, full_name, email; the user name since CHG-172), role, status
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
        `(LOWER(username) LIKE LOWER($${paramIndex}) OR LOWER(full_name) LIKE LOWER($${paramIndex}) OR LOWER(email) LIKE LOWER($${paramIndex}))`
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
