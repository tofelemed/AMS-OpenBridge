import React from 'react';
import { HardDrive } from 'lucide-react';

interface Props {
    kafkaHealth: any;
}

export const KafkaPanel: React.FC<Props> = ({ kafkaHealth }) => {
    
    return (
        <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <HardDrive size={18} color="var(--text-primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Kafka Data Plane</h3>
            </div>
            
            <table style={{ width: '100%', fontSize: '13px', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--text-muted)' }}>
                        <th style={{ paddingBottom: '8px' }}>Topic Name</th>
                        <th style={{ paddingBottom: '8px' }}>Partitions</th>
                        <th style={{ paddingBottom: '8px' }}>Lag</th>
                        <th style={{ paddingBottom: '8px' }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style={{ borderBottom: '1px solid var(--color-bg-secondary)' }}>
                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent-blue)' }}>alarm.events.raw</td>
                        <td>8</td>
                        <td style={{ color: kafkaHealth?.lag > 0 ? 'var(--alarm-high)' : 'var(--text-primary)' }}>{kafkaHealth?.lag || 0}</td>
                        <td style={{ color: 'var(--color-success)' }}>Healthy</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--color-bg-secondary)' }}>
                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent-blue)' }}>alarm.state.active</td>
                        <td>4</td>
                        <td>0</td>
                        <td style={{ color: 'var(--color-success)' }}>Healthy</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--color-bg-secondary)' }}>
                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>flink.state.alarm.delta</td>
                        <td>4</td>
                        <td>0</td>
                        <td style={{ color: 'var(--color-success)' }}>Healthy</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--color-bg-secondary)' }}>
                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--alarm-medium)' }}>system.state.drift.alerts</td>
                        <td>2</td>
                        <td>0</td>
                        <td style={{ color: 'var(--color-success)' }}>Healthy</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
