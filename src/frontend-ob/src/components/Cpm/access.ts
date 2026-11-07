/**
 * Who may follow a link to a restricted page. A link is shown only when the route would let the user in, so a click
 * never lands on the restricted-page notice. The rules are the route guards in app/AppRoutes.tsx and Administration.tsx.
 */
import { useAuthStore } from '../../store/authStore';
import { ADMIN_PERMISSIONS } from '../../cpa/destinations';

/** /cpm/pipeline: system.manage. */
export const usePipelineAccess = (): boolean => useAuthStore(s => s.hasPermission('system.manage'));

/** /admin/plant-model: the /admin/* guard (any administration permission), then the tab's own asset.view. */
export const usePlantTreeAccess = (): boolean =>
  useAuthStore(s => s.hasPermission('asset.view') && ADMIN_PERMISSIONS.some(p => s.hasPermission(p)));

/** The Pipeline Health step of an empty state's `next` list, or nothing for a user who cannot open it. */
export const pipelineStep = (can: boolean, to: string): Array<{ label: string; to: string }> =>
  can ? [{ label: 'Pipeline Health', to }] : [];
