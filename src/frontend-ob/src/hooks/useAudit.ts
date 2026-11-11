/**
 * React-query hooks over the audit-service client (U12 Governance and the
 * admin Audit Log both consume these).
 */
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { backgroundPoll } from '../api/apiFetch';
import * as audit from '../api/auditApi';

export function useAuditEvents(q: audit.AuditQuery = {}, refetchMs = 30_000, enabled = true) {
  return useQuery({
    queryKey: ['audit', 'events', q],
    // H2: interval poll — must not extend the idle-session clock.
    queryFn: backgroundPoll(({ signal }) => audit.getAuditEvents(q, signal)),
    refetchInterval: refetchMs > 0 ? refetchMs : false,
    enabled,
    retry: false, // a 403 should surface as a permission message, not retry noise
    // CHG-174: the page on screen stays while the next one is read, so the pager does not vanish under the cursor.
    placeholderData: keepPreviousData,
  });
}

export function useVerifyAuditChain() {
  return useMutation({ mutationFn: audit.verifyAuditChain });
}
