/**
 * CHG-172 (owner review, the approved sample, badge 19): the selected tag alias in the panel beside the list (a drawer below
 * 1280 px): the tag as the title, its state; Canonical UNS path and Source; Plant model ↗ (the plant tree searched by the path);
 * Delete in the foot for asset.edit (it was on each of 500 rows).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { KvRow, TonePill } from '../../Cpm/shared';
import { adminHref } from '../../Cpm/cpaHref';

export interface AliasRow {
  id: string;
  legacyPath: string;
  canonicalPath: string;
  sourceSystem: string;
  isActive: boolean;
  createdAt: string;
}

export const AliasState: React.FC<{ active: boolean }> = ({ active }) =>
  (active ? <TonePill tone="good" glyph="✓">Active</TonePill> : <TonePill tone="muted" glyph="⊘">Inactive</TonePill>);

export const AliasPanel: React.FC<{
  alias: AliasRow;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
}> = ({ alias, canEdit, open, onClose, onDelete }) => {
  const navigate = useNavigate();
  return (
    <Inspector eyebrow="Tag alias" title={alias.legacyPath} open={open} onClose={onClose} meta={<AliasState active={alias.isActive} />}
      primaryAction={canEdit ? (
        <div className="cpm-admin-foot">
          <ObcButton variant="flat" onClick={onDelete}>Delete</ObcButton>
        </div>
      ) : undefined}>
      <KvRow label="Canonical UNS path"><span className="cpm-mono">{alias.canonicalPath}</span></KvRow>
      <KvRow label="Source">{alias.sourceSystem}</KvRow>
      <div className="cpm-events-links">
        <ObcButton variant="flat" onClick={() => navigate(`${adminHref('plant-model')}?search=${encodeURIComponent(alias.canonicalPath)}`)}>
          Plant model {'↗'}
        </ObcButton>
      </div>
    </Inspector>
  );
};

export default AliasPanel;
