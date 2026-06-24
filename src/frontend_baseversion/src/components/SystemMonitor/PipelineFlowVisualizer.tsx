import React from 'react';
import { Database, Cpu, HardDrive, Monitor, ArrowRight } from 'lucide-react';

interface Props {
    health: any;
}

export const PipelineFlowVisualizer: React.FC<Props> = ({ health }) => {
    
    const ArrowNode = ({ label, latency, active }: { label: string, latency?: string, active?: boolean }) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: active ? 'var(--color-success)' : 'var(--text-muted)' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase' }}>{label}</span>
            <ArrowRight size={24} />
            <span style={{ fontSize: '10px' }}>{latency}</span>
        </div>
    );

    const BlockNode = ({ label, icon, tput, lag }: { label: string, icon: React.ReactNode, tput?: string, lag?: string }) => (
        <div style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '120px' }}>
            {icon}
            <div style={{ fontWeight: 600, marginTop: '8px', fontSize: '14px' }}>{label}</div>
            {tput && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{tput} msg/s</div>}
            {lag && <div style={{ fontSize: '11px', color: 'var(--alarm-high)' }}>Lag: {lag}</div>}
        </div>
    );

    return (
        <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px', color: 'var(--text-primary)' }}>Live Edge Topology</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <BlockNode label="OPC A&E" icon={<HardDrive size={32} color="var(--accent-blue)" />} />
                
                <ArrowNode label="Ingest" latency="< 5ms" active={true} />
                
                <BlockNode label="Kafka" icon={<Database size={32} color="var(--accent-cyan)" />} tput={health.kafka?.throughput.toFixed(1)} lag={health.kafka?.lag > 0 ? health.kafka?.lag.toString() : undefined} />
                
                <ArrowNode label="Consume" latency="< 10ms" active={true} />
                
                <BlockNode label="Flink Edge" icon={<Cpu size={32} color="var(--color-success)" />} tput={(health.flink?.recordsReceived / 60).toFixed(1)} />
                
                <ArrowNode label="Sink" latency={`${health.postgres?.queryLatencyMs.toFixed(1)}ms`} active={true} />
                
                <BlockNode label="React UI" icon={<Monitor size={32} color="var(--accent-purple)" />} />
            </div>
        </div>
    );
};
