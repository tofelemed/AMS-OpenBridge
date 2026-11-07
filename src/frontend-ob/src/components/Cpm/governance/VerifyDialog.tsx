/**
 * The result of a chain verification, in the service's own words. A click is never proof: the dialog shows
 * what audit-service answered, and says what it does not serve (range, count, algorithm).
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { useVerifyAuditChain } from '../../../hooks/useAudit';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { PanelHead, TonePill, fmtDateTime } from '../shared';

export type VerifyState = ReturnType<typeof useVerifyAuditChain>;

export const NOT_SERVED_NOTE = 'The chain range, entry count and algorithm are not served, so this answer cannot be checked here.';

export const VerifyDialog: React.FC<{
  verify: VerifyState; ranAt?: Date | null; onRunAgain?: () => void; onClose: () => void;
}> = ({ verify, ranAt, onRunAgain, onClose }) => (
  <Dialog open title="Verify audit chain" onClose={onClose}
    footer={<>
      {onRunAgain && <ObcButton variant="flat" disabled={verify.isPending} onClick={onRunAgain}>Run again</ObcButton>}
      <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>
    </>}>
    <div role="status">
      {verify.isPending && <p>Walking the full chain…</p>}
      {ranAt && !verify.isPending && <p className="cpm-event-row__sub">Run at {fmtDateTime(ranAt.toISOString())}</p>}
      {verify.isSuccess && <><p>audit-service answered:</p><p className="cpm-mono">{String(verify.data)}</p></>}
      {verify.isError && (
        <>
          <p><TonePill tone="bad">VERIFY FAILED</TonePill> {(verify.error as Error)?.message ?? 'unknown error'}</p>
          <p>A 500 here means the service reported possible tampering or could not complete the walk.</p>
        </>
      )}
    </div>
    {!verify.isPending && <p className="cpm-event-row__sub">{NOT_SERVED_NOTE}</p>}
  </Dialog>
);

/** What the page itself states: no standing claim, and the last answer only once one exists. */
export const AuditIntegrity: React.FC<{ verify: VerifyState }> = ({ verify }) => (
  <section className="cpm-surface" aria-label="Audit integrity">
    <PanelHead title="Audit integrity"
      help={<Toggletip variant="how-to" label="About the audit chain">
        <p>Entries are hash-chained by audit-service. Verify audit chain asks the service to walk the chain and shows its answer.</p>
      </Toggletip>} />
    <p role="status">
      {verify.isIdle && 'Not verified in this session.'}
      {verify.isPending && 'Walking the full chain…'}
      {verify.isSuccess && 'audit-service answered the last verification. Open Verify audit chain for its words.'}
      {verify.isError && <><TonePill tone="bad">VERIFY FAILED</TonePill> The last verification failed.</>}
    </p>
    <p className="cpm-event-row__sub">{NOT_SERVED_NOTE}</p>
  </section>
);

export default VerifyDialog;
