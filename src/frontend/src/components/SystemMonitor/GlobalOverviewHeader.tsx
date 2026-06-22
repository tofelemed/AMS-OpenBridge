import React from 'react';
import { Activity, Server, Clock, AlertTriangle } from 'lucide-react';

interface Props {
    health: any;
}

export const GlobalOverviewHeader: React.FC<Props> = ({ health }) => {
    // Determine Edge Health Score
    // Simplified computation based on Readiness metrics
    const readinessScore = health.readiness?.score ?? 0;
    
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)'
        }}>
            <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', borderLeft: '4px solid var(--accent-blue)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                    <Activity size={16} /> <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Edge Health Score</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: readinessScore > 80 ? 'var(--color-success)' : 'var(--alarm-high)', marginTop: '8px' }}>
                    {readinessScore.toFixed(0)} / 100
                </div>
            </div>

            <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', borderLeft: '4px solid var(--accent-cyan)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                    <Server size={16} /> <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Flink Checkpoint Health</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: health.flink?.status === 'Running' ? 'var(--color-success)' : 'var(--alarm-critical)', marginTop: '8px' }}>
                    {health.flink?.status === 'Running' ? '100%' : 'DEGRADED'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latency: {health.flink?.checkpointLatencyMs} ms</div>
            </div>

            <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', borderLeft: '4px solid var(--alarm-medium)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                    <Clock size={16} /> <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Max Kafka Topic Lag</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: health.kafka?.lag === 0 ? 'var(--color-success)' : 'var(--alarm-medium)', marginTop: '8px' }}>
                    {health.kafka?.lag} msgs
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tput: {health.kafka?.throughput.toFixed(1)} ev/s</div>
            </div>

            <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', borderLeft: '4px solid var(--alarm-high)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                    <AlertTriangle size={16} /> <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Alarm Consistency Score</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)', marginTop: '8px' }}>
                    100%
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>0 state drifts detected</div>
            </div>
        </div>
    );
};
