/**
 * Who may follow a link to a restricted page. A link is shown only when the route would let the user in, so a click
 * never lands on the restricted-page notice. The rules are the route guards in app/AppRoutes.tsx and Administration.tsx.
 */
import { useAuthStore } from '../../store/authStore';

/** /cpm/pipeline: system.manage. */
export const usePipelineAccess = (): boolean => useAuthStore(s => s.hasPermission('system.manage'));

/** /admin/plant-model: asset.view, which opens both the /admin/* guard and the tab (CHG-172, owner answer 3f). */
export const usePlantTreeAccess = (): boolean => useAuthStore(s => s.hasPermission('asset.view'));

/** The Pipeline Health step of an empty state's `next` list, or nothing for a user who cannot open it. */
export const pipelineStep = (can: boolean, to: string): Array<{ label: string; to: string }> =>
  can ? [{ label: 'Pipeline Health', to }] : [];
