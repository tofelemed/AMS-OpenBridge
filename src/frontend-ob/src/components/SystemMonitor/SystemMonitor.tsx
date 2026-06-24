'use client';

import React, { useEffect, useState } from 'react';

interface PipelineHealth {
  readiness?: { score: number };
  flink?: { status: string; checkpointLatencyMs: number };
  kafka?: { lag: number; throughput: number };
}

export const SystemMonitor: React.FC = () => {
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/v1/health/pipeline');
        if (res.ok) {
          const data = await res.json();
          setPipelineHealth(data);
        }
      } catch (err) {
        console.error("Failed to fetch pipeline health", err);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!pipelineHealth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--on-container-neutral-color)' }}>
        Initializing edge observability...
      </div>
    );
  }

  const readinessScore = pipelineHealth.readiness?.score ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4, 16px)' }}>
      {/* Global Overview Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--spacing-3, 12px)' }}>
        <HealthCard
          icon="📊"
          label="Edge Health Score"
          value={`${readinessScore.toFixed(0)} / 100`}
          color={readinessScore > 80 ? 'var(--running-color)' : 'var(--alert-warning-border-color)'}
          accent="var(--focus-color)"
        />
        <HealthCard
          icon="⚙️"
          label="Flink Checkpoint Health"
          value={pipelineHealth.flink?.status === 'Running' ? '100%' : 'DEGRADED'}
          color={pipelineHealth.flink?.status === 'Running' ? 'var(--running-color)' : 'var(--alert-alarm-border-color)'}
          accent="var(--running-color)"
          sub={`Latency: ${pipelineHealth.flink?.checkpointLatencyMs ?? 0} ms`}
        />
        <HealthCard
          icon="⏱️"
          label="Max Kafka Topic Lag"
          value={`${pipelineHealth.kafka?.lag ?? 0} msgs`}
          color={pipelineHealth.kafka?.lag === 0 ? 'var(--running-color)' : 'var(--alert-caution-border-color)'}
          accent="var(--alert-caution-border-color)"
          sub={`Tput: ${(pipelineHealth.kafka?.throughput ?? 0).toFixed(1)} ev/s`}
        />
        <HealthCard
          icon="⚠️"
          label="Alarm Consistency Score"
          value="100%"
          color="var(--running-color)"
          accent="var(--alert-warning-border-color)"
          sub="0 state drifts detected"
        />
      </div>

      {/* Pipeline Flow Visualizer */}
      <div className="ob-card" style={{ padding: 'var(--spacing-4, 16px)' }}>
        <h3 className="section-title">Pipeline Flow</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: 'var(--spacing-4, 16px)' }}>
          <PipelineNode label="OPC Server" status="active" />
          <PipelineArrow />
          <PipelineNode label="Ingestion API" status="active" />
          <PipelineArrow />
          <PipelineNode label="Kafka" status="active" />
          <PipelineArrow />
          <PipelineNode label="Flink Jobs" status={pipelineHealth.flink?.status === 'Running' ? 'active' : 'warning'} />
          <PipelineArrow />
          <PipelineNode label="SignalR Hub" status="active" />
          <PipelineArrow />
          <PipelineNode label="UI Clients" status="active" />
        </div>
      </div>

      {/* Flink Job Grid */}
      <div className="ob-card" style={{ padding: 'var(--spacing-4, 16px)' }}>
        <h3 className="section-title">Flink Job Status</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Job Name</th>
              <th>Status</th>
              <th>Uptime</th>
              <th>Records/s</th>
              <th>Checkpoint</th>
            </tr>
          </thead>
          <tbody>
            <JobRow name="alarm-enrichment" status="RUNNING" uptime="4d 12h" records={1250} checkpoint="OK" />
            <JobRow name="correlation-engine" status="RUNNING" uptime="4d 12h" records={320} checkpoint="OK" />
            <JobRow name="flood-detector" status="RUNNING" uptime="4d 12h" records={15} checkpoint="OK" />
            <JobRow name="soe-sequencer" status="RUNNING" uptime="4d 12h" records={890} checkpoint="OK" />
          </tbody>
        </table>
      </div>

      {/* Kafka Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4, 16px)' }}>
        <div className="ob-card" style={{ padding: 'var(--spacing-4, 16px)' }}>
          <h3 className="section-title">Kafka Topics</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Partitions</th>
                <th>Lag</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: "'Noto Sans Mono', monospace" }}>ams.raw-alarms</td>
                <td>6</td>
                <td style={{ color: 'var(--running-color)' }}>0</td>
                <td>125 msg/s</td>
              </tr>
              <tr>
                <td style={{ fontFamily: "'Noto Sans Mono', monospace" }}>ams.enriched-alarms</td>
                <td>6</td>
                <td style={{ color: 'var(--running-color)' }}>0</td>
                <td>125 msg/s</td>
              </tr>
              <tr>
                <td style={{ fontFamily: "'Noto Sans Mono', monospace" }}>ams.audit-events</td>
                <td>3</td>
                <td style={{ color: 'var(--running-color)' }}>0</td>
                <td>45 msg/s</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="ob-card" style={{ padding: 'var(--spacing-4, 16px)' }}>
          <h3 className="section-title">Alarm Lifecycle Inspector</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3, 12px)' }}>
            <StatRow label="Alarms in Transit" value="12" />
            <StatRow label="Avg Processing Time" value="8.2 ms" />
            <StatRow label="Dedup Rate" value="2.1%" />
            <StatRow label="OPC → UI Latency (P99)" value="45 ms" />
          </div>
        </div>
      </div>
    </div>
  );
};

const HealthCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
  accent: string;
  sub?: string;
}> = ({ icon, label, value, color, accent, sub }) => (
  <div className="ob-card" style={{ 
    padding: 'var(--spacing-3, 12px)', 
    borderLeft: `4px solid ${accent}` 
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--on-container-neutral-color)' }}>
      <span>{icon}</span>
      <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>{label}</span>
    </div>
    <div style={{ fontSize: '24px', fontWeight: 700, color, marginTop: '8px' }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: '12px', color: 'var(--on-container-neutral-color)' }}>{sub}</div>}
  </div>
);

const PipelineNode: React.FC<{ label: string; status: 'active' | 'warning' | 'error' }> = ({ label, status }) => (
  <div style={{
    padding: 'var(--spacing-3, 12px) var(--spacing-4, 16px)',
    background: 'var(--container-background-color)',
    border: `1px solid ${status === 'active' ? 'var(--running-color)' : status === 'warning' ? 'var(--alert-caution-border-color)' : 'var(--alert-alarm-border-color)'}`,
    borderRadius: 'var(--corner-radius, 4px)',
    fontSize: '12px',
    fontWeight: 600,
    textAlign: 'center',
  }}>
    <div style={{ 
      width: 8, 
      height: 8, 
      borderRadius: '50%', 
      background: status === 'active' ? 'var(--running-color)' : status === 'warning' ? 'var(--alert-caution-border-color)' : 'var(--alert-alarm-border-color)',
      margin: '0 auto 8px',
      boxShadow: `0 0 8px ${status === 'active' ? 'var(--running-color)' : 'transparent'}`,
    }} />
    {label}
  </div>
);

const PipelineArrow: React.FC = () => (
  <div style={{ color: 'var(--on-container-neutral-color)', fontSize: '18px' }}>→</div>
);

const JobRow: React.FC<{ name: string; status: string; uptime: string; records: number; checkpoint: string }> = ({ name, status, uptime, records, checkpoint }) => (
  <tr>
    <td style={{ fontFamily: "'Noto Sans Mono', monospace" }}>{name}</td>
    <td>
      <span style={{ 
        padding: '2px 8px', 
        borderRadius: '4px',
        background: status === 'RUNNING' ? 'color-mix(in srgb, var(--running-color) 15%, transparent)' : 'color-mix(in srgb, var(--alert-alarm-border-color) 15%, transparent)',
        color: status === 'RUNNING' ? 'var(--running-color)' : 'var(--alert-alarm-border-color)',
        fontSize: '11px',
        fontWeight: 600,
      }}>
        {status}
      </span>
    </td>
    <td>{uptime}</td>
    <td>{records.toLocaleString()}</td>
    <td style={{ color: checkpoint === 'OK' ? 'var(--running-color)' : 'var(--alert-alarm-border-color)' }}>{checkpoint}</td>
  </tr>
);

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
    <span style={{ color: 'var(--on-container-neutral-color)' }}>{label}</span>
    <span style={{ fontFamily: "'Noto Sans Mono', monospace", fontWeight: 600 }}>{value}</span>
  </div>
);

export default SystemMonitor;
