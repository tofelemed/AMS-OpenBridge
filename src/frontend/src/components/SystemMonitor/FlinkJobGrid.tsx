import React from 'react';
import { Settings, RefreshCw, Layers } from 'lucide-react';

interface Props {
    flinkHealth: any;
}

export const FlinkJobGrid: React.FC<Props> = ({ flinkHealth }) => {
    
    // In a real system, the API would return a list of jobs. For now, we mock the UI layout based on the single job returned.
    const isRunning = flinkHealth?.status === 'Running';

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            
            <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', borderTop: `4px solid ${isRunning ? 'var(--color-success)' : 'var(--alarm-high)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Alarm Lifecycle Engine</h3>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: isRunning ? 'rgba(0,200,83,0.1)' : 'rgba(213,0,0,0.1)', color: isRunning ? 'var(--color-success)' : 'var(--alarm-high)', fontWeight: 600 }}>{flinkHealth?.status?.toUpperCase()}</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>State Size</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={14} color="var(--accent-blue)" /> 142 MB</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CP Latency</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{flinkHealth?.checkpointLatencyMs || 0} ms</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Restarts</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: flinkHealth?.restartCount > 0 ? 'var(--alarm-medium)' : 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={14} color={flinkHealth?.restartCount > 0 ? "var(--alarm-medium)" : "var(--color-success)"} /> {flinkHealth?.restartCount || 0}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Watermark Delay</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{flinkHealth?.watermarkDelayMs || 0} ms</span>
                    </div>
                </div>
            </div>

            <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', borderTop: '4px solid var(--color-success)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Alarm KPI Engine</h3>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(0,200,83,0.1)', color: 'var(--color-success)', fontWeight: 600 }}>RUNNING</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>State Size</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={14} color="var(--accent-cyan)" /> 45 MB</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CP Latency</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>42 ms</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Restarts</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={14} color="var(--color-success)" /> 0</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Throughput</span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>240 msg/s</span>
                    </div>
                </div>
            </div>

        </div>
    );
};
