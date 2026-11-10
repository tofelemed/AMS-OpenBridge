/**
 * CHG-141: Why this result. Five cards, one for each tier of the gates; the chosen card fills the right panel with its
 * gates, each opening to its reason. The left column is whatever the page gives: the values and the trend. The page keeps
 * the chosen card and gate in the address. CHG-160 (owner review): the Evidence tab, headed Gates by stage; what the result
 * rests on and its limits moved to the Result tab.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiChevronUpGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-up-google';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { GateBadge } from '../../../ui/GateBadge';
import { gateName } from '../gateStatus';
import { PanelHead } from '../shared';
import { gateDetail } from './gateProof';
import { gateGroups } from './gateGroups';

const GateRow: React.FC<{
  gate: string;
  matrix: CpmGateMatrix;
  flags?: readonly string[] | null;
  vpAbsentOnLoop?: boolean;
  open: boolean;
  onToggle: () => void;
  onProof: () => void;
}> = ({ gate, matrix, flags, vpAbsentOnLoop, open, onToggle, onProof }) => (
  <div className="cpm-inv-gate">
    <button type="button" className="cpm-inv-gate__head" aria-expanded={open} onClick={onToggle}>
      <span className="cpm-inv-gate__name"><strong>{gate}</strong> · {gateName(gate)}</span>
      <GateBadge status={matrix.gates.find(c => c.key === gate)?.status} gate={gate} inputFlags={flags} />
      <span className="ui-icon ui-icon--small">{open ? <ObiChevronUpGoogle /> : <ObiChevronDownGoogle />}</span>
    </button>
    {open && (
      <div className="cpm-inv-gate__detail">
        <p className="cpm-copy">{gateDetail(gate, matrix, { flags, vpAbsentOnLoop })}</p>
        <ObcButton variant="flat" onClick={onProof}>{gate} proof ↗</ObcButton>
      </div>
    )}
  </div>
);

export const WhyResult: React.FC<{
  matrix: CpmGateMatrix;
  /** The window's effective input flags: a pass judged without one of them says so. */
  flags?: readonly string[] | null;
  vpAbsentOnLoop?: boolean;
  tier: string;
  /** The gate open in the panel. */
  gate: string | null;
  onTier: (tier: string) => void;
  onGate: (gate: string | null) => void;
  onProof: (gate: string) => void;
  onAllGates: () => void;
  children: React.ReactNode;
}> = ({ matrix, flags, vpAbsentOnLoop, tier, gate, onTier, onGate, onProof, onAllGates, children }) => {
  const groups = gateGroups(matrix, flags);
  const group = groups.find(g => g.tier === tier) ?? groups[0];
  const open = group.gates.find(g => g.toLowerCase() === (gate ?? '').toLowerCase()) ?? null;
  return (
    <>
      <section className="cpm-inv-why" aria-label="Why this result">
        <PanelHead title="Gates by stage" right={<ObcButton variant="flat" onClick={onAllGates}>All {matrix.gates.length} gates →</ObcButton>} />
        <div className="cpm-kpicards cpm-kpicards--5 cpm-inv-cards" role="group" aria-label="Evidence groups">
          {groups.map(g => (
            <button key={g.tier} type="button" className="cpm-kpicard cpm-kpicard--link cpm-kpicard--muted" aria-pressed={g.tier === group.tier} onClick={() => onTier(g.tier)}>
              <span className="cpm-kpicard__label">{g.tier}</span>
              <span className="cpm-kpicard__sub">{g.summary}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="cpm-inv-work" id="cpm-inv-evidence">
        {children}
        <section className="cpm-surface" aria-label="Gates of this group">
          <PanelHead title={group.tier} right={<ObcButton variant="flat" onClick={() => onProof(open ?? group.gates[0])}>Calculation proof ↗</ObcButton>} />
          <div className="cpm-inv-gates">
            {group.gates.map(g => (
              <GateRow key={g} gate={g} matrix={matrix} flags={flags} vpAbsentOnLoop={vpAbsentOnLoop} open={g === open}
                onToggle={() => onGate(g === open ? null : g)} onProof={() => onProof(g)} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
};

export default WhyResult;
