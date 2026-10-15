/**
 * Explorer › the loop's readiness bar: one collapsed line naming what limits or blocks this loop's diagnosis,
 * each cause routed to the surface that can fix it. Moved out of LoopWorkspace.
 *
 * CHG-098 (SME review 2 #20): a bar with nothing BLOCKING is rendered inside the loop summary's "Basis and
 * limitations" disclosure (it is a limitation of the diagnosis), so the trend follows the summary directly;
 * a blocking bar stays above the tabs, where it explains why there is no verdict.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TonePill } from '../shared';
import type { ExplorerTab, ReadinessSummary } from './readinessCauses';

/** One line for a closed disclosure: "2 readiness items to fix · 1 plant fact". */
export function readinessLine(summary: ReadinessSummary): string {
  const parts = [
    summary.causes.length > 0 ? `${summary.causes.length} readiness item(s) to fix` : '',
    summary.blocking > 0 ? `${summary.blocking} blocking` : '',
    summary.notes.length > 0 ? `${summary.notes.length} plant fact(s)` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

export const ReadinessBar: React.FC<{ summary: ReadinessSummary; onTab: (t: ExplorerTab) => void }> = ({ summary, onTab }) => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`cpm-causes${summary.blocking > 0 ? ' cpm-causes--blocking' : ' cpm-causes--limits'}`}>
      <button
        type="button"
        className="cpm-causes__head"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <strong>{summary.headline}</strong>
        <span className="cpm-event-row__sub">
          {summary.causes.length > 0 ? `${summary.causes.length} to fix` : 'nothing to fix'}
          {summary.blocking > 0 ? ` · ${summary.blocking} blocking` : ''}
          {summary.notes.length > 0 ? ` · ${summary.notes.length} plant fact(s)` : ''}
        </span>
        <span className="cpm-causes__caret" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className="cpm-causes__list">
          {summary.causes.map(c => (
            <li key={c.id} className="cpm-causes__item">
              <TonePill tone={c.kind === 'blocking' ? 'bad' : c.kind === 'data' ? 'muted' : 'warn'}>
                {c.kind === 'blocking' ? 'Blocking' : c.kind === 'data' ? 'Waiting for data' : 'Configuration'}
              </TonePill>
              <span className="cpm-causes__text">
                <strong>{c.label}</strong>
                {c.message && <span className="cpm-event-row__sub">{c.message}</span>}
              </span>
              {c.target && (
                <button
                  type="button"
                  className="cpm-causes__action"
                  onClick={() => {
                    if (c.target?.kind === 'tab') onTab(c.target.tab);
                    else if (c.target?.kind === 'route') navigate(c.target.href);
                  }}
                >
                  {c.target.label} ›
                </button>
              )}
            </li>
          ))}
          {/* CHG-059 (SME #23): facts about the plant that limit a diagnosis — information, nothing to fix */}
          {summary.notes.map(n => (
            <li key={n} className="cpm-causes__item">
              <TonePill tone="muted">Plant fact</TonePill>
              <span className="cpm-causes__text"><span className="cpm-event-row__sub">{n}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ReadinessBar;
