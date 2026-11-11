/**
 * CHG-174 (owner review, badge 6, and answer 1): the selected event in the panel beside the list (it was a row dialog; a drawer
 * below 1280 px). The entity type as eyebrow and the action once; Actor, When (with the seconds and the year), Entity; the
 * "Before and after values: Not available" line kept (serving them is not approved); one flat ↗ link to the object where one
 * exists; Record details in the foot.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { AuditEventRow } from '../../../api/auditApi';
import { Inspector } from '../../../ui/Inspector';
import { KvRow } from '../shared';
import { actionView, actorView, entityKind, entityName } from './auditCatalog';
import { bundleOf, isSingleLoop, objectLink } from './auditLinks';
import { stampSeconds, zoneTag } from './auditTime';
import { AuditRecordDialog } from './AuditRecordDialog';
import type { ConfigNames } from './useConfigNames';

export const NOT_SERVED = 'Not available';

export const AuditEventPanel: React.FC<{
  event: AuditEventRow;
  names: ConfigNames;
  has: (p: string) => boolean;
  /** Loop ids in the registry, retired loops included. Undefined while the registry has not answered. */
  loopIds: readonly string[] | undefined;
  open: boolean;
  onClose: () => void;
}> = ({ event: e, names, has, loopIds, open, onClose }) => {
  const navigate = useNavigate();
  const [record, setRecord] = useState(false);
  const loop = isSingleLoop(e);
  const known = loop && loopIds ? loopIds.includes(e.entityId) : undefined;
  const actor = actorView(e.userId);
  const deployment = e.entityType === 'config_deployment' ? names.deployment(e.entityId) : undefined;
  const link = objectLink(e, { names, has, loopKnown: known });
  return (
    <>
      <Inspector eyebrow={entityKind(e)} title={actionView(e, deployment).label} open={open} onClose={onClose}
        primaryAction={<div className="cpm-admin-foot"><ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton></div>}>
        <KvRow label="Actor">
          <span className="cpm-gov-stack">
            <span className={actor.byName ? undefined : 'cpm-gov-muted'}>{actor.text}</span>
            {actor.id && <span className="cpm-event-row__sub">Recorded by user id only; the id is in Record details.</span>}
          </span>
        </KvRow>
        <KvRow label={`When · ${zoneTag(Date.parse(e.timestampUtc))}`}>{stampSeconds(e.timestampUtc)}</KvRow>
        <KvRow label="Entity">
          <span className="cpm-gov-stack">
            <span>{entityName(e, bundleOf(e, names)?.name)}</span>
            {loop && known === false && <span className="cpm-event-row__sub">{e.entityId} is not in the loop registry.</span>}
          </span>
        </KvRow>
        <KvRow label="Before and after values">{NOT_SERVED}</KvRow>
        {link && (
          <div className="cpm-gov-links">
            <ObcButton variant="flat" onClick={() => navigate(link.to)}>{`${link.label} ↗`}</ObcButton>
          </div>
        )}
      </Inspector>
      <AuditRecordDialog event={e} open={record} onClose={() => setRecord(false)} />
    </>
  );
};

export default AuditEventPanel;
