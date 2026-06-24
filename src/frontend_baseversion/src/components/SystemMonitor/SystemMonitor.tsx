import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GlobalOverviewHeader } from './GlobalOverviewHeader';
import { FlinkJobGrid } from './FlinkJobGrid';
import { PipelineFlowVisualizer } from './PipelineFlowVisualizer';
import { AlarmLifecycleInspector } from './AlarmLifecycleInspector';
import { DriftEnginePanel } from './DriftEnginePanel';
import { KafkaPanel } from './KafkaPanel';

export const SystemMonitor: React.FC = () => {
    const [pipelineHealth, setPipelineHealth] = useState<any>(null);

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
        return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Initializing edge observability...</div>;
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            style={{ 
                padding: 'var(--space-4)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 'var(--space-4)',
                height: '100%',
                overflowY: 'auto',
                background: 'var(--color-bg-base)'
            }}
        >
            <GlobalOverviewHeader health={pipelineHealth} />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <PipelineFlowVisualizer health={pipelineHealth} />
                <DriftEnginePanel />
            </div>

            <FlinkJobGrid flinkHealth={pipelineHealth.flink} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <KafkaPanel kafkaHealth={pipelineHealth.kafka} />
                <AlarmLifecycleInspector />
            </div>

        </motion.div>
    );
};
