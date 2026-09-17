// 2026-09-17 audit F22: the fast conditions ride the same 30 s background poll as the events list.
import { useQuery } from '@tanstack/react-query';
import { backgroundPoll } from '../../../api/apiFetch';
import { getConditions, type CpmConditionScope } from '../../../api/cpm/conditions';

export function useCpmConditions(scope: CpmConditionScope, openOnly: boolean, limit = 200, refetchMs = 30_000) {
  return useQuery({
    queryKey: ['cpm', 'conditions', scope.site ?? '', scope.area ?? '', scope.unit ?? '', openOnly, limit],
    queryFn: backgroundPoll(({ signal }) => getConditions(scope, openOnly, limit, signal)),
    refetchInterval: refetchMs,
  });
}
