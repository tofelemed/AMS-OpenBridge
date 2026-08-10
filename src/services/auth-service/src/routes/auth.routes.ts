/**
 * Authentication Routes
 */

import { Router, Request, Response } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { PermissionController } from '../controllers/permission.controller';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import {
  validateLogin,
  validateCreateUser,
  validateUpdateUser,
  validateUpdateProfile,
  validateChangePassword,
} from '../utils/validation';
import * as bulkImportService from '../services/bulkImportService';
import { getJwks } from '../config/keys';
import pool from '../config/database';

const router = Router();
const authController = new AuthController();
const permissionController = new PermissionController();

// Public key set for RS256 token validators (.NET services, etc.)
router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.status(200).json(getJwks());
});

// ── Internal: edge-revocation feed for the API gateway (Plan 04 §2) ─────────────
// The gateway polls this every few seconds and rejects signature-valid tokens whose
// owner was revoked (credentials_changed_at bump) or deactivated — the edge-only
// enforcement point. Guarded by the internal service key; disabled if none is set.
router.get('/internal/revocations', async (req: Request, res: Response) => {
  const serviceKey = process.env.TRAVERSE_SERVICE_KEY;
  if (!serviceKey) {
    res.status(404).json({ error: 'Internal endpoints disabled (no TRAVERSE_SERVICE_KEY).' });
    return;
  }
  if (req.header('X-Service-Key') !== serviceKey) {
    res.status(403).json({ error: 'Invalid service key.' });
    return;
  }

  const since = Number.parseInt(String(req.query.sinceEpoch ?? ''), 10);
  const sinceEpoch = Number.isFinite(since) ? since : Math.floor(Date.now() / 1000) - 1800;

  try {
    const result = await pool.query(
      `SELECT user_id,
              EXTRACT(EPOCH FROM credentials_changed_at)::bigint AS changed,
              is_active
         FROM users
        WHERE credentials_changed_at > to_timestamp($1)
           OR is_active = false`,
      [sinceEpoch]
    );
    res.status(200).json({
      data: result.rows.map((r) => ({
        user_id: r.user_id,
        changed: Number(r.changed) || 0,
        is_active: r.is_active !== false,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read revocations.' });
  }
});

// Public routes
router.post('/login', validateLogin, (req, res) =>
  authController.login(req, res)
);
router.post('/verify', optionalAuth, (req, res) =>
  authController.verifyToken(req, res)
);
// Refresh reads the httpOnly cookie (no body required).
router.post('/refresh', (req, res) => authController.refreshToken(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

// Protected routes - require authentication
router.get('/me', authenticateToken, (req, res) =>
  authController.getCurrentUser(req, res)
);

// Self-service profile management
router.put(
  '/me/profile',
  authenticateToken,
  validateUpdateProfile,
  (req, res) => authController.updateProfile(req, res)
);
router.put(
  '/me/password',
  authenticateToken,
  validateChangePassword,
  (req, res) => authController.changePassword(req, res)
);

// User management routes — gated by the admin.users.edit PERMISSION (not a
// hardcoded role). Admin holds it via the matrix; a custom role can be granted it too.
const canManageUsers = requirePermission('admin.users.edit');
router.post(
  '/users',
  authenticateToken,
  canManageUsers,
  validateCreateUser,
  (req, res) => authController.createUser(req, res)
);
router.get('/users', authenticateToken, canManageUsers, (req, res) =>
  authController.getAllUsers(req, res)
);
// Batch endpoint for users - must be before /users/:id route
router.get('/users/page', authenticateToken, canManageUsers, (req, res) =>
  authController.getUsersPage(req, res)
);
router.get('/users/:id', authenticateToken, canManageUsers, (req, res) =>
  authController.getUserById(req, res)
);
router.put(
  '/users/:id',
  authenticateToken,
  canManageUsers,
  validateUpdateUser,
  (req, res) => authController.updateUser(req, res)
);
router.delete(
  '/users/:id',
  authenticateToken,
  canManageUsers,
  (req, res) => authController.deleteUser(req, res)
);

// ============================================================================
// BULK IMPORT ROUTES
// ============================================================================

router.post('/users/bulk-import/validate', authenticateToken, canManageUsers, async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, error: 'rows array is required and must not be empty' });
      return;
    }
    if (rows.length > 5000) {
      res.status(400).json({ success: false, error: 'Maximum 5000 rows allowed per import' });
      return;
    }
    const result = await bulkImportService.validateBulkImport(rows);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/users/bulk-import/execute', authenticateToken, canManageUsers, async (req: Request, res: Response) => {
  try {
    const { rows, options } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, error: 'rows array is required and must not be empty' });
      return;
    }
    if (rows.length > 5000) {
      res.status(400).json({ success: false, error: 'Maximum 5000 rows allowed per import' });
      return;
    }
    const result = await bulkImportService.executeBulkImport(rows, options || {});
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/users/bulk-import/template', authenticateToken, canManageUsers, (_req: Request, res: Response) => {
  const csv = bulkImportService.generateTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=user_import_template.csv');
  res.send(csv);
});

// ============================================================================
// RBAC ROUTES — gated by the rbac.manage PERMISSION. Roles, the (code-owned)
// permission catalog, role→permission mapping, and custom-role lifecycle.
// ============================================================================
const canManageRbac = requirePermission('rbac.manage');

router.get('/roles', authenticateToken, canManageRbac, (req, res) =>
  permissionController.getRoles(req, res)
);
router.get('/permissions', authenticateToken, canManageRbac, (req, res) =>
  permissionController.getAllPermissions(req, res)
);

// Custom-role lifecycle (system roles protected inside the service).
router.post('/roles', authenticateToken, canManageRbac, (req, res) =>
  permissionController.createRole(req, res)
);
router.put('/roles/:role', authenticateToken, canManageRbac, (req, res) =>
  permissionController.updateRole(req, res)
);
router.delete('/roles/:role', authenticateToken, canManageRbac, (req, res) =>
  permissionController.deleteRole(req, res)
);

router.get(
  '/roles/:role/permissions',
  authenticateToken,
  canManageRbac,
  (req, res) => permissionController.getRolePermissions(req, res)
);
router.put(
  '/roles/:role/permissions',
  authenticateToken,
  canManageRbac,
  (req, res) => permissionController.setRolePermissions(req, res)
);
router.post(
  '/roles/:role/permissions/reset',
  authenticateToken,
  canManageRbac,
  (req, res) => permissionController.resetRolePermissions(req, res)
);

export default router;

