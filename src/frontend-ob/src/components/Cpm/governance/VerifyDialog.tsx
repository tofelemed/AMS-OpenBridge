/**
 * The result of a chain verification. A click is never proof: the dialog says what the audit log answered.
 *
 * CHG-174 (owner review, badge 8): the dialog in parts Answer · Run at; a refusal reads "✕ Verify failed" (tone, glyph and word;
 * it read "VERIFY FAILED"); a request that never reached the service says so plainly (it read as a 500, "Failed to fetch"). The
 * last run sits in one line under the button (VerifyLine). The request, its permission and Run again are unchanged.
 * CHG-193 (owner decision 15 Nov 2026): no service names on screen; the service is "the audit log".
 * CHG-202 (owner, 15 Nov 2026: no backend text): the answer in our words, never the service's own text, a status code or a
 * hash. The service answers 200 only when every entry checks out (intact) and 500 when one does not or the check broke; a
 * refusal for permission and any other answer say so in words. "Not served" (range, count, algorithm) went: it described the
 * service's reply, not the chain.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ApiError } from '../../../api/apiFetch';
import type { useVerifyAuditChain } from '../../../hooks/useAudit';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import { stamp, zoneTag } from './auditTime';

export type VerifyState = ReturnType<typeof useVerifyAuditChain>;

export const CHECKING = 'Checking every entry…';
export const INTACT = 'The audit chain is intact: no entry has been changed.';
export const CHANGED_OR_UNFINISHED = 'An entry may have been changed, or the check could not finish.';
export const NO_PERMISSION = 'You do not have permission to verify the audit chain.';
export const NOT_COMPLETED = 'The audit log could not complete the check.';
export const NOT_REACHED = 'The audit log could not be reached, so the chain was not checked.';

/** An answer from the service (any HTTP status) against a request that never reached it. */
const reached = (error: unknown): error is ApiError => error instanceof ApiError;
const ranText = (at: Date) => `${stamp(at.toISOString())} ${zoneTag(at.getTime())}`;

/** What a failed verification means, in words: never the service's text or its status code. */
function failure(error: unknown): string {
  if (!reached(error)) return NOT_REACHED;
  if (error.status === 401 || error.status === 403) return NO_PERMISSION;
  return error.status === 500 ? CHANGED_OR_UNFINISHED : NOT_COMPLETED;
}

export const VerifyDialog: React.FC<{
  verify: VerifyState; ranAt?: Date | null; onRunAgain?: () => void; onClose: () => void;
}> = ({ verify, ranAt, onRunAgain, onClose }) => (
  <Dialog open title="Verify audit chain" onClose={onClose}
    footer={<>
      {onRunAgain && <ObcButton variant="flat" disabled={verify.isPending} onClick={onRunAgain}>Run again</ObcButton>}
      <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>
    </>}>
    <section className="cpm-howto__part" aria-label="Answer">
      <h3 className="cpm-howto__title">Answer</h3>
      <div role="status">
        {verify.isPending && <p className="cpm-copy">{CHECKING}</p>}
        {verify.isSuccess && <p className="cpm-copy">{INTACT}</p>}
        {verify.isError && (
          <p className="cpm-copy">
            <TonePill tone="bad" glyph="✕">Verify failed</TonePill>{' '}<span>{failure(verify.error)}</span>
          </p>
        )}
      </div>
    </section>
    {ranAt && !verify.isPending && <KvRow label="Run at">{ranText(ranAt)}</KvRow>}
  </Dialog>
);

/** The one line under Verify audit chain: what this session knows. It replaces the Audit integrity card. */
export const VerifyLine: React.FC<{ verify: VerifyState; ranAt: Date | null }> = ({ verify, ranAt }) => {
  const at = ranAt ? ` · ${ranText(ranAt)}` : '';
  return (
    <span className="cpm-gov-verify__line" role="status">
      {verify.isIdle && 'Not verified in this session.'}
      {verify.isPending && CHECKING}
      {verify.isSuccess && (ranAt ? `Last run ${ranText(ranAt)}` : 'Last run in this session')}
      {verify.isError && (
        <span className="cpm-pill--bad">
          <span className="cpm-pill__glyph" aria-hidden>✕</span>
          {` ${reached(verify.error) ? 'Verify failed' : 'Audit log not reached'}${at}`}
        </span>
      )}
    </span>
  );
};

export default VerifyDialog;
