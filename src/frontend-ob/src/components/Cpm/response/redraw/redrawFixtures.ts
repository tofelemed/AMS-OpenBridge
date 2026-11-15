// CHG-198 test fixtures: a CHG-197 event fixture as the historian would answer for it (one point per sample, epoch ms, PV, SP and
// OP), so a redraw can be checked against the same engine values the stored charts carry.
import type { CpmTrendPoint } from '../../../../api/cpm/kpis';
import type { EventFixture } from '../trends/trendFixtures';

/** The fixture's samples as historian points; `sp` gives the setpoint of each sample (epoch s). */
export function historianPoints(e: EventFixture, sp: (tS: number) => number): CpmTrendPoint[] {
  const pv = e.byKind.accepted_samples[0];
  const u = e.byKind.input_reconstruction?.[0];
  const out: CpmTrendPoint[] = [];
  for (let i = 0; i < pv.n; i++) {
    const tS = pv.columns.x[i];
    out.push({ ts: Math.round(tS * 1000), pv: pv.columns.y[i], sp: sp(tS), op: u ? u.columns.y[i] : null });
  }
  return out;
}
