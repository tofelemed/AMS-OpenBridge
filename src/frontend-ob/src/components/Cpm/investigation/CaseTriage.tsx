/**
 * The Investigation page's triage strip: analysis-case chips from the fleet's served
 * verdicts, the loop picker, and the live/historical, profile and window controls.
 * Split out of CpmInvestigation in v2.5 (1E.2); cases come from `cases.ts`.
 */
import React from 'react';
import type { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { FilterChip } from '../../../ui/forms/FilterChip';
import type { CpmGateMatrix, CpmLoop } from '../../../api/cpmApi';
import { EmptyState, PanelHead } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import type { useCpmScope } from '../plantScope';
import LoopCombobox from '../LoopCombobox';
import { CASE_LABEL } from './cases';
import { windowLabel } from '../windowLabel';

type SetParams = ReturnType<typeof useSearchParams>[1];

const SOURCE_OPTIONS = [{ value: 'live', label: 'Live' }, { value: 'historical', label: 'Historical' }] as const;

export const CaseTriage: React.FC<{
  scope: ReturnType<typeof useCpmScope>;
  cases: [string, number][];
  caseFilter: string | null;
  loops: CpmLoop[];
  loopId: string | undefined;
  mode: 'live' | 'historical';
  windowKind: string;
  windows: CpmGateMatrix[];
  matrix: CpmGateMatrix | undefined;
  setParams: SetParams;
}> = ({ scope, cases, caseFilter, loops, loopId, mode, windowKind, windows, matrix, setParams }) => (
  <section className="cpm-surface">
    <PanelHead eyebrow="Analysis cases" title="What the fleet's verdicts contain"
      right={caseFilter && (
        <ObcButton variant="normal"
          onClick={() => setParams(p => { p.delete('case'); return p; }, { replace: true })}>
          Clear filter
        </ObcButton>
      )} />
    {cases.length === 0 && (
      <EmptyState title="No evaluated loops yet"
        copy={scope.active
          ? 'No loop in the selected plant scope has a fused verdict yet — the scope may be too narrow, or its loops have not completed a 12 h / 24 h window.'
          : 'No loop has completed a 12 h / 24 h evaluation window yet. Pipeline Health shows whether the analysis jobs are running.'}
        action={scope.active ? { label: 'Clear the plant scope', onClick: () => scope.set({ site: '' }) } : undefined}
        next={scope.active ? undefined : [{ label: 'Pipeline Health', to: '/cpm/pipeline' }]} />
    )}
    <div className="cpm-filter-row">
      {cases.map(([c, n]) => (
        <FilterChip
          key={c}
          label={`${CASE_LABEL[c] ?? c} · ${n}`}
          selected={caseFilter === c}
          onToggle={() => setParams(p => {
            if (caseFilter === c) p.delete('case');
            else { p.set('case', c); p.delete('loop'); }
            return p;
          }, { replace: true })}
        />
      ))}
    </div>

    <div className="cpm-toolbar" style={{ marginTop: 12 }}>
      <LoopCombobox scope={scope} loops={loops}
        value={loopId ?? ''}
        onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; }, { replace: true })}
        onClear={() => setParams(p => { p.delete('loop'); p.delete('window'); return p; }, { replace: true })} />
      <div className="cpm-field">
        <span className="cpm-field__label">Source</span>
        <SegmentedControl label="Source" ignoreReselect value={mode} options={SOURCE_OPTIONS}
          onChange={v => setParams(p => { p.set('mode', v); return p; }, { replace: true })} />
      </div>
      <label className="cpm-field">
        <span className="cpm-field__label">Profile</span>
        <select className="cpm-select" value={windowKind}
          onChange={e => setParams(p => { p.set('profile', e.target.value); p.delete('window'); return p; }, { replace: true })}>
          <option value="12h">12h fused</option>
          <option value="24h">24h fused</option>
        </select>
      </label>
      {mode === 'historical' && (
        <label className="cpm-field">
          <span className="cpm-field__label">Evaluated window</span>
          <select className="cpm-select" value={matrix?.windowEnd ?? ''}
            onChange={e => setParams(p => { p.set('window', e.target.value); return p; }, { replace: true })}>
            {windows.map(w => (
              <option key={w.windowEnd ?? ''} value={w.windowEnd ?? ''}>
                {windowLabel(w)} · {diagnosisLabel(w.diagnosis)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
    {/* One announcement of the resolved selection across the controls above. */}
    <span className="cpm-sr-only" aria-live="polite">
      Source: {mode === 'live' ? 'live, the latest verdict' : 'historical'}.
      Profile {windowKind} fused.
      {caseFilter ? ` Case filter: ${CASE_LABEL[caseFilter] ?? caseFilter}.` : ' No case filter.'}
    </span>
  </section>
);

export default CaseTriage;
