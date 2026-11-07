/** One audit event: the facts audit-service serves, and a plain statement of what it does not. */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { AuditEventRow } from '../../../api/auditApi';
import { copyText } from '../../../utils/copyText';
import { Dialog } from '../../../ui/Dialog';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { registryHref } from '../cpaHref';
import { KvRow, TonePill, fmtDateTime } from '../shared';
import { auditLabel, entityLabel, eventTone, isSingleLoop } from './auditLabels';

export const NOT_SERVED = 'Not available';

/** A value with a Copy button; the outcome is announced. */
const Copyable: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [msg, setMsg] = useState('');
  const copy = async () => setMsg(await copyText(value) ? `${label} copied` : `Copy failed: ${label}`);
  return (
    <>
      <span className="cpm-mono">{value}</span>{' '}
      <button type="button" className="cpm-pipeline-open" aria-label={`Copy ${label}`} onClick={() => void copy()}>Copy</button>
      <span className="cpm-sr-only" role="status">{msg}</span>
    </>
  );
};

export const AuditEventDialog: React.FC<{
  event: AuditEventRow;
  /** Loop ids in the registry, retired loops included. Undefined while the registry has not answered. */
  loopIds: readonly string[] | undefined;
  onClose: () => void;
}> = ({ event: e, loopIds, onClose }) => {
  const navigate = useNavigate();
  const isLoop = isSingleLoop(e.entityType, e.entityId);
  const known = loopIds?.includes(e.entityId);
  return (
    <Dialog open title={auditLabel(e.eventType)} onClose={onClose}
      footer={isLoop && known
        ? <ObcButton variant="flat" onClick={() => navigate(registryHref(e.entityId))}>Open loop ↗</ObcButton>
        : undefined}>
      <KvRow label="When">{fmtDateTime(e.timestampUtc)}</KvRow>
      <KvRow label="Actor">{e.userId || 'Not recorded'}</KvRow>
      <KvRow label="Action"><TonePill tone={eventTone(e.eventType)}>{auditLabel(e.eventType)}</TonePill></KvRow>
      <KvRow label="Entity">{entityLabel(e.entityType)} <span className="cpm-mono">{e.entityId}</span></KvRow>
      {isLoop && loopIds && !known && <p className="cpm-event-row__sub">{e.entityId} is not in the loop registry.</p>}
      <KvRow label="Correlation">{e.correlationId ? <Copyable label="Correlation" value={e.correlationId} /> : NOT_SERVED}</KvRow>
      <KvRow label="Hash"><Copyable label="Hash" value={e.currentHash} /></KvRow>
      <KvRow label="Before and after values">{NOT_SERVED}</KvRow>
      <TechnicalDetails items={[
        { label: 'Event id', value: e.eventId },
        { label: 'Entity type', value: e.entityType },
        { label: 'Timestamp (as recorded)', value: e.timestampUtc },
      ]} />
    </Dialog>
  );
};

export default AuditEventDialog;
