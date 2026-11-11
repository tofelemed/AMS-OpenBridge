/**
 * The result of a chain verification, in the service's own words. A click is never proof: the dialog shows what audit-service
 * answered, and says what it does not serve (range, count, algorithm).
 *
 * CHG-174 (owner review, badge 8): the dialog in parts Answer · Run at · Not served, with the not-served sentence once (it stood
 * in the dialog twice and on the Audit integrity card, which went); a refusal reads "✕ Verify failed" (tone, glyph and word; it
 * read "VERIFY FAILED"); a request that never reached the service says so plainly (it read as a 500, "Failed to fetch"). The last
 * run sits in one line under the button (VerifyLine). The request, its permission and Run again are unchanged.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ApiError } from '../../../api/apiFetch';
import type { useVerifyAuditChain } from '../../../hooks/useAudit';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import { stamp, zoneTag } from './auditTime';

export type VerifyState = ReturnType<typeof useVerifyAuditChain>;

export const NOT_SERVED_NOTE = 'The chain range, entry count and algorithm are not served, so this answer cannot be checked here.';
export const MEANS_500 = 'A 500 here means the service reported possible tampering or could not complete the walk.';
export const NOT_REACHED = 'audit-service could not be reached, so the chain was not checked.';

/** An answer from the service (any HTTP status) against a request that never reached it. */
const reached = (error: unknown): error is ApiError => error instanceof ApiError;
const ranText = (at: Date) => `${stamp(at.toISOString())} ${zoneTag(at.getTime())}`;

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
        {verify.isPending && <p className="cpm-copy">Walking the full chain…</p>}
        {verify.isSuccess && <><p className="cpm-copy">audit-service answered:</p><p className="cpm-mono">{String(verify.data)}</p></>}
        {verify.isError && (
          <>
            <p className="cpm-copy">
              <TonePill tone="bad" glyph="✕">Verify failed</TonePill>{' '}
              {reached(verify.error) ? <span>{verify.error.message}</span> : <span>{NOT_REACHED}</span>}
            </p>
            {reached(verify.error) && verify.error.status === 500 && <p className="cpm-copy">{MEANS_500}</p>}
          </>
        )}
      </div>
    </section>
    {ranAt && !verify.isPending && <KvRow label="Run at">{ranText(ranAt)}</KvRow>}
    {!verify.isPending && (
      <section className="cpm-howto__part" aria-label="Not served">
        <h3 className="cpm-howto__title">Not served</h3>
        <p className="cpm-copy">{NOT_SERVED_NOTE}</p>
      </section>
    )}
  </Dialog>
);

/** The one line under Verify audit chain: what this session knows. It replaces the Audit integrity card. */
export const VerifyLine: React.FC<{ verify: VerifyState; ranAt: Date | null }> = ({ verify, ranAt }) => {
  const at = ranAt ? ` · ${ranText(ranAt)}` : '';
  return (
    <span className="cpm-gov-verify__line" role="status">
      {verify.isIdle && 'Not verified in this session.'}
      {verify.isPending && 'Walking the full chain…'}
      {verify.isSuccess && (ranAt ? `Last run ${ranText(ranAt)}` : 'Last run in this session')}
      {verify.isError && (
        <span className="cpm-pill--bad">
          <span className="cpm-pill__glyph" aria-hidden>✕</span>
          {` ${reached(verify.error) ? 'Verify failed' : 'audit-service not reached'}${at}`}
        </span>
      )}
    </span>
  );
};

export default VerifyDialog;
