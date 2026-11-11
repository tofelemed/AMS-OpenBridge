/**
 * CHG-172 (owner review, the approved sample, badge 16): the selected plant node in the panel beside the tree (a drawer below
 * 1280 px). The level as eyebrow, the name; Path with Copy, Description, Template and Managed by (a node the CPM Loop Registry
 * owns), a measurement's unit and limits (they were beside the row); Add <child level>, Edit and Delete for asset.edit (they were
 * on every row); Loop Registry → in the foot for a CPM node (it was a "CPM · FC10711 ↗" chip on the device and each signal).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { KvRow } from '../../Cpm/shared';
import { CopyableId } from '../../Cpm/evidence/CopyableId';
import { registryHref } from '../../Cpm/cpaHref';
import { CHILD_TYPE, TYPE_NAMES, isCpmNode, loopIdOf, type AssetNode } from './plantModel';

const limit = (v: number | null | undefined) => (v == null ? '—' : String(v));

export const NodePanel: React.FC<{
  node: AssetNode;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ node, canEdit, open, onClose, onAddChild, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const childType = CHILD_TYPE[node.type];
  const cpm = isCpmNode(node);
  const measurement = node.type === 5;
  return (
    <Inspector eyebrow={TYPE_NAMES[node.type]} title={node.name} open={open} onClose={onClose}
      primaryAction={cpm ? (
        <div className="cpm-admin-foot cpm-admin-foot--end">
          <ObcButton variant="raised" onClick={() => navigate(registryHref(loopIdOf(node)))}>Loop Registry {'→'}</ObcButton>
        </div>
      ) : undefined}>
      <KvRow label="Path"><CopyableId label="path" value={node.contextualPath} chars={400} /></KvRow>
      <KvRow label="Description">{node.description || '—'}</KvRow>
      {node.template && <KvRow label="Template">{node.template}</KvRow>}
      {cpm && <KvRow label="Managed by">CPM Loop Registry</KvRow>}
      {measurement && node.engineeringUnit && <KvRow label="Engineering unit">{node.engineeringUnit}</KvRow>}
      {measurement && (node.loEngLimit != null || node.hiEngLimit != null) && (
        <KvRow label="Limits">{`${limit(node.loEngLimit)} – ${limit(node.hiEngLimit)}`}</KvRow>
      )}
      {canEdit && (
        <div className="cpm-admin-part cpm-admin-inline">
          {childType !== null && <ObcButton variant="normal" onClick={onAddChild}>Add {TYPE_NAMES[childType]}</ObcButton>}
          <ObcButton variant="normal" onClick={onEdit}>Edit</ObcButton>
          <ObcButton variant="flat" onClick={onDelete}>Delete</ObcButton>
        </div>
      )}
    </Inspector>
  );
};

export default NodePanel;
