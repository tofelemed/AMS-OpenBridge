/**
 * The live role → permission matrix, read from auth-service's RBAC API.
 *
 * Governance used to describe separation of duties with a four-row literal
 * (Admin / Engineer / Operator / Viewer and hand-written "can"/"cannot" prose)
 * under a heading claiming it was "as enforced by the permission model". It was
 * not enforcement, it was documentation — and on the one screen whose purpose is
 * attribution, a stale claim is worse than no claim.
 *
 * The RBAC endpoints require `rbac.manage`, which Governance itself does not
 * (it gates on `admin.audit.view`). So the hook reports whether it is ALLOWED to
 * read, and the panel says so rather than falling back to the literal it
 * replaced: a session that cannot verify the model does not get to assert one.
 */
import { useQuery } from '@tanstack/react-query';
import { getRolesWithPermissions, type Role } from '../../api/rolesApi';
import { useAuthStore } from '../../store/authStore';

export interface RoleMatrix {
  roles: Role[];
  /** role name → the permission keys it holds. */
  holders: Record<string, Set<string>>;
}

export interface RoleMatrixResult {
  canRead: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: RoleMatrix | undefined;
}

export function useRoleMatrix(): RoleMatrixResult {
  const canRead = useAuthStore(s => s.hasPermission('rbac.manage'));

  // CHG-024: one request for the whole matrix (was GET /roles + one GET per role).
  const matrix = useQuery({
    queryKey: ['rbac', 'roles-with-permissions'],
    queryFn: getRolesWithPermissions,
    enabled: canRead,
    staleTime: 5 * 60_000,
  });

  const isLoading = canRead && matrix.isLoading;
  const isError = canRead && matrix.isError;

  const data: RoleMatrix | undefined = canRead && matrix.data
    ? {
      roles: matrix.data.map(({ permissions: _p, ...role }) => role as Role),
      holders: Object.fromEntries(matrix.data.map(r => [r.role_name, new Set(r.permissions ?? [])])),
    }
    : undefined;

  return {
    canRead,
    isLoading,
    isError,
    error: matrix.error,
    data,
  };
}

export default useRoleMatrix;
