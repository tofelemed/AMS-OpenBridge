/**
 * RBAC Controller
 * Exposes the role list, the functional permission catalog, and the
 * role -> permission mapping (read + replace).
 */

import { Request, Response } from 'express';
import { PermissionService } from '../services/permission.service';

const permissionService = new PermissionService();

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
      const updated = await permissionService.setRolePermissions(role, permissions);
      res.status(200).json({ success: true, data: { role, permissions: updated } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update role permissions',
      });
    }
  }
}
