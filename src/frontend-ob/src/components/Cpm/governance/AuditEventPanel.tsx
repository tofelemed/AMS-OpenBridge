/**
 * CHG-174 (owner review, badge 6, and answer 1): the selected event in the panel beside the list (it was a row dialog; a drawer
 * below 1280 px). The entity type as eyebrow and the action once; Actor, When (with the seconds and the year), Entity; the
 * "Before and after values: Not available" line kept (serving them is not approved); one flat ↗ link to the object where one
 * exists.
 *
 * CHG-202 (owner, 15 Nov 2026, Q6): Record details went, with its raw ids, codes, correlation and hash. No audit trail export
 * exists to carry them, so this panel is the one plain-language record view: who, what, when, on what, before → after. The
 * actor is a name, System or Unknown user (no "user id" line); an entity known only by an id has no Entity row (its type is
 * the eyebrow).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { AuditEventRow } from '../../../api/auditApi';
import { Inspector } from '../../../ui/Inspector';
import { KvRow } from '../shared';
import { actionView, actorView, entityKind, entityName, type Me } from './auditCatalog';
import { bundleOf, isSingleLoop, objectLink } from './auditLinks';
import { stampSeconds, zoneTag } from './auditTime';
import type { ConfigNames } from './useConfigNames';

export const NOT_SERVED = 'Not available';

export const AuditEventPanel: React.FC<{
  event: AuditEventRow;
  names: ConfigNames;
  has: (p: string) => boolean;
  /** Loop ids in the registry, retired loops included. Undefined while the registry has not answered. */
  loopIds: readonly string[] | undefined;
  /** The signed-in person, so their own events read by their full name. */
  me?: Me | null;
  open: boolean;
  onClose: () => void;
}> = ({ event: e, names, has, loopIds, me, open, onClose }) => {
  const navigate = useNavigate();
  const loop = isSingleLoop(e);
  const known = loop && loopIds ? loopIds.includes(e.entityId) : undefined;
  const actor = actorView(e.userId, me);
  const deployment = e.entityType === 'config_deployment' ? names.deployment(e.entityId) : undefined;
  const link = objectLink(e, { names, has, loopKnown: known });
  const name = entityName(e, bundleOf(e, names)?.name);
  return (
    <Inspector eyebrow={entityKind(e)} title={actionView(e, deployment).label} open={open} onClose={onClose}>
      <KvRow label="Actor"><span className={actor.byName ? undefined : 'cpm-gov-muted'}>{actor.text}</span></KvRow>
      <KvRow label={`When · ${zoneTag(Date.parse(e.timestampUtc))}`}>{stampSeconds(e.timestampUtc)}</KvRow>
      {name && (
        <KvRow label="Entity">
          <span className="cpm-gov-stack">
            <span>{name}</span>
            {loop && known === false && <span className="cpm-event-row__sub">{e.entityId} is not in the loop registry.</span>}
          </span>
        </KvRow>
      )}
      <KvRow label="Before and after values">{NOT_SERVED}</KvRow>
      {link && (
        <div className="cpm-gov-links">
          <ObcButton className="ui-link" variant="flat" onClick={() => navigate(link.to)}>{`${link.label} ↗`}</ObcButton>
        </div>
      )}
    </Inspector>
  );
};

export default AuditEventPanel;
