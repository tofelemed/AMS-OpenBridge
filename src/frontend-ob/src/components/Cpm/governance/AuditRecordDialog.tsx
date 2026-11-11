/**
 * CHG-174 (owner review, badge 7): the selected event's Record details, in titled parts: Event (id, type code, recorded at),
 * Actor (the user name, or the user id an old event recorded), Entity (type code, id), Chain (hash, correlation). Each value
 * copies with the ⧉ button. The hash shows its first 12 characters and copies whole; nothing else from the chain is shown.
 * They sat in the event dialog's body and its Technical details.
 */
import React from 'react';
import type { AuditEventRow } from '../../../api/auditApi';
import { actorView } from './auditCatalog';
import { RecordDialog, shortHash12, type RecordPart } from './RecordDialog';

export function recordParts(e: AuditEventRow): RecordPart[] {
  const actor = actorView(e.userId);
  return [
    { title: 'Event', rows: [
      { label: 'Event id', shown: e.eventId, copy: e.eventId },
      { label: 'Event type', shown: e.eventType },
      { label: 'Recorded at', shown: e.timestampUtc },
    ] },
    { title: 'Actor', rows: actor.id
      ? [{ label: 'User name', shown: actor.text, mono: false }, { label: 'User id', shown: actor.id, copy: actor.id }]
      : [{ label: 'User name', shown: actor.text, mono: false }] },
    { title: 'Entity', rows: [
      { label: 'Entity type', shown: e.entityType },
      { label: 'Entity id', shown: e.entityId, copy: e.entityId },
    ] },
    { title: 'Chain', rows: [
      { label: 'Hash', shown: shortHash12(e.currentHash), copy: e.currentHash || undefined },
      { label: 'Correlation', shown: e.correlationId, copy: e.correlationId ?? undefined },
    ] },
  ];
}

export const AuditRecordDialog: React.FC<{ event: AuditEventRow; open: boolean; onClose: () => void }> = ({ event, open, onClose }) =>
  <RecordDialog title="Record details" parts={recordParts(event)} open={open} onClose={onClose} />;

export default AuditRecordDialog;
