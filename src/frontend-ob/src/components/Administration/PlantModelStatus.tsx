'use client';

/**
 * Plant onboarding status strip — the bootstrap order of
 * docs/ot-data-integration/07 made visible: hierarchy → tags → aliases →
 * loops → ingestion. Each stage shows live counts so anyone can see where the
 * rollout stands without reading the runbook. Stages the current user cannot
 * query (loops need analytics.view, sources need ingestion.view) show "no
 * access" instead of erroring.
 *
 * CHG-172 (owner review, the approved sample, badge 17; owner answer 11): a slim strip above the plant tree, so its counts load
 * with the page (it sat behind a ?, and its five reads started only when the ? opened, reading "…" first). The line "Each stage
 * feeds the next." went: the arrows say it. Placement and tone come from classes, not inline colours.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { listDataSources } from './dataSourcesApi';

const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';

async function countAssets(type: number): Promise<number> {
  const d = await apiJson<{ total: number }>(`${ASSET_API}?type=${type}&take=1`);
  return d.total;
}

type Tone = 'good' | 'warn' | 'muted';

interface Stage {
  n: number;
  title: string;
  value: string;
  detail: string;
  tone: Tone;
}

const TONE_CLASS: Record<Tone, string> = {
  good: 'cpm-admin-stage__value--good',
  warn: 'cpm-admin-stage__value--warn',
  muted: 'cpm-admin-stage__value--muted',
};

export const PlantModelStatus: React.FC = () => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canSeeLoops = hasPermission('analytics.view');
  const canSeeIngestion = hasPermission('ingestion.view');

  const tree = useQuery({
    queryKey: ['plant-model', 'status', 'tree'],
    staleTime: 60_000,
    queryFn: async () => {
      const [sites, areas, units, devices, measurements] =
        await Promise.all([1, 2, 3, 4, 5].map(countAssets));
      return { sites, areas, units, devices, measurements };
    },
  });
  const aliases = useQuery({
    queryKey: ['plant-model', 'status', 'aliases'],
    staleTime: 60_000,
    queryFn: async () => (await apiJson<{ total: number }>('/api/aliases?take=1')).total,
  });
  const loops = useQuery({
    queryKey: ['plant-model', 'status', 'loops'],
    enabled: canSeeLoops,
    staleTime: 60_000,
    queryFn: async () => {
      const d = await apiJson<{ loops: { monitoringEnabled: boolean }[] }>('/api/v1/cpm/loops');
      return { total: d.loops.length, monitored: d.loops.filter(l => l.monitoringEnabled).length };
    },
  });
  const sources = useQuery({
    queryKey: ['plant-model', 'status', 'ingestion'],
    enabled: canSeeIngestion,
    staleTime: 60_000,
    queryFn: async () => (await listDataSources()).length,
  });

  const t = tree.data;
  /**
   * A FAILED read is not a slow one. Every tile below rendered '…' whenever its
   * data was absent, so an unreachable asset-service looked identical to a first
   * load that had not finished — on the one strip whose job is to answer "is the
   * plant model populated?". Failures now say so and keep their own tone, which
   * is the same fix Pipeline Health's "Required jobs" tile needed.
   */
  const val = (q: { isError: boolean }, ready: boolean, text: string) =>
    q.isError ? 'unavailable' : ready ? text : '…';
  const tone = (q: { isError: boolean }, ready: boolean, ok: boolean): Stage['tone'] =>
    q.isError ? 'warn' : ready ? (ok ? 'good' : 'warn') : 'muted';
  const detailOf = (q: { isError: boolean }, normal: string) =>
    q.isError ? 'could not be read' : normal;

  const stages: Stage[] = [
    {
      n: 1, title: 'Hierarchy',
      value: val(tree, !!t, t ? `${t.sites} / ${t.areas} / ${t.units}` : ''),
      detail: detailOf(tree, 'sites / areas / units'),
      tone: tone(tree, !!t, !!t && t.sites > 0 && t.units > 0),
    },
    {
      n: 2, title: 'Instruments & tags',
      value: val(tree, !!t, t ? `${t.devices} / ${t.measurements}` : ''),
      detail: detailOf(tree, 'devices / measurements'),
      tone: tone(tree, !!t, !!t && t.measurements > 0),
    },
    {
      n: 3, title: 'OT aliases',
      value: val(aliases, aliases.data != null, String(aliases.data)),
      detail: detailOf(aliases, 'DCS tag → UNS path'),
      tone: tone(aliases, aliases.data != null, (aliases.data ?? 0) > 0),
    },
    {
      n: 4, title: 'Control loops',
      value: !canSeeLoops ? 'no access'
        : val(loops, !!loops.data, loops.data
          ? `${loops.data.total} (${loops.data.monitored} monitored)` : ''),
      detail: canSeeLoops ? detailOf(loops, 'CPM → Loop Registry') : 'CPM → Loop Registry',
      tone: canSeeLoops ? tone(loops, !!loops.data, (loops.data?.total ?? 0) > 0) : 'muted',
    },
    {
      n: 5, title: 'Ingestion sources',
      value: !canSeeIngestion ? 'no access'
        : val(sources, sources.data != null, String(sources.data)),
      detail: canSeeIngestion
        ? detailOf(sources, 'Administration → Data Sources')
        : 'Administration → Data Sources',
      tone: canSeeIngestion ? tone(sources, sources.data != null, (sources.data ?? 0) > 0) : 'muted',
    },
  ];

  return (
    <section className="cpm-admin-strip" aria-label="Onboarding stages">
      {stages.map((s, i) => (
        <React.Fragment key={s.n}>
          {i > 0 && <span aria-hidden className="cpm-admin-strip__arrow">→</span>}
          <div className="cpm-admin-stage">
            <span className="cpm-admin-stage__title">{s.n} · {s.title}</span>
            <span className={`cpm-admin-stage__value ${TONE_CLASS[s.tone]}`}>{s.value}</span>
            <span className="cpm-admin-stage__detail">{s.detail}</span>
          </div>
        </React.Fragment>
      ))}
    </section>
  );
};

export default PlantModelStatus;
