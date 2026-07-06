/**
 * Role-Based Access Control Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { hasElevatedRole } from '../utils/roles';

/**
 * Middleware to check user role (exact membership).
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require Admin (the only elevated role).
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (!hasElevatedRole(req.user.role)) {
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
    return;
  }

  next();
}

/**
 * Middleware factory: require a specific functional permission claim on the token.
 * (Optional helper for future auth-service routes that need finer gating than
 * "Admin only". Authorization for other microservices happens at those services
 * against the embedded `permission[]` claim.)
 */
export function requirePermission(permissionKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    if (!req.user.permission?.includes(permissionKey)) {
      res.status(403).json({
        success: false,
        error: `Missing required permission: ${permissionKey}`,
      });
      return;
    }
    next();
  };
}
