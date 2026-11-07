'use client';

/**
 * No settings service exists yet, so nothing here is a value: each setting reads Not connected and Save is off with its reason.
 * Retention actually runs in the TimescaleDB policy layer (prod_decision.md), not here.
 */
import React from 'react';
import { KvRow } from '../Cpm/shared';
import { ReasonedButton } from '../Cpm/ReasonedButton';

const NOT_CONNECTED = 'Not connected';

const GROUPS: { title: string; settings: string[] }[] = [
  { title: 'Data retention', settings: ['Active alarm retention (days)', 'Historical log retention (days)'] },
  { title: 'Backup and export', settings: ['Backup path', 'Nightly audit trail CSV export'] },
  { title: 'Interface and diagnostics', settings: ['Default theme', 'Backend log level'] },
];

export const SystemSettingsConfig: React.FC = () => (
  <>
    <div className="cpm-admin-bar cpm-admin-bar--end">
      <ReasonedButton variant="raised" disabled reason="No settings service is connected, so nothing can be saved.">
        Save settings
      </ReasonedButton>
    </div>
    {GROUPS.map(g => (
      <section key={g.title}>
        <h3 className="cpm-panel-title">{g.title}</h3>
        {g.settings.map(s => <KvRow key={s} label={s}>{NOT_CONNECTED}</KvRow>)}
      </section>
    ))}
  </>
);

export default SystemSettingsConfig;
