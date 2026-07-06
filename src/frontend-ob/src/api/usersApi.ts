import axios from 'axios';
import { getAuthToken } from './auth';

const BASE = '/api/auth';
const authHeaders = () => ({ Authorization: `Bearer ${getAuthToken()}` });

export interface AdminUser {
  user_id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface UsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface UsersPage {
  users: AdminUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { total: number; active: number; inactive: number; byRole: Record<string, number> };
  filterOptions: { roles: string[]; statuses: Array<{ value: string; label: string }> };
}

export async function getUsersPage(filters: UsersFilters): Promise<UsersPage> {
  const res = await axios.get(`${BASE}/users/page`, { params: filters, headers: authHeaders() });
  return {
    users: res.data.data,
    pagination: res.data.pagination,
    stats: res.data.stats,
    filterOptions: res.data.filterOptions,
  };
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role: string;
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const res = await axios.post(`${BASE}/users`, payload, { headers: authHeaders() });
  return res.data.data;
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUser> {
  const res = await axios.put(`${BASE}/users/${id}`, payload, { headers: authHeaders() });
  return res.data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await axios.delete(`${BASE}/users/${id}`, { headers: authHeaders() });
}

// ── Bulk import ─────────────────────────────────────────────────────────────

export interface BulkValidationRow {
  row_number: number;
  data: Record<string, unknown>;
  status: 'valid' | 'error' | 'warning' | 'duplicate';
  errors: string[];
  warnings: string[];
}

export interface BulkValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  duplicateRows: number;
  rows: BulkValidationRow[];
}

export interface BulkImportResult {
  totalProcessed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export async function validateBulkImport(rows: Record<string, unknown>[]): Promise<BulkValidationResult> {
  const res = await axios.post(`${BASE}/users/bulk-import/validate`, { rows }, { headers: authHeaders() });
  return res.data.data;
}

export async function executeBulkImport(
  rows: Record<string, unknown>[],
  options: { skipErrors?: boolean; overwriteDuplicates?: boolean }
): Promise<BulkImportResult> {
  const res = await axios.post(
    `${BASE}/users/bulk-import/execute`,
    { rows, options },
    { headers: authHeaders() }
  );
  return res.data.data;
}

export async function getImportTemplate(): Promise<string> {
  const res = await axios.get(`${BASE}/users/bulk-import/template`, {
    headers: authHeaders(),
    responseType: 'text',
  });
  return res.data as string;
}

/** Human-readable message from an axios error (auth-service returns `{ error }`). */
export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) return 'Admin access required.';
    if (error.response?.status === 401) return 'Your session expired. Please sign in again.';
    return (error.response?.data as { error?: string } | undefined)?.error || error.message;
  }
  return 'An unexpected error occurred.';
}
