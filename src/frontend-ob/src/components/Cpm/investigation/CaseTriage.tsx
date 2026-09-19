/**
 * The Investigation page's triage strip: analysis-case chips from the fleet's served
 * verdicts, the loop picker, and the live/historical, profile and window controls.
 * Split out of CpmInvestigation in v2.5 (1E.2); cases come from `cases.ts`.
 */
import React from 'react';
import type { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcFilterChip } from '@oicl/openbridge-webcomponents-react/components/filter-chip/filter-chip';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import type { CpmGateMatrix, CpmLoop } from '../../../api/cpmApi';
import { EmptyState, PanelHead, fmtDateTime } from '../shared';
import type { useCpmScope } from '../plantScope';
import LoopCombobox from '../LoopCombobox';
import { CASE_LABEL } from './cases';

type SetParams = ReturnType<typeof useSearchParams>[1];

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
    {cases.length === 0 && <EmptyState title="No evaluated loops yet" />}
    <div className="cpm-filter-row">
      {cases.map(([c, n]) => (
        <ObcFilterChip
          key={c}
          label={`${CASE_LABEL[c] ?? c} · ${n}`}
          checked={caseFilter === c}
          onChipToggle={() => setParams(p => {
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
      <label className="cpm-field">
        <span className="cpm-field__label">Source</span>
        <ObcToggleButtonGroup
          value={mode}
          onValue={(e: CustomEvent<{ value: string }>) => {
            // Same empty-first-emit guard as the other segmented groups.
            const v = e.detail.value;
            if (v === 'live' || v === 'historical') {
              setParams(p => { p.set('mode', v); if (v === 'live') { p.delete('window'); p.delete('methodRun'); } return p; }, { replace: true });
            }
          }}
        >
          <ObcToggleButtonOption value="live">Live</ObcToggleButtonOption>
          <ObcToggleButtonOption value="historical">Historical</ObcToggleButtonOption>
        </ObcToggleButtonGroup>
      </label>
      <label className="cpm-field">
        <span className="cpm-field__label">Profile</span>
        <select className="cpm-select" value={windowKind}
          onChange={e => setParams(p => { p.set('kind', e.target.value); p.delete('profile'); p.delete('window'); p.delete('methodRun'); return p; }, { replace: true })}>
          <option value="24h">24h fused</option>
          <option value="12h">12h fused</option>
        </select>
      </label>
      {mode === 'historical' && (
        <label className="cpm-field">
          <span className="cpm-field__label">Evaluated window</span>
          <select className="cpm-select" value={matrix?.windowEnd ?? ''}
            onChange={e => setParams(p => { p.set('window', e.target.value); return p; }, { replace: true })}>
            {windows.map(w => (
              <option key={w.windowEnd ?? ''} value={w.windowEnd ?? ''}>
                ends {w.windowEnd ? fmtDateTime(w.windowEnd) : '—'}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
    {/* obc-toggle-button-option renders a plain inner <button> with a
        `selected` CLASS and no ARIA state, so the segmented control above is
        visual-only to assistive tech. State the resolved selection instead. */}
    <span className="cpm-sr-only" aria-live="polite">
      Source: {mode === 'live' ? 'live, the latest verdict' : 'historical'}.
      Profile {windowKind} fused.
      {caseFilter ? ` Case filter: ${CASE_LABEL[caseFilter] ?? caseFilter}.` : ' No case filter.'}
    </span>
  </section>
);

export default CaseTriage;
