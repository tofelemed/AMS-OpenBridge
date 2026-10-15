/**
 * KPI Phase 4: the per-loop KPI cards (Loop Explorer) from `GET /loops/{id}/kpi-summary` — pure, tested. Each card is a stored value
 * of the loop's newest window, judged by the ENGINE's own gate where one exists (G0 data, G1 mode, G3 error, G4 effort) or by
 * the fleet KPI thresholds (AUTO ≥ 95 %, at limit ≤ 10 %, completeness ≥ 95 %); values the engine did not store read
 * "not measured", never 0. Error and variability are shown as % of the registered PV span so loops can be compared.
 * Formulas: kpi_calculation_logic/KPI-LOGIC.md section 3.3.
 */
import type React from 'react';
import { ObiAuto } from '@oicl/openbridge-webcomponents-react/icons/icon-auto';
import { ObiLimitsInside } from '@oicl/openbridge-webcomponents-react/icons/icon-limits-inside';
import { ObiLimitsAttention } from '@oicl/openbridge-webcomponents-react/icons/icon-limits-attention';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { ObiLimitsOutsideOver } from '@oicl/openbridge-webcomponents-react/icons/icon-limits-outside-over';
import { ObiBoltGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-bolt-google';
import { ObiSyncGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-sync-google';
import { ObiPlusMinus } from '@oicl/openbridge-webcomponents-react/icons/icon-plus-minus';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import type { LoopKpiMetric, LoopKpis, LoopKpiWindow } from '../../../api/cpm/loopKpis';
import type { CpmTone } from '../shared';
import type { KpiDelta } from './kpiMeta';

export interface LoopKpiCardModel {
  key: string;
  label: string;
  Icon: React.ComponentType;
  value: string;
  sub: string;
  tone: CpmTone;
  delta: KpiDelta | null;
  title: string;
  proof: 'calculations' | 'trend' | 'windows';
  /** CHG-092 (SME 2 #9): the calculation that proves this card (CPLM id), opened directly. */
  metric?: string;
  /** CHG-092 (SME 2 #22): control performance / actuator activity / evidence quality. */
  group: LoopKpiGroup;
  /** The card bears on the loop's current finding (highlighted). */
  relevant: boolean;
}

const NORMAL_MODE_MIN = 0.95;
const SATURATION_MAX = 0.10;
const COMPLETENESS_MIN = 0.95;

const gateTone = (s?: string | null): CpmTone =>
  s === 'PASS' ? 'good' : s === 'WARN' ? 'warn' : s === 'FAIL' ? 'bad' : 'muted';
const gateText = (g: string, s?: string | null) => (s ? `${g} ${s.toLowerCase().replace(/_/g, ' ')}` : `${g} not evaluated`);

const fmt = (v: number, digits = 1) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(digits).replace(/\.0$/, ''));

/** The stored value as shown on the card (fractions as %, span-relative as % of span), or null when not measured. */
function shown(key: string, w: LoopKpiWindow | null, span: number | null): number | null {
  const v = (m: LoopKpiMetric) => w?.values[m] ?? null;
  switch (key) {
    case 'service': return v('auto_pct') != null ? v('auto_pct')! * 100 : null;
    case 'good-error': return v('good_error_pct') != null ? v('good_error_pct')! * 100 : null;
    case 'error': return v('mae') != null && span ? (v('mae')! / span) * 100 : null;
    case 'variability': return v('pv_std') != null && span ? ((2 * v('pv_std')!) / span) * 100 : null;
    case 'saturation': return v('saturation_pct') != null ? v('saturation_pct')! * 100 : null;
    case 'travel': return v('travel_per_day');
    case 'reversals': return v('reversals_per_hour');
    case 'sp': return v('sp_changes_per_h');
    case 'coverage': return v('completeness') != null ? v('completeness')! * 100 : null;
    default: return null;
  }
}

/** Change of the shown value since the window that existed 24 h earlier, green / red by what is better for that KPI. */
function delta(key: string, k: LoopKpis, span: number | null, unit: string, higherIsBetter: boolean | null): KpiDelta | null {
  const now = shown(key, k.current, span);
  const then = shown(key, k.previous, span);
  if (now == null || then == null) return null;
  const d = now - then;
  const step = unit === '%' ? 1 : 0.1;
  const direction = Math.abs(d) < step / 2 ? 'flat' : d > 0 ? 'up' : 'down';
  return {
    points: d, direction,
    good: direction === 'flat' || higherIsBetter == null ? null : (direction === 'up') === higherIsBetter,
    // SME review 2 #13: a % value changes by percentage points (pp); other values in their own unit
    text: `${direction === 'flat' ? '±' : d > 0 ? '+' : '−'}${fmt(Math.abs(d), unit === '%' ? 0 : 1)}${unit === '%' ? ' pp' : unit ? ` ${unit}` : ''}`,
    title: `Change since the window 24 h earlier: ${fmt(then)}${unit === '%' ? ' %' : ` ${unit}`} → ${fmt(now)}${unit === '%' ? ' %' : ` ${unit}`}`
      + (unit === '%' ? ` (${fmt(Math.abs(d), 1)} percentage points ${direction === 'flat' ? 'change' : direction})` : ''),
  };
}

export type LoopKpiGroup = 'control' | 'actuator' | 'evidence';
export const LOOP_KPI_GROUPS: Array<{ id: LoopKpiGroup; title: string }> = [
  { id: 'control', title: 'Control performance' },
  { id: 'actuator', title: 'Actuator activity' },
  { id: 'evidence', title: 'Evidence quality' },
];
const GROUP_OF: Record<string, LoopKpiGroup> = {
  service: 'control', 'good-error': 'control', error: 'control', variability: 'control', sp: 'control',
  saturation: 'actuator', travel: 'actuator', reversals: 'actuator', coverage: 'evidence',
};
/** The cards that bear on each finding family (diagnosis suffix). */
const RELEVANT_TO: Record<string, string[]> = {
  OSCILLATION: ['error', 'variability', 'good-error'],
  FINAL_ELEMENT_NONLINEARITY: ['reversals', 'travel', 'variability'],
  EXCESSIVE_EFFORT: ['travel', 'reversals', 'error'],
};

const METRIC_OF: Record<string, string> = {
  service: 'CPLM-003', 'good-error': 'CPLM-014', error: 'CPLM-010', travel: 'CPLM-021', reversals: 'CPLM-022', coverage: 'CPLM-001',
};

export function loopKpiCards(k: LoopKpis): LoopKpiCardModel[] {
  const w = k.current;
  const g = w?.gates ?? {};
  const pvSpan = k.span?.pvMin != null && k.span?.pvMax != null && k.span.pvMax > k.span.pvMin ? k.span.pvMax - k.span.pvMin : null;
  const unit = k.span?.pvUnit ?? '';
  const raw = (m: LoopKpiMetric) => w?.values[m] ?? null;
  // CHG-092 (SME 2 #22): a gate PASS is green only when the window has no finding; beside a finding it is context
  const finding = /^(DETECTED|CLASSIFIED|SUSPECTED|CONFIRMED)_(.+)$/.exec((w?.diagnosis ?? '').toUpperCase());
  const relevantKeys = new Set(finding ? RELEVANT_TO[finding[2]] ?? [] : []);
  const passTone = (s?: string | null): CpmTone => (s === 'PASS' ? (finding ? 'muted' : 'good') : gateTone(s));
  const card = (c: Omit<LoopKpiCardModel, 'delta' | 'value' | 'group' | 'relevant'> & { unit: string; higherIsBetter: boolean | null; digits?: number },
    tone?: CpmTone): LoopKpiCardModel => {
    const v = shown(c.key, w, pvSpan);
    return {
      key: c.key, label: c.label, Icon: c.Icon, sub: v == null ? (c.key === 'error' || c.key === 'variability') && !pvSpan ? 'no PV span registered' : 'not measured in this window' : c.sub,
      tone: v == null ? 'muted' : tone ?? c.tone, title: c.title, proof: c.proof, metric: METRIC_OF[c.key],
      group: GROUP_OF[c.key] ?? 'control', relevant: relevantKeys.has(c.key) || (c.key === 'saturation' && (raw('saturation_pct') ?? 0) > SATURATION_MAX),
      value: v == null ? '—' : `${fmt(v, c.digits ?? 1)}${c.unit === '%' ? ' %' : c.unit ? ` ${c.unit}` : ''}`,
      delta: delta(c.key, k, pvSpan, c.unit, c.higherIsBetter),
    };
  };
  const auto = raw('auto_pct');
  const sat = raw('saturation_pct');
  const comp = raw('completeness');
  return [
    card({ key: 'service', label: 'Time in normal mode', Icon: ObiAuto, unit: '%', higherIsBetter: true, digits: 0, tone: 'muted', proof: 'trend',
      sub: `AUTO / CASCADE · rule ≥ 95 % · ${gateText('G1', g.G1)}`,
      title: 'Service factor: time in AUTO or CASCADE ÷ window time (G1, CPLM-003). More than 5 % out of design mode counts as out of mode.' },
      auto == null ? undefined : auto >= NORMAL_MODE_MIN ? 'good' : 'warn'),
    card({ key: 'good-error', label: 'Good-error time', Icon: ObiLimitsInside, unit: '%', higherIsBetter: true, digits: 0, tone: passTone(g.G3),
      proof: 'calculations', sub: `|PV − SP| inside the good band · ${gateText('G3', g.G3)}`,
      title: 'Time with |PV − SP| inside the good-error band ÷ window time (CPLM-014), judged by G3.' }),
    card({ key: 'error', label: 'Control error (MAE)', Icon: ObiLimitsAttention, unit: '%', higherIsBetter: false, tone: passTone(g.G3),
      proof: 'calculations',
      sub: `of PV span${raw('mae') != null ? ` · ${fmt(raw('mae')!, 2)}${unit ? ` ${unit}` : ''}` : ''} · ${gateText('G3', g.G3)}`,
      title: 'Mean |PV − SP| over the window (CPLM-010) as % of the registered PV span (pvMax − pvMin), judged by G3.' }),
    card({ key: 'variability', label: 'PV variability (2σ)', Icon: ObiTrend, unit: '%', higherIsBetter: false, tone: 'muted', proof: 'trend',
      sub: `of PV span${raw('pv_std') != null ? ` · σ ${fmt(raw('pv_std')!, 2)}${unit ? ` ${unit}` : ''}` : ''}`,
      title: '2 × standard deviation of PV over the window as % of the PV span. Context, not pass / fail: level loops absorb swings by design.' }),
    card({ key: 'saturation', label: 'Time at an OP limit', Icon: ObiLimitsOutsideOver, unit: '%', higherIsBetter: false, digits: 0, tone: 'muted',
      proof: 'trend', sub: `rule ≤ 10 % · limits: ${w?.limitSource === 'FALLBACK_0_100' ? '0–100 % fallback' : w?.limitSource ? 'registered OP range' : 'not reported'}`,
      title: 'Time with OP fully open or closed ÷ window time. More than 10 % = no control authority (Bayer / PlantTriage).' },
      // within the limit is context (neutral), not a green verdict; over it needs a look
      sat == null ? undefined : sat > SATURATION_MAX ? 'warn' : 'muted'),
    card({ key: 'travel', label: 'OP travel', Icon: ObiBoltGoogle, unit: '%/day', higherIsBetter: false, digits: 0, tone: passTone(g.G4),
      proof: 'calculations', sub: `total OP movement per day · ${gateText('G4', g.G4)}`,
      title: 'Sum of |ΔOP| scaled to one day (CPLM-021): valve wear, judged by G4.' }),
    card({ key: 'reversals', label: 'OP reversals', Icon: ObiSyncGoogle, unit: '/h', higherIsBetter: false, tone: passTone(g.G4),
      proof: 'calculations', sub: `direction changes per hour · ${gateText('G4', g.G4)}`,
      title: 'OP direction changes per hour (CPLM-022): valve wear, judged by G4.' }),
    card({ key: 'sp', label: 'Setpoint changes', Icon: ObiPlusMinus, unit: '/h', higherIsBetter: null, tone: 'muted', proof: 'trend',
      sub: 'operator / cascade setpoint activity',
      title: 'Setpoint changes per hour in the window. Context: frequent changes point at an operator compensating or a cascade master.' }),
    card({ key: 'coverage', label: 'Data coverage', Icon: ObiDatabase, unit: '%', higherIsBetter: true, digits: 0, tone: 'muted', proof: 'windows',
      sub: `${raw('sample_count') != null && raw('expected_sample_count') != null ? `${Math.round(raw('sample_count')!)} of ${Math.round(raw('expected_sample_count')!)} samples · ` : ''}${gateText('G0', g.G0)}`,
      title: 'Samples received ÷ samples expected on the declared grid (CPLM-001). Below 95 % the window cannot be judged (G0).' },
      // data present is not good control: neutral when complete, amber when the window cannot be fully judged
      comp == null ? undefined : comp >= COMPLETENESS_MIN ? 'muted' : 'warn'),
  ];
}
