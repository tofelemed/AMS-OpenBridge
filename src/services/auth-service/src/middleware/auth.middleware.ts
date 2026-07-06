/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { TokenPayload } from '../types';
import { AuthenticationError } from '../utils/errors';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

const authService = new AuthService();

/**
 * Middleware to verify JWT token
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const payload = await authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Authentication failed',
      });
    }
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const payload = await authService.verifyToken(token);
      req.user = payload;
    }
    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
}

