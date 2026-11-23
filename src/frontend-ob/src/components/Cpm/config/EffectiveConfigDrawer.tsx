/**
 * v2.5 Task 3D.1 (spec §5.7, §3.3): the configuration a loop actually runs under, as a drawer inside
 * another page (the Loop Explorer's model card).
 * 2026-09-18: a thin wrapper around EffectiveView (compact: the gate dropdown + one gate's table + the
 * folded workers; the full layer stack lives on the Gate Configuration page, linked from the head).
 * CHG-184: the Workbench's "Configuration used by this run" went, and with it the run's instant, bundle and gate.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, QueryError, TonePill } from '../shared';
import { useEffectiveConfig } from './useConfig';
import { bundleStateTone } from './configSupport';
import { versionLabel } from './levelWords';
import { EffectiveView } from './EffectiveView';
import { loopPath } from './configRoutes';

export const EffectiveConfigDrawer: React.FC<{ loopId: string; onClose?: () => void }> = ({ loopId, onClose }) => {
  const q = useEffectiveConfig(loopId);
  const eff = q.data;
  return (
    <section className="cpm-surface cpm-config-effective-drawer" data-testid="effective-config-drawer">
      <PanelHead eyebrow="Effective configuration" title={loopId}
        right={<span className="cpm-config-inline">
          {eff && <TonePill tone={bundleStateTone(eff.state)}>{eff.bundle ? versionLabel(eff.bundle) : 'Factory settings'}</TonePill>}
          <Link className="cpm-link" to={loopPath(loopId)}>Open in Gate Configuration ↗</Link>
          {onClose && <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}
        </span>} />
      {q.isLoading && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the effective configuration…</span></div>}
      {q.isError && <QueryError error={q.error} retry={() => void q.refetch()} />}
      {eff && <EffectiveView eff={eff} compact />}
    </section>
  );
};
