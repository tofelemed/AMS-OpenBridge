import React, { useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';

export const DriftEnginePanel: React.FC = () => {
    const [alerts, setAlerts] = useState<any[]>([]);
    
    useEffect(() => {
        const hubUrl = '/hubs/observability';
        const connection = new HubConnectionBuilder()
          .withUrl(hubUrl)
          .withAutomaticReconnect()
          .build();

        connection.on('OnDriftAlertReceived', (payload) => {
            setAlerts(prev => [payload, ...prev].slice(0, 50));
        });

        connection.start().catch(err => console.error("Observability Hub error", err));

        return () => {
            connection.stop();
        };
    }, []);

    return (
        <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Consistency & Drift Engine</h3>
                <span style={{ background: alerts.length > 0 ? 'var(--alarm-high)' : 'var(--color-success)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                    {alerts.length > 0 ? 'DRIFT DETECTED' : 'CONSISTENT'}
                </span>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '150px' }}>
                {alerts.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        No state drift detected across pipeline layers.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {alerts.map((a, i) => (
                            <div key={i} style={{ background: 'var(--color-bg-secondary)', padding: '8px', borderRadius: '4px', borderLeft: '3px solid var(--alarm-high)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertOctagon size={14} color="var(--alarm-high)" />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    {new Date(a.timestamp).toLocaleTimeString()}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    {a.type}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    {a.alarmId}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
