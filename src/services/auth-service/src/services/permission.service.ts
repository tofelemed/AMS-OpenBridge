/**
 * RBAC Service
 * Owns the functional permission catalog and the role -> permission mapping.
 * This is the single source of truth for authorization; the permissions a user
 * inherits from their role are embedded into the JWT at login/refresh.
 */

import pool from '../config/database';
import logger from '../config/logger';
import { Permission, Role } from '../types';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import {
  SYSTEM_ROLES,
  defaultPermissionsForRole,
  type SystemRole,
} from '../rbac/permission-catalog';

const SYSTEM_ROLE_NAMES = new Set(SYSTEM_ROLES.map((r) => r.name as string));

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

  /**
   * CHG-024 — every role with its permission keys in ONE query. The Governance role
   * matrix used to call GET /roles and then GET /roles/:role/permissions once per role.
   */
  async getRolesWithPermissions(): Promise<Array<Role & { permissions: string[] }>> {
    const result = await pool.query(
      `SELECT r.role_name, r.description, r.is_system_role, r.created_at,
              COALESCE(array_agg(rp.permission_key ORDER BY rp.permission_key)
                       FILTER (WHERE rp.permission_key IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_name = r.role_name
       GROUP BY r.role_name, r.description, r.is_system_role, r.created_at
       ORDER BY r.role_name`
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

    // Phase 3: re-permissioning a role must take effect promptly for everyone
    // holding it. Bump their revocation epoch + drop refresh tokens so their next
    // request re-mints a token with the new permission set.
    await this.revokeTokensForRole(role);

    logger.info(`Role permissions updated: ${role} -> [${uniqueKeys.join(', ')}]`);
    return uniqueKeys;
  }

  /** Phase 3: revoke live tokens for every user holding a role (used on re-permissioning). */
  private async revokeTokensForRole(role: string): Promise<void> {
    await pool.query('UPDATE users SET credentials_changed_at = NOW() WHERE role = $1', [role]);
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id IN (SELECT user_id FROM users WHERE role = $1)',
      [role]
    );
  }

  // ── Custom role lifecycle (Phase 2) ────────────────────────────────────────

  /** True for the four built-in roles, which cannot be renamed or deleted. */
  isSystemRole(role: string): boolean {
    return SYSTEM_ROLE_NAMES.has(role);
  }

  /**
   * Create a custom role (is_system_role = FALSE) with an optional starting
   * permission set. Fails if the name is taken or collides with a system role.
   */
  async createRole(
    roleName: string,
    description: string | null,
    permissionKeys: string[] = []
  ): Promise<Role> {
    const name = (roleName ?? '').trim();
    if (!name) throw new ValidationError('role name is required');
    if (name.length > 50) throw new ValidationError('role name must be ≤ 50 chars');
    if (SYSTEM_ROLE_NAMES.has(name)) {
      throw new ConflictError(`'${name}' is a reserved system role`);
    }

    const exists = await pool.query('SELECT 1 FROM roles WHERE role_name = $1', [name]);
    if (exists.rows.length > 0) throw new ConflictError(`Role '${name}' already exists`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO roles (role_name, description, is_system_role) VALUES ($1, $2, FALSE)',
        [name, description ?? null]
      );
      const keys = await this.applyMappingWithin(client, name, permissionKeys);
      await client.query('COMMIT');
      logger.info(`Custom role created: ${name} -> [${keys.join(', ')}]`);
      return { role_name: name, description: description ?? null, is_system_role: false } as Role;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a role. Description is editable for any role. Renaming is allowed for
   * CUSTOM roles only, and repoints role_permissions and users in one transaction
   * (the FKs are not ON UPDATE CASCADE).
   */
  async updateRole(
    role: string,
    changes: { description?: string | null; newName?: string }
  ): Promise<Role> {
    const roleCheck = await pool.query(
      'SELECT role_name, description, is_system_role FROM roles WHERE role_name = $1',
      [role]
    );
    if (roleCheck.rows.length === 0) throw new NotFoundError('Role');
    const isSystem = roleCheck.rows[0].is_system_role as boolean;

    const rename = changes.newName && changes.newName.trim() !== role;
    if (rename && isSystem) {
      throw new ConflictError(`System role '${role}' cannot be renamed`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (changes.description !== undefined) {
        await client.query('UPDATE roles SET description = $1 WHERE role_name = $2', [
          changes.description,
          role,
        ]);
      }

      let finalName = role;
      if (rename) {
        const newName = changes.newName!.trim();
        if (SYSTEM_ROLE_NAMES.has(newName)) throw new ConflictError(`'${newName}' is reserved`);
        const clash = await client.query('SELECT 1 FROM roles WHERE role_name = $1', [newName]);
        if (clash.rows.length > 0) throw new ConflictError(`Role '${newName}' already exists`);

        // Repoint children first (FKs are not ON UPDATE CASCADE), then the row.
        await client.query('INSERT INTO roles (role_name, description, is_system_role) SELECT $1, description, is_system_role FROM roles WHERE role_name = $2', [newName, role]);
        await client.query('UPDATE role_permissions SET role_name = $1 WHERE role_name = $2', [newName, role]);
        // Phase 3: moved users get a fresh epoch so their stale role claim is re-minted.
        await client.query('UPDATE users SET role = $1, credentials_changed_at = NOW() WHERE role = $2', [newName, role]);
        await client.query('DELETE FROM roles WHERE role_name = $1', [role]);
        finalName = newName;
      }

      await client.query('COMMIT');
      logger.info(`Role updated: ${role}${rename ? ` -> ${finalName}` : ''}`);
      const row = await pool.query(
        'SELECT role_name, description, is_system_role FROM roles WHERE role_name = $1',
        [finalName]
      );
      return row.rows[0] as Role;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a custom role. System roles are refused; a role with users assigned is
   * refused unless a reassignTo target is given (users are moved first).
   */
  async deleteRole(role: string, reassignTo?: string): Promise<void> {
    const roleCheck = await pool.query(
      'SELECT is_system_role FROM roles WHERE role_name = $1',
      [role]
    );
    if (roleCheck.rows.length === 0) throw new NotFoundError('Role');
    if (roleCheck.rows[0].is_system_role) {
      throw new ConflictError(`System role '${role}' cannot be deleted`);
    }

    const users = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE role = $1', [role]);
    const userCount = users.rows[0].n as number;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (userCount > 0) {
        if (!reassignTo) {
          throw new ConflictError(
            `Role '${role}' has ${userCount} user(s); pass reassignTo to move them first`
          );
        }
        const target = await client.query('SELECT 1 FROM roles WHERE role_name = $1', [reassignTo]);
        if (target.rows.length === 0) throw new ValidationError(`reassignTo role '${reassignTo}' does not exist`);
        // Phase 3: reassigned users change permission set → revoke their live tokens.
        await client.query('UPDATE users SET role = $1, credentials_changed_at = NOW() WHERE role = $2', [reassignTo, role]);
      }
      // role_permissions rows cascade on role delete.
      await client.query('DELETE FROM roles WHERE role_name = $1', [role]);
      await client.query('COMMIT');
      logger.info(`Role deleted: ${role}${userCount > 0 ? ` (${userCount} users -> ${reassignTo})` : ''}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Reset a SYSTEM role's permissions to the manifest default matrix. */
  async resetRolePermissions(role: string): Promise<string[]> {
    if (!SYSTEM_ROLE_NAMES.has(role)) {
      throw new ValidationError(`Reset applies to system roles only; '${role}' is custom — edit it directly`);
    }
    const defaults = defaultPermissionsForRole(role as SystemRole);
    return this.setRolePermissions(role, defaults);
  }

  /** Shared mapping-replace used within an open transaction (create role path). */
  private async applyMappingWithin(
    client: any,
    role: string,
    permissionKeys: string[]
  ): Promise<string[]> {
    const uniqueKeys = Array.from(new Set(permissionKeys));
    if (uniqueKeys.length > 0) {
      const validRows = await client.query(
        'SELECT permission_key FROM permissions WHERE permission_key = ANY($1)',
        [uniqueKeys]
      );
      const validSet = new Set(validRows.rows.map((r: { permission_key: string }) => r.permission_key));
      const unknown = uniqueKeys.filter((k) => !validSet.has(k));
      if (unknown.length > 0) throw new ValidationError(`Unknown permission key(s): ${unknown.join(', ')}`);
    }
    await client.query('DELETE FROM role_permissions WHERE role_name = $1', [role]);
    for (const key of uniqueKeys) {
      await client.query(
        'INSERT INTO role_permissions (role_name, permission_key) VALUES ($1, $2)',
        [role, key]
      );
    }
    return uniqueKeys;
  }
}
