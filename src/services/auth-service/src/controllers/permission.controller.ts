/**
 * RBAC Controller
 * Exposes the role list, the functional permission catalog, and the
 * role -> permission mapping (read + replace).
 */

import { Request, Response } from 'express';
import { PermissionService } from '../services/permission.service';
import { auditEmitter } from '../services/audit-emitter';

const permissionService = new PermissionService();

/** Actor performing the change, for the audit trail. */
const actorOf = (req: Request): string | undefined =>
  (req.user as any)?.sub ?? (req.user as any)?.user_id;

export class PermissionController {
  /**
   * GET /api/auth/roles
   */
  async getRoles(_req: Request, res: Response): Promise<void> {
    try {
      const roles = await permissionService.getRoles();
      res.status(200).json({ success: true, data: roles });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get roles',
      });
    }
  }

  /**
   * GET /api/auth/permissions
   * Returns the functional permission catalog.
   */
  async getAllPermissions(_req: Request, res: Response): Promise<void> {
    try {
      const permissions = await permissionService.getPermissionCatalog();
      res.status(200).json({ success: true, data: permissions });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get permissions',
      });
    }
  }

  /**
   * GET /api/auth/roles/:role/permissions
   */
  async getRolePermissions(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.params;
      const permissions = await permissionService.getRolePermissions(role);
      res.status(200).json({ success: true, data: { role, permissions } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get role permissions',
      });
    }
  }

  /**
   * POST /api/auth/roles — create a custom role.
   */
  async createRole(req: Request, res: Response): Promise<void> {
    try {
      const { roleName, name, description, permissions } = req.body ?? {};
      const role = await permissionService.createRole(
        roleName ?? name,
        description ?? null,
        Array.isArray(permissions) ? permissions : []
      );
      auditEmitter.emit('RBAC_ROLE_CREATED', actorOf(req), 'Role', role.role_name, undefined, {
        description: role.description,
        permissions: Array.isArray(permissions) ? permissions : [],
      });
      res.status(201).json({ success: true, data: role });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to create role' });
    }
  }

  /**
   * PUT /api/auth/roles/:role — edit description; rename custom roles.
   */
  async updateRole(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.params;
      const { description, newName } = req.body ?? {};
      const updated = await permissionService.updateRole(role, { description, newName });
      auditEmitter.emit('RBAC_ROLE_UPDATED', actorOf(req), 'Role', updated.role_name, { role }, {
        description: updated.description,
        renamedFrom: newName && newName !== role ? role : undefined,
      });
      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to update role' });
    }
  }

  /**
   * DELETE /api/auth/roles/:role — delete a custom role (optional ?reassignTo=).
   */
  async deleteRole(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.params;
      const reassignTo = (req.query.reassignTo as string) || (req.body?.reassignTo as string) || undefined;
      await permissionService.deleteRole(role, reassignTo);
      auditEmitter.emit('RBAC_ROLE_DELETED', actorOf(req), 'Role', role, { role, reassignTo }, undefined);
      res.status(200).json({ success: true, data: { role, deleted: true } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to delete role' });
    }
  }

  /**
   * POST /api/auth/roles/:role/permissions/reset — reset a system role to default.
   */
  async resetRolePermissions(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.params;
      const permissions = await permissionService.resetRolePermissions(role);
      auditEmitter.emit('RBAC_ROLE_PERMISSIONS_RESET', actorOf(req), 'RolePermissions', role, undefined, { permissions });
      res.status(200).json({ success: true, data: { role, permissions } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to reset role' });
    }
  }

  /**
   * PUT /api/auth/roles/:role/permissions
   * Replace the full set of permissions attached to a role.
   */
  async setRolePermissions(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.params;
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        res.status(400).json({
          success: false,
          error: 'permissions must be an array of permission keys',
        });
        return;
      }
      // Capture the prior mapping for the audit before/after.
      let before: string[] = [];
      try { before = await permissionService.getRolePermissions(role); } catch { /* new/unknown role handled below */ }
      const updated = await permissionService.setRolePermissions(role, permissions);
      auditEmitter.emit('RBAC_ROLE_PERMISSIONS_CHANGED', actorOf(req), 'RolePermissions', role,
        { permissions: before }, { permissions: updated });
      res.status(200).json({ success: true, data: { role, permissions: updated } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update role permissions',
      });
    }
  }
}
