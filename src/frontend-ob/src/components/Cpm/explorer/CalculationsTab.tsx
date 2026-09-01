'use client';

/**
 * Explorer › Calculations. Gate outcomes and per-window feature values, at a
 * window size the USER chooses — the tab previously hardcoded '24h' (and its
 * empty-state prose said "12h", contradicting its own query; audit.md §4.2).
 *
 * The selector is driven by the served window contract (`/cpm/resolutions`):
 * fused kinds come from `fusion.firesOn` (gate verdicts exist only there), and
 * the short kinds surface the per-window features + G0–G4/G2r verdicts that
 * fusion never covers.
 *
 * Tone comes from `gateTone`, not `toneFor`: the two disagreed on EXCLUDED and
 * STRONG, so this tab used to colour G1 amber while the Performance matrix
 * coloured the same gate, same window, red.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmKpis, useCpmResolutions, useLatestGates } from '../../../hooks/useCpm';
import { ApiError } from '../../../api/apiFetch';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill, fmtWindowShape, windowSpecsOf } from '../shared';
import { buildTierGroups, gateTone } from '../gateStatus';
import { WindowResultsPanel } from '../windows/WindowResults';

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

const FusedGates: React.FC<{ loop: CpmLoop; windowKind: string; firesOnLabel: string }> = ({
  loop, windowKind, firesOnLabel,
}) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loop.loopId, windowKind);
  const cells = React.useMemo(() => gates.data?.gates ?? [], [gates.data]);

  const tiers = React.useMemo(() => {
    const byKey = new Map(cells.map(c => [c.key, c]));
    return buildTierGroups(cells.map(c => c.key))
      .map(g => ({ label: g.label, cells: g.keys.map(k => byKey.get(k)!).filter(Boolean) }))
      .filter(g => g.cells.length > 0);
  }, [cells]);

  return (
    <>
      {gates.isLoading && <EmptyState title="Loading…" />}
      {gates.isError && !isNoVerdictYet(gates.error) && (
        <QueryError title="Gate outcomes unavailable"
          error={gates.error} retry={() => void gates.refetch()} />
      )}
      {!gates.isLoading && !gates.data && (!gates.isError || isNoVerdictYet(gates.error)) && (
        <EmptyState title={`No fused ${windowKind} verdict yet`}
          copy={`Fusion fires on ${firesOnLabel} windows; outcomes appear once one has been evaluated.`} />
      )}
      {tiers.map(tier => (
        <section key={tier.label} className="cpm-gate-tier">
          <h3 className="cpm-gate-tier__label">{tier.label}</h3>
          {tier.cells.map(g => (
            <KvRow key={g.key} label={`${g.key} · ${g.name}`}>
              {/* A failing gate here used to be a dead end; the Replay deep link
                  is the same evidence route the Performance panel offers. */}
              <button
                type="button"
                className="cpm-gate-outcome"
                aria-label={`Open ${g.key} evidence in Evidence Replay`}
                onClick={() => navigate(
                  `/cpm/replay?loop=${encodeURIComponent(loop.loopId)}&gate=${encodeURIComponent(g.key)}`)}
              >
                <TonePill tone={gateTone(g.status)}>{g.status.replace(/_/g, ' ')}</TonePill>
              </button>
            </KvRow>
          ))}
        </section>
      ))}
    </>
  );
};

const ShortWindowLatest: React.FC<{ loop: CpmLoop; windowKind: string }> = ({ loop, windowKind }) => {
  const navigate = useNavigate();
  const kpis = useCpmKpis(loop.loopId, windowKind, 1);
  const row = kpis.data?.samples?.[0];
  return (
    <>
      {kpis.isLoading && <EmptyState title="Loading…" />}
      {kpis.isError && (
        <QueryError title="Window results unavailable"
          error={kpis.error} retry={() => void kpis.refetch()} />
      )}
      {!kpis.isLoading && !kpis.isError && !row && (
        <EmptyState title={`No ${windowKind} windows stored yet`}
          copy="Rows appear as the short-feature engine emits results at this granularity." />
      )}
      {row && <WindowResultsPanel row={row} tier="short" bare />}
      <div className="cpm-filter-row" style={{ marginTop: 8 }}>
        <ObcButton variant="normal"
          onClick={() => navigate(
            `/cpm/windows?loop=${encodeURIComponent(loop.loopId)}&profile=${encodeURIComponent(windowKind)}`)}>
          Window history in Inspector ›
        </ObcButton>
      </div>
    </>
  );
};

export const CalculationsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const navigate = useNavigate();
  const resolutions = useCpmResolutions();
  const firesOn = resolutions.data?.fusion.firesOn ?? ['12h', '24h'];
  const specs = windowSpecsOf(resolutions.data, () => 0);
  const shortSpecs = specs.filter(w => w.tier === 'short');
  // Default = the largest fusion window (the richest verdict), from the served
  // contract — not a hardcoded literal.
  const [windowKind, setWindowKind] = React.useState<string | null>(null);
  const active = windowKind ?? firesOn[firesOn.length - 1] ?? '24h';
  const isFused = firesOn.includes(active);
  const firesOnLabel = firesOn.join(' / ');

  return (
    <div>
      <PanelHead
        eyebrow={isFused ? `Latest fused ${active} window` : `Latest ${active} short window`}
        title={isFused ? 'Gate outcomes' : 'Per-window features'}
        right={
          <div className="cpm-filter-row">
            <label className="cpm-field">
              <span className="cpm-field__label">Window</span>
            <select className="cpm-select" value={active} onChange={e => setWindowKind(e.target.value)}>
              <optgroup label={`Fused verdict (fires on ${firesOnLabel})`}>
                {firesOn.map(k => <option key={k} value={k}>{k} — fused G0–G15</option>)}
              </optgroup>
              <optgroup label="Short features (G0–G4)">
                {shortSpecs.map(w => {
                  const shape = fmtWindowShape(w);
                  return <option key={w.kind} value={w.kind}>{w.kind}{shape ? ` — ${shape}` : ''}</option>;
                })}
              </optgroup>
            </select>
            </label>
            <ObcButton variant="raised"
              onClick={() => navigate(`/cpm/calculations?loop=${encodeURIComponent(loop.loopId)}`)}>
              Full catalogue ›
            </ObcButton>
          </div>
        }
      />
      {isFused
        ? <FusedGates loop={loop} windowKind={active} firesOnLabel={firesOnLabel} />
        : <ShortWindowLatest loop={loop} windowKind={active} />}
    </div>
  );
};

export default CalculationsTab;
