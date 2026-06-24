import React, { useEffect } from 'react';

export type ReadinessSubsystemDetail = {
  id: string;
  label: string;
  score: number;
  weightPercent: number;
  status: 'OK' | 'WARN' | 'FAIL' | string;
  detail: string;
  actionHint?: string | null;
};

export type ReadinessChangeSummary = {
  previousScore?: number | null;
  scoreDelta: number;
  lastPassAtUtc?: string | null;
  regressions: string[];
};

export type ReadinessTimelinePoint = {
  atUtc: string;
  score: number;
  gateStatus: string;
};

export type ReadinessHealth = {
  overallScore: number;
  cutoverThreshold: number;
  recommendation: string;
  gateStatus: string;
  blockers?: string[];
  subsystemDetails?: ReadinessSubsystemDetail[];
  change?: ReadinessChangeSummary | null;
  timeline?: ReadinessTimelinePoint[];
};

export type OperatorPipelineHealth = {
  kafka: { lag: number; throughput: number; brokerHealth: string };
  flink: {
    checkpointLatencyMs: number; restartCount: number; watermarkDelayMs: number; backpressure: string; status: string;
    operatorActionsProcessed?: number; ackResultsProcessed?: number; rawAlarmsProcessed?: number;
    recordsReceived?: number; recordsSent?: number;
    operators?: { name: string; recordsIn: number; recordsOut: number }[];
  };
  streampipes: {
    reachable: boolean; status: string; uiUrl: string;
    readinessState?: string; secondsSinceLastIngest?: number | null;
    stallThresholdSeconds?: number; ingestExpected?: boolean; detail?: string;
  };
  opcConnections: { activeConnections: number; totalEnabled: number; status: string };
  postgres: { queryLatencyMs: number; connectionPoolUsage: number };
  signalr: { connectedClients: number; status: string };
  telemetryIngest?: { state: string; secondsSinceLastEvent?: number | null; totalEventsObserved: number };
  readiness?: ReadinessHealth;
};

type Props = {
  open: boolean;
  pipeline: OperatorPipelineHealth | null;
  onClose: () => void;
};

const gateColor = (gate: string) =>
  gate === 'PASS' ? 'var(--color-success)' : gate === 'WARN' ? '#ffc107' : 'var(--alarm-critical)';

const statusColor = (status: string) =>
  status === 'OK' ? 'var(--color-success)' : status === 'WARN' ? '#ffc107' : 'var(--alarm-critical)';

export const OperatorControlCenter: React.FC<Props> = ({ open, pipeline, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const readiness = pipeline?.readiness;
  const gate = readiness?.gateStatus ?? '—';
  const blockers = readiness?.blockers ?? [];
  const details = readiness?.subsystemDetails ?? [];
  const change = readiness?.change;
  const timeline = readiness?.timeline ?? [];

  return (
    <div className="occ-overlay" onClick={onClose} role="presentation">
      <div
        className="occ-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="occ-title"
        aria-modal="true"
      >
        <header className="occ-header">
          <div>
            <h2 id="occ-title" className="occ-title">Operator Control Center</h2>
            <p className="occ-subtitle">Why not green? · What broke? · What changed?</p>
          </div>
          <button type="button" className="btn btn--ghost btn--icon occ-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section className="occ-section">
          <div className="occ-score-row">
            <div className="occ-score" style={{ color: gateColor(gate) }}>
              {readiness?.overallScore ?? '—'}
              <span className="occ-score-threshold">/ {readiness?.cutoverThreshold ?? 85}</span>
            </div>
            <div className="occ-gate" style={{ borderColor: gateColor(gate), color: gateColor(gate) }}>
              {gate}
            </div>
          </div>
          <p className="occ-recommendation">{readiness?.recommendation ?? 'Loading readiness…'}</p>
        </section>

        {gate !== 'PASS' && blockers.length > 0 && (
          <section className="occ-section">
            <h3 className="occ-section-title">Why am I not green?</h3>
            <ul className="occ-blockers">
              {blockers.map(b => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        )}

        {details.length > 0 && (
          <section className="occ-section">
            <h3 className="occ-section-title">Subsystem scores</h3>
            <div className="occ-subsystems">
              {details.map(s => (
                <div key={s.id} className="occ-subsystem">
                  <div className="occ-subsystem-head">
                    <span>{s.label}</span>
                    <span style={{ color: statusColor(s.status) }}>
                      {s.score} <span className="occ-weight">({s.weightPercent}%)</span>
                    </span>
                  </div>
                  <div className="occ-bar-track">
                    <div
                      className="occ-bar-fill"
                      style={{
                        width: `${Math.min(100, s.score)}%`,
                        background: statusColor(s.status),
                      }}
                    />
                  </div>
                  <p className="occ-detail">{s.detail}</p>
                  {s.actionHint && <p className="occ-hint">→ {s.actionHint}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="occ-section">
          <h3 className="occ-section-title">Pipeline context</h3>
          <div className="occ-context-grid">
            <div className="occ-context-item">
              <span className="occ-context-label">Alarm API</span>
              <span>{pipeline?.streampipes?.readinessState ?? pipeline?.streampipes?.status ?? '—'}</span>
              {pipeline?.streampipes?.detail && (
                <span className="occ-context-detail">{pipeline.streampipes.detail}</span>
              )}
            </div>
            <div className="occ-context-item">
              <span className="occ-context-label">Telemetry ingest</span>
              <span>{pipeline?.telemetryIngest?.state ?? '—'}</span>
              {pipeline?.telemetryIngest?.secondsSinceLastEvent != null && (
                <span className="occ-context-detail">
                  Last event {Math.round(pipeline.telemetryIngest.secondsSinceLastEvent)}s ago
                  · {pipeline.telemetryIngest.totalEventsObserved} total
                </span>
              )}
            </div>
            <div className="occ-context-item">
              <span className="occ-context-label">Kafka</span>
              <span>{pipeline?.kafka?.brokerHealth ?? '—'} · lag {pipeline?.kafka?.lag ?? 0}</span>
            </div>
            <div className="occ-context-item">
              <span className="occ-context-label">Flink</span>
              <span>
                {pipeline?.flink?.status ?? '—'}
                {pipeline?.flink?.restartCount ? ` · ${pipeline.flink.restartCount} restarts` : ''}
              </span>
              {(pipeline?.flink?.recordsReceived ?? 0) > 0 && (
                <span className="occ-context-detail">
                  In {pipeline!.flink!.recordsReceived} · Out {pipeline!.flink!.recordsSent}
                  · raw-alarms {pipeline!.flink!.rawAlarmsProcessed ?? 0}
                </span>
              )}
            </div>
            {(pipeline?.flink?.operators?.length ?? 0) > 0 && (
              <div className="occ-context-item" style={{ gridColumn: '1 / -1' }}>
                <span className="occ-context-label">Flink operators</span>
                <span className="occ-context-detail">
                  {pipeline!.flink!.operators!.map(op =>
                    `${op.name}: in ${op.recordsIn} / out ${op.recordsOut}`
                  ).join(' · ')}
                </span>
              </div>
            )}
            <div className="occ-context-item">
              <span className="occ-context-label">OPC</span>
              <span>
                {pipeline?.opcConnections?.activeConnections ?? 0}/
                {pipeline?.opcConnections?.totalEnabled ?? 0} connected
              </span>
            </div>
          </div>
        </section>

        {(change?.lastPassAtUtc || (change?.regressions?.length ?? 0) > 0 || timeline.length > 1) && (
          <section className="occ-section">
            <h3 className="occ-section-title">What changed since last good state?</h3>
            {change?.lastPassAtUtc && (
              <p className="occ-detail">Last PASS: {new Date(change.lastPassAtUtc).toLocaleString()}</p>
            )}
            {change?.previousScore != null && (
              <p className="occ-detail">
                Score {change.previousScore} → {readiness?.overallScore ?? '—'}
                {' '}
                ({change.scoreDelta >= 0 ? '+' : ''}{change.scoreDelta})
              </p>
            )}
            {(change?.regressions?.length ?? 0) > 0 && (
              <ul className="occ-blockers occ-blockers--warn">
                {change!.regressions.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {timeline.length > 1 && (
              <div className="occ-timeline">
                {timeline.slice(-8).map((p, i) => (
                  <div key={`${p.atUtc}-${i}`} className="occ-timeline-point" title={p.atUtc}>
                    <div
                      className="occ-timeline-bar"
                      style={{
                        height: `${Math.max(8, p.score * 0.5)}px`,
                        background: gateColor(p.gateStatus),
                      }}
                    />
                    <span className="occ-timeline-score">{p.score}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="occ-footer">
          <span className="occ-footer-note">Refreshes every 10s with pipeline health probe</span>
          {pipeline?.streampipes?.uiUrl && (
            <a
              href={pipeline.streampipes.uiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost"
            >
              API Feed Status
            </a>
          )}
        </footer>
      </div>
    </div>
  );
};
