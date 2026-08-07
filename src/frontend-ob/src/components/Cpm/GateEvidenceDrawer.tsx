'use client';

/**
 * CPLM Phase 7 (F0.3) — the gate evidence drawer (opened from U3's matrix and
 * later from U5/U8). Content is the CPA drawer's IA — result strip, contract
 * grid, purpose, fusion behaviour — but every value comes from the loop's real
 * latest gate payload plus the calculations catalogue. Nothing is invented:
 * where the engine did not evaluate, the drawer says so and explains why.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, toneFor, fmtDateTime } from './shared';
import { useCpmCalculations, useLatestGates } from '../../hooks/useCpm';

/** Role per gate — the same static policy the registry aside shows. */
const GATE_ROLES: Record<string, string> = {
  G0: 'BLOCKING', G1: 'BLOCKING', G11: 'BLOCKING',
  G2: 'ELIGIBILITY', G2r: 'ELIGIBILITY',
  G3: 'PERFORMANCE', G4: 'PERFORMANCE',
  G5: 'PRIMARY', G6: 'PRIMARY', G10: 'PRIMARY',
  G7: 'SUPPORTING', G8: 'SUPPORTING', G9: 'SUPPORTING',
  G12: 'CONTEXT', G13: 'CONTEXT',
  G14: 'CONFIRMATION', G15: 'FUSION',
};

export const GateEvidenceDrawer: React.FC<{
  loopId: string;
  gateKey: string;
  windowKind?: string;
  onClose: () => void;
}> = ({ loopId, gateKey, windowKind = '24h', onClose }) => {
  const navigate = useNavigate();
  const { data: matrix } = useLatestGates(loopId, windowKind);
  const { data: calc } = useCpmCalculations();

  const def = calc?.gates.find(g => g.key === gateKey);
  const cell = matrix?.gates.find(g => g.key === gateKey);
  const role = GATE_ROLES[gateKey] ?? '—';
  const status = cell?.status ?? 'NOT_EVALUATED';

  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      <div className="cpm-drawer" role="dialog" aria-label={`${gateKey} evidence`}>
        <PanelHead
          eyebrow={`${loopId} · ${gateKey} · ${role}`}
          title={def?.name ?? cell?.name ?? gateKey}
          right={<ObcButton variant="normal" onClick={onClose}>Close</ObcButton>}
        />
        <p className="cpm-copy">
          Latest {windowKind} fused result
          {matrix?.metadata.calculationVersion
            ? ` · calculation v${matrix.metadata.calculationVersion}`
            : ''}
          {matrix?.metadata.dynamicsProfileVersion
            ? ` · profile v${matrix.metadata.dynamicsProfileVersion}`
            : ''}
        </p>

        <div className="cpm-kpi-row" style={{ margin: '12px 0' }}>
          <div className={`cpm-kpi cpm-kpi--${toneFor(status)}`}>
            <span className="cpm-kpi__caption">Result</span>
            <span className="cpm-kpi__value">{status.replace(/_/g, ' ')}</span>
            {cell?.reason && <span className="cpm-kpi__sub">{cell.reason}</span>}
          </div>
        </div>

        <PanelHead eyebrow="Contract" title="Window & attribution" />
        <KvRow label="Window">{matrix?.windowStart ? fmtDateTime(matrix.windowStart) : '—'} → {matrix?.windowEnd ? fmtDateTime(matrix.windowEnd) : '—'}</KvRow>
        <KvRow label="Gate role">{role}</KvRow>
        <KvRow label="Samples">{matrix?.sampleCount ?? '—'}</KvRow>
        <KvRow label="Source">{matrix?.metadata.calculationSource ?? 'flink'}</KvRow>
        <KvRow label="Emitted">{matrix?.metadata.computedAt ? fmtDateTime(matrix.metadata.computedAt) : '—'}</KvRow>

        <PanelHead eyebrow="Purpose" title="What this gate asks" />
        <p className="cpm-copy">{def?.question ?? 'Definition unavailable.'}</p>
        {def && !def.observedInResults && (
          <p className="cpm-copy">
            <TonePill tone="warn">NOT YET OBSERVED</TonePill>&nbsp;No stored result has
            carried a status for this gate yet.
          </p>
        )}

        <PanelHead eyebrow="Fusion behaviour" title="Effect on the verdict" />
        <p className="cpm-copy">
          {gateKey === 'G13' && (matrix?.hasPeerLinks
            ? 'Peer links exist: oscillation without actuator stress disqualifies the stiction family as DISTURBANCE_CONTEXT.'
            : 'No peer links: G13 cannot evaluate, and stiction cannot be distinguished from an upstream disturbance.')}
          {gateKey === 'G14' && (matrix?.observabilityFlags.includes('NO_VP')
            ? 'No VP signal: confidence is capped at 0.89 and no diagnosis can reach CONFIRMED.'
            : 'VP present: confirmation can lift the diagnosis to CONFIRMED.')}
          {gateKey !== 'G13' && gateKey !== 'G14' && (
            role === 'BLOCKING'
              ? 'A failure here excludes the whole window before any diagnosis is attempted.'
              : role === 'FUSION'
                ? 'Combines all qualified evidence into the final banded verdict.'
                : `Contributes ${role.toLowerCase()} evidence to family qualification.`)}
        </p>

        {matrix && matrix.observabilityFlags.length > 0 && (
          <>
            <PanelHead eyebrow="Observability" title="Flags on this window" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {matrix.observabilityFlags.map(f => (
                <TonePill key={f} tone={f.startsWith('HAS_') ? 'good' : 'warn'}>{f}</TonePill>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <ObcButton variant="raised" onClick={() => {
            const q = new URLSearchParams({ loop: loopId, gate: gateKey });
            if (matrix?.windowEnd) q.set('window', matrix.windowEnd);
            navigate(`/cpm/replay?${q.toString()}`);
          }}>
            Open in Evidence Replay ›
          </ObcButton>
        </div>
      </div>
    </>
  );
};

export default GateEvidenceDrawer;
