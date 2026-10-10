/**
 * CHG-082 / KPI Phase 2: the Overview's operating picture, from cplm-api `GET /fleet/kpis` (rules, formulas and evidence:
 * kpi_calculation_logic/KPI-LOGIC.md). Replaces the CHG-043 five states, whose "Healthy" counted codes the engine never
 * writes and whose "Stale" mixed a stopped pipeline with windows that had insufficient data.
 *
 * - One bar: every monitored loop in exactly one state (part-to-whole); a legend names and counts each segment.
 * - Tiles in three rows (performance, conditions, coverage): count, % of a NAMED denominator, the rule on hover, and
 *   "Show loops ›" to the drill-down that lists exactly those loops with the value that put each one there.
 */
import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmFleetScope } from '../../../api/cpmApi';
import { EmptyState, KpiTile, PanelHead, QueryError, fmtDateTime } from '../shared';
import { kpiHref } from '../cpaHref';
import { useFleetKpis } from '../kpi/useFleetKpis';
import {
  KPI_GROUPS, basisText, denominatorText, kpiTone, pct, reasonsText, stateSegments,
} from '../kpi/fleetKpiView';

export const OperatingPicture: React.FC<{ scope?: CpmFleetScope }> = ({ scope }) => {
  const navigate = useNavigate();
  const q = useFleetKpis(scope);
  const k = q.data;
  const segments = k ? stateSegments(k) : [];
  const figures = new Map((k?.kpis ?? []).map(f => [f.key, f]));

  return (
    <section className="cpm-surface cpm-op" aria-label="Operating picture">
      <PanelHead
        eyebrow={`Operating picture · latest ${k?.basis.windowKind ?? '24h'} results`}
        title={k ? `${k.monitored} loop(s) monitored` : 'Loading…'}
        right={k ? <span className="cpm-op__muted" title={k.computedAt}>computed {fmtDateTime(k.computedAt)}</span> : undefined}
      />
      {q.isError && <QueryError title="Operating picture unavailable" error={q.error} retry={() => void q.refetch()} />}
      {k && k.monitored === 0 && <EmptyState title="No monitored loops" copy="No loop in this scope has monitoring enabled." />}
      {k && k.monitored > 0 && (
        <>
          <div className="cpm-op__bar" role="img"
            aria-label={`Monitored loops by state: ${segments.map(s => `${s.label} ${s.count}`).join(', ')}`}>
            {segments.map(s => (
              <span key={s.key} className={`cpm-op__seg cpm-op__seg--${s.key}`} style={{ flexGrow: s.count }}
                title={`${s.label}: ${s.count} of ${k.monitored} (${pct(s.count, k.monitored)} %)`} />
            ))}
          </div>
          <ul className="cpm-op__legend">
            {segments.map(s => (
              <li key={s.key}>
                <span className={`cpm-op__swatch cpm-op__seg--${s.key}`} aria-hidden />
                <RouterLink className="cpm-link" to={kpiHref(s.drill, scope)}
                  title={`List the ${s.count} loop(s): ${s.label.toLowerCase()}`}>
                  {s.label} {s.count}
                </RouterLink>
              </li>
            ))}
          </ul>
          {KPI_GROUPS.map(g => (
            <div key={g.id} className="cpm-op__group">
              <span className="cpm-eyebrow">{g.title}</span>
              <div className={`cpm-op__tiles cpm-op__tiles--${g.id}`}>
                {g.keys.map(key => figures.get(key)).filter(f => f != null).map(f => (
                  <div key={f.key} title={f.rule} className="cpm-op__tile">
                    <KpiTile caption={f.label} tone={kpiTone(f)}
                      value={<>{f.count}<span className="cpm-op__pct">{pct(f.count, f.denominator)} %</span></>}
                      sub={<>{denominatorText(f)}{f.key === 'not-assessable' && f.count > 0 ? <><br />{reasonsText(k)}</> : null}</>}
                      action={f.count > 0 ? (
                        <ObcButton variant="flat" title={`Why: the ${f.count} loop(s) and the value that put each one here`}
                          onClick={() => navigate(kpiHref(f.key, scope))}>
                          Show loops ›
                        </ObcButton>
                      ) : undefined} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="cpm-copy cpm-op__basis">{basisText(k)}. Hover a tile for its rule.</p>
        </>
      )}
    </section>
  );
};

export default OperatingPicture;
