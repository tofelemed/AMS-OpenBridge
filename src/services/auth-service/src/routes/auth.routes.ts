/**
 * Authentication Routes
 */

import { Router, Request, Response } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { PermissionController } from '../controllers/permission.controller';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/rbac.middleware';
import {
  validateLogin,
  validateCreateUser,
  validateUpdateUser,
  validateUpdateProfile,
  validateChangePassword,
} from '../utils/validation';
import * as bulkImportService from '../services/bulkImportService';
import { getJwks } from '../config/keys';

const router = Router();
const authController = new AuthController();
const permissionController = new PermissionController();

// Public key set for RS256 token validators (.NET services, etc.)
router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.status(200).json(getJwks());
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

// User management routes - require Admin role
router.post(
  '/users',
  authenticateToken,
  requireAdmin,
  validateCreateUser,
  (req, res) => authController.createUser(req, res)
);
router.get('/users', authenticateToken, requireAdmin, (req, res) =>
  authController.getAllUsers(req, res)
);
// Batch endpoint for users - must be before /users/:id route
router.get('/users/page', authenticateToken, requireAdmin, (req, res) =>
  authController.getUsersPage(req, res)
);
router.get('/users/:id', authenticateToken, requireAdmin, (req, res) =>
  authController.getUserById(req, res)
);
router.put(
  '/users/:id',
  authenticateToken,
  requireAdmin,
  validateUpdateUser,
  (req, res) => authController.updateUser(req, res)
);
router.delete(
  '/users/:id',
  authenticateToken,
  requireAdmin,
  (req, res) => authController.deleteUser(req, res)
);

// ============================================================================
// BULK IMPORT ROUTES
// ============================================================================

router.post('/users/bulk-import/validate', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
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

router.post('/users/bulk-import/execute', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
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

router.get('/users/bulk-import/template', authenticateToken, requireAdmin, (_req: Request, res: Response) => {
  const csv = bulkImportService.generateTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=user_import_template.csv');
  res.send(csv);
});

// ============================================================================
// RBAC ROUTES (Admin only) — roles, functional permission catalog, and mapping
// ============================================================================

router.get('/roles', authenticateToken, requireAdmin, (req, res) =>
  permissionController.getRoles(req, res)
);
router.get('/permissions', authenticateToken, requireAdmin, (req, res) =>
  permissionController.getAllPermissions(req, res)
);
router.get(
  '/roles/:role/permissions',
  authenticateToken,
  requireAdmin,
  (req, res) => permissionController.getRolePermissions(req, res)
);
router.put(
  '/roles/:role/permissions',
  authenticateToken,
  requireAdmin,
  (req, res) => permissionController.setRolePermissions(req, res)
);

export default router;

