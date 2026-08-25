'use client';

/**
 * Explorer › Calculations. The latest fused window's gate outcomes.
 *
 * Grouped by tier (Eligibility / Performance / Diagnostic evidence /
 * Confirmation / Fusion) using the same `buildTierGroups` the Performance matrix
 * uses. It was previously a flat list of 17 rows — same gates, same engineer,
 * two different structures on two screens.
 *
 * Tone comes from `gateTone`, not `toneFor`: the two disagreed on EXCLUDED and
 * STRONG, so this tab used to colour G1 amber while the Performance matrix
 * coloured the same gate, same window, red.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { useLatestGates } from '../../../hooks/useCpm';
import { ApiError } from '../../../api/apiFetch';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill } from '../shared';
import { buildTierGroups, gateTone } from '../gateStatus';

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

export const CalculationsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loop.loopId, '24h');
  const cells = React.useMemo(() => gates.data?.gates ?? [], [gates.data]);

  const tiers = React.useMemo(() => {
    const byKey = new Map(cells.map(c => [c.key, c]));
    return buildTierGroups(cells.map(c => c.key))
      .map(g => ({ label: g.label, cells: g.keys.map(k => byKey.get(k)!).filter(Boolean) }))
      .filter(g => g.cells.length > 0);
  }, [cells]);

  return (
    <div>
      <PanelHead
        eyebrow="Latest fused window"
        title="Gate outcomes"
        right={
          <ObcButton variant="raised"
            onClick={() => navigate(`/cpm/calculations?loop=${encodeURIComponent(loop.loopId)}`)}>
            Full catalogue ›
          </ObcButton>
        }
      />
      {gates.isLoading && <EmptyState title="Loading…" />}
      {gates.isError && !isNoVerdictYet(gates.error) && (
        <QueryError title="Gate outcomes unavailable"
          error={gates.error} retry={() => void gates.refetch()} />
      )}
      {!gates.isLoading && !gates.data && (!gates.isError || isNoVerdictYet(gates.error)) && (
        <EmptyState title="No fused verdict yet"
          copy="Gate outcomes appear once a 12h window of samples has been evaluated." />
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
    </div>
  );
};

export default CalculationsTab;
