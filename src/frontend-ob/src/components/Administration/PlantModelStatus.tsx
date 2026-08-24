'use client';

/**
 * Plant onboarding status strip — the bootstrap order of
 * docs/ot-data-integration/07 made visible: hierarchy → tags → aliases →
 * loops → ingestion. Each stage shows live counts so anyone can see where the
 * rollout stands without reading the runbook. Stages the current user cannot
 * query (loops need analytics.view, sources need ingestion.view) show "no
 * access" instead of erroring.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { listDataSources } from './dataSourcesApi';
import { T } from '../../styles/theme';

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

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--alert-running-color)',
  warn: 'var(--alert-caution-color)',
  muted: T.textMuted,
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
  const stages: Stage[] = [
    {
      n: 1, title: 'Hierarchy',
      value: t ? `${t.sites} / ${t.areas} / ${t.units}` : '…',
      detail: 'sites / areas / units',
      tone: t ? (t.sites > 0 && t.units > 0 ? 'good' : 'warn') : 'muted',
    },
    {
      n: 2, title: 'Instruments & tags',
      value: t ? `${t.devices} / ${t.measurements}` : '…',
      detail: 'devices / measurements',
      tone: t ? (t.measurements > 0 ? 'good' : 'warn') : 'muted',
    },
    {
      n: 3, title: 'OT aliases',
      value: aliases.data != null ? String(aliases.data) : '…',
      detail: 'DCS tag → UNS path',
      tone: aliases.data != null ? (aliases.data > 0 ? 'good' : 'warn') : 'muted',
    },
    {
      n: 4, title: 'Control loops',
      value: canSeeLoops
        ? (loops.data ? `${loops.data.total} (${loops.data.monitored} monitored)` : '…')
        : 'no access',
      detail: 'CPM → Loop Registry',
      tone: canSeeLoops ? (loops.data && loops.data.total > 0 ? 'good' : 'warn') : 'muted',
    },
    {
      n: 5, title: 'Ingestion sources',
      value: canSeeIngestion ? (sources.data != null ? String(sources.data) : '…') : 'no access',
      detail: 'Administration → Data Sources',
      tone: canSeeIngestion ? (sources.data != null && sources.data > 0 ? 'good' : 'warn') : 'muted',
    },
  ];

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap',
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: '10px 14px',
    }}>
      {stages.map((s, i) => (
        <React.Fragment key={s.n}>
          {i > 0 && (
            <span aria-hidden style={{ alignSelf: 'center', padding: '0 12px', color: T.textMuted, fontSize: '13px' }}>
              →
            </span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130 }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: T.textMuted, textTransform: 'uppercase' }}>
              {s.n} · {s.title}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: TONE_COLOR[s.tone] }}>{s.value}</span>
            <span style={{ fontSize: '11px', color: T.textSecondary }}>{s.detail}</span>
          </div>
        </React.Fragment>
      ))}
      <span style={{ flex: 1 }} />
      <span style={{ alignSelf: 'center', fontSize: '11px', color: T.textMuted, maxWidth: 260 }}>
        The onboarding order — each stage feeds the next
        (docs/plant-model/production-onboarding-flow.md).
      </span>
    </div>
  );
};

export default PlantModelStatus;
