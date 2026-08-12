/**
 * TypeScript Types for Auth Service
 */

export interface User {
  user_id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  user_id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
}

/** A functional/action permission from the catalog (e.g. "alarm.acknowledge"). */
export interface Permission {
  permission_key: string;
  description?: string;
  category?: string;
  created_at: Date;
}

export interface Role {
  role_name: string;
  description?: string;
  is_system_role: boolean;
  created_at: Date;
}

export interface RefreshToken {
  token_id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

// Request/Response Types
export interface LoginRequest {
  username: string;
  password: string;
}

/** Tokens produced internally by AuthService (refresh token is set as an httpOnly cookie). */
/** Dual-clock session policy for the caller's role — mirrored by the frontend clocks. */
export interface SessionPolicy {
  idleMs: number;
  absoluteMs: number;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  user: UserPublic;
  permissions: string[];
  sessionPolicy: SessionPolicy;
}

/** Body returned to the client on login/refresh (no refresh token — it lives in a cookie). */
export interface LoginResponse {
  success: boolean;
  token: string;
  user: UserPublic & { permissions: string[] };
}

export interface RefreshResult {
  token: string;
  refreshToken: string;
  sessionPolicy: SessionPolicy;
}

/**
 * JWT claims. Includes both the standard names our .NET services read
 * (`sub`, `preferred_username`, `role`, `permission[]`) and legacy fields
 * (`user_id`, `username`) used by this service's own middleware/handlers.
 */
export interface TokenPayload {
  sub: string;
  user_id: string;
  preferred_username: string;
  username: string;
  email: string;
  role: string;
  permission: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role: string;
}

export interface UpdateUserRequest {
  email?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export interface UpdateProfileRequest {
  email?: string;
  full_name?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

/** Replace the full permission set attached to a role. */
export interface SetRolePermissionsRequest {
  permissions: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
}
