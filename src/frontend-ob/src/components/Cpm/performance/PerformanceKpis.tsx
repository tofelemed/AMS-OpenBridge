'use client';

/**
 * The four fleet tiles of Performance: Good-error time, Median error, Periodic diagnosis, Diagnostic capability.
 * A tile is the figure and one short line. It opens a dialog with the basis (how many loops contribute, what was left out),
 * the long sentence, and "Show the loops": the drill-down that lists the loops behind the number.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { FleetKpiKey, FleetPerformance } from '../../../api/cpm/fleetKpis';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { kpiHref } from '../cpaHref';
import { KpiTile, type CpmTone } from '../shared';
import { basisLines, capabilityTile, headlineTiles } from '../performanceHeadline';

interface Tile { key: string; caption: string; value: string; sub: string; tone: CpmTone; drill: FleetKpiKey; lines: string[]; explain: string }

export const PerformanceKpis: React.FC<{
  performance?: FleetPerformance;
  failed?: boolean;
  fleetTotal: number | null;
  capability?: CpmFleetSummary['capability'];
  scope: { site?: string; area?: string; unit?: string };
  windowKind: string;
  /** The instrument-health filter narrows the list, not these scope-wide figures. */
  healthFiltered: boolean;
}> = ({ performance, failed, fleetTotal, capability, scope, windowKind, healthFiltered }) => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState<string | null>(null);

  const headline: Tile[] = performance ? headlineTiles(performance).map(t => ({
    key: t.key, caption: t.caption, value: t.value, sub: t.sub, drill: t.drill, explain: t.title,
    // CHG-093: these are fleet context, not a verdict, so neutral; periodic is the one that asks for a look
    tone: t.key === 'periodic' && t.value !== '0' ? 'warn' : 'muted',
    lines: basisLines(performance, t.counted, t.notCounted),
  })) : [];
  const cap = capabilityTile(fleetTotal, capability);
  const tiles: Tile[] = [...headline, { key: 'capability', caption: 'Diagnostic capability', value: cap.value, sub: cap.sub,
    tone: cap.tone, drill: cap.drill, lines: [], explain: cap.title }];
  const current = tiles.find(t => t.key === open);

  return (
    <div className="cpm-kpi-row">
      {!performance && (
        <KpiTile caption="Good-error time" value="—" sub={failed ? 'could not be read' : 'loading…'} />
      )}
      {tiles.map(t => (
        <button key={t.key} type="button" className={`cpm-kpi cpm-kpi--${t.tone} cpm-kpi--open`}
          aria-haspopup="dialog" onClick={() => setOpen(t.key)}>
          <span className="cpm-kpi__caption">{t.caption}</span>
          <span className="cpm-kpi__value">{t.value}</span>
          <span className="cpm-kpi__sub">{t.sub}</span>
        </button>
      ))}
      <Dialog open={current != null} title={current?.caption ?? ''} onClose={() => setOpen(null)}
        footer={current && (
          <ObcButton variant="flat" onClick={() => navigate(kpiHref(current.drill, { ...scope, windowKind }))}>Show the loops</ObcButton>
        )}>
        {current && (
          <>
            {current.lines.map(l => <p key={l} className="cpm-copy">{l}</p>)}
            <p className="cpm-copy">{current.explain}</p>
            {healthFiltered && <p className="cpm-copy">The health filter does not narrow this figure: it counts the whole scope.</p>}
          </>
        )}
      </Dialog>
    </div>
  );
};

export default PerformanceKpis;
