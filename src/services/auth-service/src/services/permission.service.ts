/**
 * RBAC Service
 * Owns the functional permission catalog and the role -> permission mapping.
 * This is the single source of truth for authorization; the permissions a user
 * inherits from their role are embedded into the JWT at login/refresh.
 */

import pool from '../config/database';
import logger from '../config/logger';
import { Permission, Role } from '../types';
import { NotFoundError, ValidationError } from '../utils/errors';

export class PermissionService {
  /**
   * Resolve the set of functional permission keys granted to a role.
   * Used when minting tokens (embedded as the `permission[]` claim).
   */
  async getPermissionKeysForRole(role: string): Promise<string[]> {
    const result = await pool.query(
      'SELECT permission_key FROM role_permissions WHERE role_name = $1 ORDER BY permission_key',
      [role]
    );
    return result.rows.map((r: { permission_key: string }) => r.permission_key);
  }

  /** List all roles. */
  async getRoles(): Promise<Role[]> {
    const result = await pool.query(
      'SELECT role_name, description, is_system_role, created_at FROM roles ORDER BY role_name'
    );
    return result.rows;
  }

  /** List the full functional permission catalog. */
  async getPermissionCatalog(): Promise<Permission[]> {
    const result = await pool.query(
      'SELECT permission_key, description, category, created_at FROM permissions ORDER BY category, permission_key'
    );
    return result.rows;
  }

  /** Get the permission keys mapped to a specific role (validates the role exists). */
  async getRolePermissions(role: string): Promise<string[]> {
    const roleCheck = await pool.query(
      'SELECT 1 FROM roles WHERE role_name = $1',
      [role]
    );
    if (roleCheck.rows.length === 0) {
      throw new NotFoundError('Role');
    }
    return this.getPermissionKeysForRole(role);
  }

  /**
   * Replace the full set of permissions attached to a role.
   * Validates the role and every permission key, then swaps the mapping atomically.
   */
  async setRolePermissions(
    role: string,
    permissionKeys: string[]
  ): Promise<string[]> {
    const roleCheck = await pool.query(
      'SELECT 1 FROM roles WHERE role_name = $1',
      [role]
    );
    if (roleCheck.rows.length === 0) {
      throw new NotFoundError('Role');
    }

    const uniqueKeys = Array.from(new Set(permissionKeys));

    // Validate all keys exist in the catalog
    if (uniqueKeys.length > 0) {
      const validRows = await pool.query(
        'SELECT permission_key FROM permissions WHERE permission_key = ANY($1)',
        [uniqueKeys]
      );
      const validSet = new Set(
        validRows.rows.map((r: { permission_key: string }) => r.permission_key)
      );
      const unknown = uniqueKeys.filter((k) => !validSet.has(k));
      if (unknown.length > 0) {
        throw new ValidationError(`Unknown permission key(s): ${unknown.join(', ')}`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_permissions WHERE role_name = $1', [role]);
      for (const key of uniqueKeys) {
        await client.query(
          'INSERT INTO role_permissions (role_name, permission_key) VALUES ($1, $2)',
          [role, key]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info(`Role permissions updated: ${role} -> [${uniqueKeys.join(', ')}]`);
    return uniqueKeys;
  }
}
