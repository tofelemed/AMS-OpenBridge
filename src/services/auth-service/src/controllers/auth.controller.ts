/**
 * Authentication Controller
 */

import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import {
  LoginRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
} from '../types';
import {
  REFRESH_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
} from '../config/cookies';

const authService = new AuthService();

export class AuthController {
  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const credentials: LoginRequest = req.body;
      const result = await authService.login(credentials);
      // Refresh token → httpOnly cookie; access token → JSON body.
      setRefreshCookie(res, result.refreshToken);
      res.status(200).json({
        success: true,
        token: result.token,
        sessionPolicy: result.sessionPolicy,
        user: { ...result.user, permissions: result.permissions },
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Login failed',
      });
    }
  }

  /**
   * POST /api/auth/verify
   */
  async verifyToken(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        res.status(401).json({
          success: false,
          error: 'No token provided',
        });
        return;
      }

      const payload = await authService.verifyToken(token);
      res.status(200).json({
        success: true,
        user: payload,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Token verification failed',
      });
    }
  }

  /**
   * POST /api/auth/refresh
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      // Prefer the httpOnly cookie; fall back to body for non-browser clients.
      const refreshToken: string | undefined =
        req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: 'No refresh token provided',
        });
        return;
      }
      const result = await authService.refreshToken(refreshToken);
      setRefreshCookie(res, result.refreshToken);
      res.status(200).json({
        success: true,
        token: result.token,
        sessionPolicy: result.sessionPolicy,
      });
    } catch (error: any) {
      // Clear a bad/expired refresh cookie so the client stops retrying.
      clearRefreshCookie(res);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Token refresh failed',
        // Typed session-policy reason (SESSION_IDLE_TIMEOUT / SESSION_MAX_DURATION)
        // — the frontend maps it to the timeout dialog wording.
        ...(error.code ? { code: error.code } : {}),
      });
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken: string | undefined =
        req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      clearRefreshCookie(res);
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error: any) {
      clearRefreshCookie(res);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Logout failed',
      });
    }
  }

  /**
   * GET /api/auth/me
   */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
        return;
      }

      const user = await authService.getUserById(req.user.user_id);
      res.status(200).json({
        success: true,
        data: { ...user, permissions: req.user.permission ?? [] },
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get user',
      });
    }
  }

  /**
   * PUT /api/auth/me/profile
   * Update user's own profile (self-service)
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
        return;
      }

      const updateData: UpdateProfileRequest = req.body;
      const user = await authService.updateProfile(req.user.user_id, updateData);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update profile',
      });
    }
  }

  /**
   * PUT /api/auth/me/password
   * Change user's password (self-service)
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
        return;
      }

      const passwordData: ChangePasswordRequest = req.body;
      await authService.changePassword(req.user.user_id, passwordData);
      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to change password',
      });
    }
  }

  /**
   * POST /api/auth/users
   */
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const userData: CreateUserRequest = req.body;
      const user = await authService.createUser(userData);
      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create user',
      });
    }
  }

  /**
   * GET /api/auth/users
   */
  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = await authService.getAllUsers(page, pageSize);

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: {
          page,
          pageSize,
          totalRecords: result.total,
          totalPages: Math.ceil(result.total / pageSize),
        },
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get users',
      });
    }
  }

  /**
   * GET /api/auth/users/:id
   */
  async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await authService.getUserById(id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get user',
      });
    }
  }

  /**
   * PUT /api/auth/users/:id
   */
  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData: UpdateUserRequest = req.body;
      const user = await authService.updateUser(id, updateData);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update user',
      });
    }
  }

  /**
   * DELETE /api/auth/users/:id
   */
  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await authService.deleteUser(id);
      res.status(200).json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to delete user',
      });
    }
  }

  /**
   * GET /api/auth/users/page (Batch endpoint)
   * Returns users list, pagination, and stats in one call
   * Supports filters: search, role, status
   */
  async getUsersPage(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      
      // Extract filter params
      const filters: {
        search?: string;
        role?: string;
        status?: string;
      } = {};
      
      if (req.query.search) {
        filters.search = req.query.search as string;
      }
      
      if (req.query.role) {
        filters.role = req.query.role as string;
      }
      
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      
      const result = await authService.getUsersPage(page, pageSize, filters);

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination,
        stats: result.stats,
        filterOptions: result.filterOptions,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get users page',
      });
    }
  }
}

