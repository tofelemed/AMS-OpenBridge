'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry.
 * CPA-prototype IA parity: registry table + profile detail aside + 5-step
 * add-loop wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError, TonePill, WorkspaceHeader } from './shared';
import { useCpmLoops } from '../../hooks/useCpm';
import type { CpmLoop } from '../../api/cpmApi';
import { PlantScopeFilter, useCpmScope, loopMatchesQuery } from './plantScope';

import { dynamicClassOf, stateOf } from './registryShared';
import ProfileAside from './ProfileAside';
import AddLoopWizard from './AddLoopWizard';
import BulkImportDialog from './BulkImportDialog';

// ── screen ──

export const LoopRegistry: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('loop') ?? '';
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editLoop, setEditLoop] = useState<CpmLoop | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);

  // A4: scope cascade AND free-text, intersected — search used to match only
  // id/name/area, so a unit or loop type could not be found at all.
  const scope = useCpmScope();
  const filtered = useMemo(
    () => loops.filter(l => scope.matches(l) && loopMatchesQuery(l, search)),
    [loops, search, scope]);

  // Case-insensitive, like every loop lookup in cplm-api.
  const selected = loops.find(l => l.loopId.toLowerCase() === selectedId.toLowerCase()) ?? filtered[0];

  // Page the registry list so a large fleet isn't one long scroll. Selection still
  // resolves against the full list so the detail aside works across pages.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, scope.site, scope.area, scope.unit]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedLoops = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Governed engineering configuration"
        title="Loop registry"
        copy="Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately; the readiness report is the activation gate."
        actions={
          <>
            <ObcButton variant="normal" onClick={() => setImportOpen(true)}>Bulk import</ObcButton>
            <ObcButton variant="raised" onClick={() => setWizardOpen(true)}>Add loop</ObcButton>
          </>
        }
      />

      <div className="cpm-banner">
        <strong>Readiness-gated configuration.</strong>&nbsp;A loop is only as good as its
        signal mappings: missing VP caps confidence at 0.89, and missing peer links leaves
        G13 unevaluated. The readiness report after save lists exactly what is degraded.
      </div>

      <PlantScopeFilter scope={scope}
        summary={scope.active ? `${filtered.length} of ${loops.length} loops` : null} />

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead
            eyebrow="Registered assets"
            title={`${filtered.length} control-loop records`}
            right={
              <input
                className="cpm-input"
                placeholder="Find by loop, service, area, unit or type"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            }
          />
          <div className="cpm-reg-head">
            <span>Loop / service</span><span>Dynamic class (derived)</span><span>Type</span>
            <span>VP</span><span>Profile</span><span>State</span>
          </div>
          {isLoading && <EmptyState title="Loading registry…" />}
          {isError && <QueryError title="Registry unavailable" error={error} retry={() => void refetch()} />}
          {!isLoading && !isError && filtered.length === 0 && (
            <EmptyState
              title="No loops registered"
              copy="Onboard the first loop to start producing diagnoses."
              action={{ label: 'Add loop', onClick: () => setWizardOpen(true) }}
            />
          )}
          {pagedLoops.map(loop => {
            const st = stateOf(loop);
            return (
              <div
                key={loop.loopId}
                className={`cpm-reg-row${selected?.loopId === loop.loopId ? ' cpm-reg-row--selected' : ''}`}
                onClick={() => setParams(p => { p.set('loop', loop.loopId); return p; }, { replace: true })}
                role="button"
                tabIndex={0}
                aria-pressed={selected?.loopId === loop.loopId}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setParams(p => { p.set('loop', loop.loopId); return p; }, { replace: true });
                  }
                }}
              >
                <span>
                  <strong>{loop.loopId}</strong>
                  <div className="cpm-event-row__sub">{loop.displayName} · {loop.area ?? loop.site}</div>
                </span>
                <span>{dynamicClassOf(loop)}</span>
                <span>{loop.loopType}</span>
                <span>{loop.tags['VP'] ? 'AVAILABLE' : 'NOT MAPPED'}</span>
                <span>{loop.thresholdProfileId ?? '—'}</span>
                <TonePill tone={st.tone}>{st.label}</TonePill>
              </div>
            );
          })}
          {pageCount > 1 && (
            <div className="cpm-pager">
              <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</ObcButton>
              <span className="cpm-event-row__sub">Page {safePage + 1} of {pageCount}</span>
              <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Next →</ObcButton>
            </div>
          )}
        </section>

        {selected
          ? <ProfileAside loop={selected} onEdit={() => setEditLoop(selected)} />
          : <section className="cpm-surface"><EmptyState title="Select a loop" /></section>}
      </div>

      {wizardOpen && <AddLoopWizard existing={loops} onClose={() => setWizardOpen(false)} />}
      {editLoop && <AddLoopWizard existing={loops} editLoop={editLoop} onClose={() => setEditLoop(null)} />}
      {importOpen && <BulkImportDialog existing={loops} onClose={() => setImportOpen(false)} />}
    </div>
  );
};

export default LoopRegistry;
