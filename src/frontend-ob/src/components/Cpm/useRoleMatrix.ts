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
import { useQueries, useQuery } from '@tanstack/react-query';
import { getRolePermissions, getRoles, type Role } from '../../api/rolesApi';
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

  const roles = useQuery({
    queryKey: ['rbac', 'roles'],
    queryFn: getRoles,
    enabled: canRead,
    staleTime: 5 * 60_000,
  });

  // One request per role: the API has no bulk endpoint, and inventing the
  // mapping client-side is exactly what this replaces.
  const perms = useQueries({
    queries: (roles.data ?? []).map(r => ({
      queryKey: ['rbac', 'role-permissions', r.role_name],
      queryFn: () => getRolePermissions(r.role_name),
      enabled: canRead,
      staleTime: 5 * 60_000,
    })),
  });

  const isLoading = canRead && (roles.isLoading || perms.some(q => q.isLoading));
  const failed = perms.find(q => q.isError);
  const isError = canRead && (roles.isError || !!failed);

  const ready = canRead && !isLoading && !isError && !!roles.data
    && perms.length === (roles.data?.length ?? 0)
    && perms.every(q => q.data != null);

  const data: RoleMatrix | undefined = ready
    ? {
      roles: roles.data!,
      holders: Object.fromEntries(
        roles.data!.map((r, i) => [r.role_name, new Set(perms[i].data ?? [])]),
      ),
    }
    : undefined;

  return {
    canRead,
    isLoading,
    isError,
    error: roles.error ?? failed?.error,
    data,
  };
}

export default useRoleMatrix;
