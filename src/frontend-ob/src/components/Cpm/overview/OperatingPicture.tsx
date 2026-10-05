/**
 * SME review #5/#6 (CHG-043): the Overview's operating picture. One bar shows how
 * the monitored fleet splits across the five states (part-to-whole at a glance);
 * five tiles below name each state with its count, its share and what it means,
 * and open the matching Performance filter where one exists. Same KPI tiles as the
 * rest of the module, so it reads as one product.
 *
 * Renders an honest notice (not zeros) against a cplm-api that predates the
 * `statuses` block.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { EmptyState, KpiTile, PanelHead } from '../shared';
import { performanceHref } from '../cpaHref';
import { operatingStates, shareText } from './operatingStates';

export const OperatingPicture: React.FC<{
  summary: CpmFleetSummary | undefined;
  /** The operator's explicit loop choice, carried to Performance like the other fleet exits. */
  explicitLoop?: string;
}> = ({ summary, explicitLoop }) => {
  const navigate = useNavigate();
  const monitored = summary?.loops.monitored ?? 0;
  const states = summary?.statuses ? operatingStates(summary.statuses) : null;
  const ariaSummary = states?.map(s => `${s.label} ${s.count}`).join(', ');

  return (
    <section className="cpm-surface cpm-op" aria-label="Operating picture">
      <PanelHead
        eyebrow={`Operating picture · latest ${summary?.windowKind ?? '24h'} results`}
        title={summary ? `${monitored} loop(s) monitored` : 'Loading…'}
        right={summary ? <span className="cpm-op__muted">of {summary.loops.total} registered</span> : undefined}
      />
      {summary && !states && (
        <EmptyState title="Operating states unavailable"
          copy="This loop-performance service does not report the per-state counts yet; update cplm-api." />
      )}
      {states && (
        <>
          <div className="cpm-op__bar" role="img" aria-label={`Monitored loops by state: ${ariaSummary}`}>
            {states.filter(s => s.count > 0).map(s => (
              <span key={s.key} className={`cpm-op__seg cpm-op__seg--${s.key}`}
                style={{ flexGrow: s.count }} title={`${s.label}: ${shareText(s.count, monitored)}`} />
            ))}
          </div>
          <div className="cpm-op__tiles">
            {states.map(s => (
              <KpiTile key={s.key} caption={s.label} tone={s.count > 0 ? s.tone : 'muted'}
                value={<>{s.count}<span className="cpm-op__pct">{monitored > 0 ? Math.round((s.count / monitored) * 100) : 0}%</span></>}
                sub={s.sub}
                action={s.rows && s.count > 0 ? (
                  <ObcButton variant="flat" title={`The ${s.label.toLowerCase()} loops in the Performance matrix`}
                    onClick={() => navigate(performanceHref({ rows: s.rows, loop: explicitLoop }))}>
                    Show loops ›
                  </ObcButton>
                ) : undefined} />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default OperatingPicture;
