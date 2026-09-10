'use client';

import React, { useMemo, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { T } from '../../styles/theme';
import {
  CONNECTION_URL_PATTERN, DataSourceDto, ProfileInfo, SaveDataSourceRequest,
  createDataSource, extractApiError, isValidTopicFilter, updateDataSource,
} from './dataSourcesApi';

type TlsMode = 'upload' | 'path' | 'skip';

interface WizardForm {
  profileType: string;
  name: string;
  description: string;
  connectionUrl: string;
  username: string;
  password: string;
  topics: string[];
  qos: 0 | 1 | 2;
  clientId: string;
  sessionExpirySeconds: number;
  keepaliveSeconds: number;
  cleanSession: boolean;
  timeoutSeconds: number;
  tlsMode: TlsMode;
  caCertPem: string;
  caCertFileName: string;
  caCertPath: string;
  servername: string;
}

const STEPS = [
  { title: 'Profile Selection',   subtitle: 'Choose data source profile' },
  { title: 'Basic Information',   subtitle: 'Name and description' },
  { title: 'Connection Settings', subtitle: 'Server and authentication' },
  { title: 'Advanced Options',    subtitle: 'Polling and timeouts' },
];

function formFrom(profiles: ProfileInfo[], existing?: DataSourceDto): WizardForm {
  const mqtt = existing?.profileConfig?.mqtt;
  const tls = mqtt?.tls;
  const profileType = existing?.profileType ?? profiles[0]?.profileType ?? 'MQTT_PRM';
  const profileDefaults = profiles.find(p => p.profileType === profileType)?.defaultTopics;
  return {
    profileType,
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    connectionUrl: existing?.connectionUrl ?? '',
    username: existing?.username ?? '',
    password: '',
    topics: mqtt?.topics?.length ? [...mqtt.topics] : (profileDefaults?.length ? [...profileDefaults] : ['#']),
    qos: (mqtt?.qos ?? 1) as 0 | 1 | 2,
    clientId: mqtt?.client_id ?? '',
    sessionExpirySeconds: mqtt?.session_expiry_seconds ?? 86400,
    keepaliveSeconds: mqtt?.keepalive_seconds ?? 60,
    cleanSession: mqtt?.clean_session ?? false,
    timeoutSeconds: existing?.timeoutSeconds ?? 30,
    tlsMode: existing?.insecureSkipVerify ? 'skip' : (tls?.ca_cert_path ? 'path' : 'upload'),
    caCertPem: tls?.ca_cert_pem ?? '',
    caCertFileName: tls?.ca_cert_pem ? '(stored certificate)' : '',
    caCertPath: tls?.ca_cert_path ?? '',
    servername: tls?.servername ?? '',
  };
}

export const DataSourceWizard: React.FC<{
  profiles: ProfileInfo[];
  existing?: DataSourceDto;
  onDone: (saved: DataSourceDto) => void;
  onCancel: () => void;
}> = ({ profiles, existing, onDone, onCancel }) => {
  const isEdit = !!existing;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(() => formFrom(profiles, existing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caError, setCaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const profile = profiles.find(p => p.profileType === form.profileType);
  const isTls = /^(mqtts|ssl):\/\//.test(form.connectionUrl.trim());
  const cleanTopics = form.topics.map(t => t.trim()).filter(t => t.length > 0);

  /** Picking a module adopts its suggested topic filters (create mode only — the
   *  profile is chosen before the topics step, so overwriting is safe; an edit
   *  never touches the configured topics). */
  const onProfileChange = (profileType: string) => {
    const next = profiles.find(p => p.profileType === profileType);
    setForm(prev => ({
      ...prev,
      profileType,
      topics: !isEdit && next?.defaultTopics?.length ? [...next.defaultTopics] : prev.topics,
    }));
  };

  /** Switching trust modes clears the other modes' state (spec INVARIANT: the saved
   *  config can never disagree with what the form shows). */
  const switchTlsMode = (mode: TlsMode) => {
    setCaError(null);
    setForm(prev => ({
      ...prev, tlsMode: mode,
      caCertPem: '', caCertFileName: '', caCertPath: '',
    }));
  };

  const onCaFile = (file: File | undefined) => {
    setCaError(null);
    if (!file) return;
    if (file.size > 64 * 1024) {
      setCaError('File is larger than 64 KB — a CA certificate is a few KB; wrong file?');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '').trim();
      if (!text.includes('-----BEGIN CERTIFICATE-----')) {
        setCaError('Not a PEM certificate (missing BEGIN CERTIFICATE)');
        return;
      }
      if (text.includes('PRIVATE KEY')) {
        setCaError('This file contains a private key — upload the CA certificate, never a key');
        return;
      }
      setForm(prev => ({ ...prev, caCertPem: text, caCertFileName: file.name }));
    };
    reader.readAsText(file);
  };

  const stepError = useMemo((): string | null => {
    switch (step) {
      case 0:
        return profile ? null : 'Choose a data source profile';
      case 1:
        return form.name.trim() ? null : 'Name is required';
      case 2: {
        if (!form.connectionUrl.trim()) return 'Broker URL is required';
        if (!CONNECTION_URL_PATTERN.test(form.connectionUrl.trim()))
          return 'URL must look like mqtt://host:1883 or mqtts://host:8883';
        if (!form.username.trim()) return 'Username is required';
        if (!isEdit && !form.password) return 'Password is required';
        return null;
      }
      case 3: {
        if (cleanTopics.length === 0) return 'At least one topic filter is required';
        const bad = cleanTopics.find(t => !isValidTopicFilter(t));
        if (bad) return `Invalid topic filter "${bad}" — '#' must be the last level`;
        if (form.clientId.trim() && !/^[A-Za-z0-9_-]{1,64}$/.test(form.clientId.trim()))
          return "Client ID may contain letters, digits, '_' and '-' (max 64 chars)";
        if (form.sessionExpirySeconds < 0) return 'Session expiry must be 0 or greater';
        if (form.keepaliveSeconds <= 0) return 'Keepalive must be greater than 0';
        if (form.timeoutSeconds <= 0) return 'Timeout must be greater than 0';
        if (caError) return caError;
        return null;
      }
      default:
        return null;
    }
  }, [step, profile, form, isEdit, cleanTopics, caError]);

  const tlsUnverifiedWarning =
    isTls && form.tlsMode === 'upload' && !form.caCertPem
      ? 'No CA certificate loaded — the test will fail with "self-signed certificate in certificate chain" unless the broker’s certificate chains to a system root. Provide a CA or choose "Do not verify".'
      : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: SaveDataSourceRequest = {
        sourceType: 'MQTT',
        profileType: form.profileType,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        connectionUrl: form.connectionUrl.trim(),
        username: form.username.trim(),
        timeoutSeconds: form.timeoutSeconds,
        insecureSkipVerify: isTls && form.tlsMode === 'skip',
        profileConfig: {
          // Carry every stored block across: PUT replaces profile_config wholesale,
          // so a key absent here is DELETED. This wizard renders only `mqtt`, and
          // rebuilding the object from scratch silently wiped `loop_ingest`
          // (mode_value_map, param_roles, grid_seconds, topic_template) on any save.
          ...(existing?.profileConfig ?? {}),
          mqtt: {
            topics: cleanTopics,
            qos: form.qos,
            client_id: form.clientId.trim() || undefined,
            clean_session: form.cleanSession,
            session_expiry_seconds: form.sessionExpirySeconds,
            keepalive_seconds: form.keepaliveSeconds,
            tls: isTls && form.tlsMode !== 'skip'
              ? {
                  ca_cert_pem: form.tlsMode === 'upload' && form.caCertPem ? form.caCertPem : undefined,
                  ca_cert_path: form.tlsMode === 'path' && form.caCertPath.trim() ? form.caCertPath.trim() : undefined,
                  servername: form.servername.trim() || undefined,
                }
              : undefined,
          },
        },
      };
      // INVARIANT: on edit, a blank password field means "keep the stored password".
      if (form.password) body.password = form.password;

      const saved = isEdit
        ? await updateDataSource(existing!.configId, body)
        : await createDataSource(body);
      onDone(saved);
    } catch (err) {
      const { message, field } = extractApiError(err);
      setError(field ? `${message} (${field})` : message);
    } finally {
      setSaving(false);
    }
  };

  /* ── layout helpers ─────────────────────────────────── */

  const label = (text: string, required = false): React.ReactNode => (
    <div style={{ fontSize: '13px', fontWeight: 600, color: T.textPrimary, marginBottom: '6px' }}>
      {text}{required && <span style={{ color: T.critical }}> *</span>}
    </div>
  );

  const help = (text: React.ReactNode, warn = false): React.ReactNode => (
    <div style={{ fontSize: '11.5px', color: warn ? T.warning : T.textMuted, marginTop: '5px', lineHeight: 1.45 }}>
      {text}
    </div>
  );

  const mono: React.CSSProperties = { fontFamily: "'Noto Sans Mono', monospace", fontSize: '13px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>
            {isEdit ? `Edit Configuration — ${existing!.name}` : 'New Data Source Configuration'}
          </h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            Step {step + 1} of {STEPS.length}: {STEPS[step].subtitle}
          </p>
        </div>
        <ObcButton variant="flat" onClick={onCancel}>← Back to list</ObcButton>
      </div>

      {/* ── Stepper ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '8px 24px 0' }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.title}>
            {i > 0 && (
              <div style={{
                flex: 1, height: '2px', marginTop: '15px',
                background: i <= step ? T.success : T.border,
              }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '130px', gap: '7px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700,
                background: i < step ? T.successBg : i === step ? T.blueLight : T.bg,
                border: `2px solid ${i < step ? T.success : i === step ? T.blue : T.border}`,
                color: i < step ? T.success : i === step ? T.blue : T.textMuted,
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: i === step ? T.textPrimary : T.textSecondary }}>{s.title}</div>
                <div style={{ fontSize: '10.5px', color: T.textMuted }}>{s.subtitle}</div>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ── Step body ──────────────────────────────────── */}
      <div style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
        padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px',
      }}>

        {step === 0 && (
          <>
            <div>
              {label('Data Source Profile', true)}
              {help('What is this configuration for? The profile decides which module the data feeds and which pipeline it lands on.')}
              <select
                className="ob-input" style={{ width: '100%', marginTop: '6px' }}
                value={form.profileType}
                onChange={e => onProfileChange(e.target.value)}
              >
                {profiles.map(p => (
                  <option key={p.profileType} value={p.profileType}>{p.displayName} — {p.module}</option>
                ))}
              </select>
              {profile && help(profile.description)}
            </div>
            <div>
              {label('Transport Type')}
              <input type="text" className="ob-input" style={{ width: '100%' }} value={profile?.transport ?? 'MQTT'} disabled />
              {help('Determined by profile selection')}
            </div>
            {profile && (
              <div style={{
                background: T.blueLight, border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
                padding: '12px 16px', fontSize: '12.5px', color: T.textSecondary, lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 700, color: T.textPrimary, marginBottom: '4px' }}>Data routing</div>
                MQTT topics (step 4, suggested <code>{profile.defaultTopics.join(', ')}</code>)
                {' → '}<strong>{profile.displayName}</strong> parser
                {' → '}<code>{profile.destination}</code>
                {' → '}<strong>{profile.module}</strong>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div>
              {label('Name', true)}
              <input
                type="text" className="ob-input" style={{ width: '100%' }}
                value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g., OT Gateway PRM upload"
              />
            </div>
            <div>
              {label('Description')}
              <textarea
                className="ob-input" style={{ width: '100%', minHeight: '84px', resize: 'vertical' }}
                value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Optional: Describe this data source configuration"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              {label('Broker URL', true)}
              <input
                type="text" className="ob-input" style={{ width: '100%', ...mono }}
                value={form.connectionUrl} onChange={e => set('connectionUrl', e.target.value)}
                placeholder="mqtts://192.168.190.91:8883"
              />
              {help(<>Include the scheme and port. Use <code>mqtts://</code> for TLS (8883) or <code>mqtt://</code> for plaintext (1883).</>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                {label('Username', true)}
                <input
                  type="text" className="ob-input" style={{ width: '100%' }}
                  value={form.username} onChange={e => set('username', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                {label('Password', !isEdit)}
                <input
                  type="password" className="ob-input" style={{ width: '100%' }}
                  value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder={isEdit ? 'Leave blank to keep current password' : ''}
                  autoComplete="new-password"
                />
                {isEdit && help('Leave blank to keep the current password.')}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {/* Topic filters */}
            <div>
              {label('Topic Filters', true)}
              {help(<>Wildcards: <code>+</code> matches one level, <code>#</code> matches all remaining levels and must
                be last.{profile && <> Suggested for {profile.displayName}: <code>{profile.defaultTopics.join(', ')}</code> —
                enter the actual topic(s) your OT gateway publishes for this module.</>}</>)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {form.topics.map((topic, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text" className="ob-input" style={{ flex: 1, ...mono }}
                      value={topic}
                      onChange={e => set('topics', form.topics.map((t, j) => (j === i ? e.target.value : t)))}
                    />
                    <ObcButton
                      variant="flat"
                      disabled={form.topics.length === 1}
                      onClick={() => set('topics', form.topics.filter((_, j) => j !== i))}
                    >
                      🗑
                    </ObcButton>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '8px' }}>
                <ObcButton variant="flat" onClick={() => set('topics', [...form.topics, ''])}>+ Add topic</ObcButton>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                {label('QoS')}
                <select
                  className="ob-input" style={{ width: '100%' }}
                  value={form.qos}
                  onChange={e => set('qos', Number(e.target.value) as 0 | 1 | 2)}
                >
                  <option value={0}>0 — at most once</option>
                  <option value={1}>1 — at least once (recommended)</option>
                  <option value={2}>2 — exactly once</option>
                </select>
                {help('QoS 1 is required for the broker to queue messages while ingestion is down. Duplicates are suppressed downstream.')}
              </div>
              <div>
                {label('Client ID')}
                <input
                  type="text" className="ob-input" style={{ width: '100%', ...mono }}
                  value={form.clientId} onChange={e => set('clientId', e.target.value)}
                  placeholder={existing?.effectiveClientId ?? 'ingestion-<config-id>'}
                />
                {help('Leave blank to derive one from this config. It must be stable and unique — the broker keys its offline queue on it, and two clients sharing an ID evict each other repeatedly.')}
              </div>
              <div>
                {label('Session Expiry (seconds)')}
                <input
                  type="number" className="ob-input" style={{ width: '100%' }}
                  value={form.sessionExpirySeconds}
                  onChange={e => set('sessionExpirySeconds', Number(e.target.value))}
                />
                {help('How long the broker holds queued messages after a disconnect. MQTT 5 defaults this to 0, which silently discards them — leave it well above your longest expected restart.', true)}
              </div>
              <div>
                {label('Keepalive (seconds)')}
                <input
                  type="number" className="ob-input" style={{ width: '100%' }}
                  value={form.keepaliveSeconds}
                  onChange={e => set('keepaliveSeconds', Number(e.target.value))}
                />
                {help('The broker declares the client dead after 1.5× this with no traffic.')}
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.cleanSession}
                  onChange={e => set('cleanSession', e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: T.textPrimary }}>Clean session</span>
                  <span style={{ display: 'block', fontSize: '11.5px', color: T.textMuted, marginTop: '2px' }}>
                    Leave OFF. When on, the broker forgets the subscription on disconnect and anything published
                    while ingestion is restarting is lost permanently.
                  </span>
                </span>
              </label>
            </div>

            {/* TLS block */}
            <div style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: '14px 16px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: T.textPrimary, marginBottom: '8px' }}>
                🛡 Broker certificate (TLS)
              </div>
              {!isTls ? (
                <div style={{ fontSize: '12.5px', color: T.textMuted }}>
                  The broker URL is <code>mqtt://</code> (plaintext), so nothing here applies. Credentials are
                  encrypted at rest but travel in the clear — use <code>mqtts://</code> outside a trusted network.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {([
                    ['upload', 'Upload CA certificate (recommended)'],
                    ['path',   'Use a CA file already on the server'],
                    ['skip',   'Do not verify the broker certificate'],
                  ] as [TlsMode, string][]).map(([mode, text]) => (
                    <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: T.textPrimary }}>
                      <input type="radio" name="tlsMode" checked={form.tlsMode === mode} onChange={() => switchTlsMode(mode)} />
                      {text}
                    </label>
                  ))}

                  {form.tlsMode === 'upload' && (
                    <div style={{ paddingLeft: '22px' }}>
                      {form.caCertPem ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: T.success }}>
                          ✓ {form.caCertFileName || 'certificate loaded'}
                          <ObcButton variant="flat" onClick={() => { set('caCertPem', ''); set('caCertFileName', ''); setCaError(null); }}>
                            Remove
                          </ObcButton>
                        </div>
                      ) : (
                        <input
                          ref={fileInputRef}
                          type="file" accept=".crt,.pem,.cer,.txt"
                          onChange={e => onCaFile(e.target.files?.[0])}
                          style={{ fontSize: '12.5px', color: T.textSecondary }}
                        />
                      )}
                      {caError && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: T.critical }}>{caError}</div>
                      )}
                      {tlsUnverifiedWarning && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: T.critical }}>{tlsUnverifiedWarning}</div>
                      )}
                    </div>
                  )}
                  {form.tlsMode === 'path' && (
                    <div style={{ paddingLeft: '22px' }}>
                      <input
                        type="text" className="ob-input" style={{ width: '100%', ...mono }}
                        value={form.caCertPath} onChange={e => set('caCertPath', e.target.value)}
                        placeholder="/app/certs/mqtt-ca.crt"
                      />
                      {help('The path resolves on the SERVER (inside the ingestion-service container) — it must be readable by both the subscriber and the connection tester. Inline upload avoids this whole class of problem.', true)}
                    </div>
                  )}
                  {form.tlsMode === 'skip' && (
                    <div style={{ paddingLeft: '22px', fontSize: '12px', color: T.critical }}>
                      Traffic is encrypted but the broker is NOT authenticated — vulnerable to impersonation. Testing only.
                    </div>
                  )}

                  <div>
                    {label('TLS servername (optional)')}
                    <input
                      type="text" className="ob-input" style={{ width: '100%', ...mono }}
                      value={form.servername} onChange={e => set('servername', e.target.value)}
                      placeholder="mosquitto"
                    />
                    {help('Only needed when reaching the broker by an address its certificate does not list — a bare "Protocol error" on connect is almost always this.')}
                  </div>
                </div>
              )}
            </div>

            <div>
              {label('Timeout (seconds)')}
              <input
                type="number" className="ob-input" style={{ width: '220px' }}
                value={form.timeoutSeconds}
                onChange={e => set('timeoutSeconds', Number(e.target.value))}
              />
              {help('Used by the connection test (and the subscriber connect attempt in a later phase).')}
            </div>

            {/* Next steps box */}
            <div style={{
              background: T.blueLight, border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
              padding: '12px 16px', fontSize: '12.5px', color: T.textSecondary, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, color: T.textPrimary, marginBottom: '4px' }}>Next steps after saving:</div>
              1. Click <strong>Test</strong> to verify the broker accepts these credentials<br />
              2. The ingestion runtime arrives in a later phase — active configurations take effect when it ships<br />
              3. Every OT tag the gateway publishes must be mapped in the asset model (alias mapping) before its
              data can land — records for unknown tags are parked, not auto-created
            </div>
          </>
        )}
      </div>

      {/* ── Errors ─────────────────────────────────────── */}
      {(stepError || error) && (
        <div role="alert" style={{
          padding: '10px 14px', borderRadius: T.radiusSm, fontSize: '13px',
          background: T.criticalBg, border: `1px solid ${T.criticalBorder}`, color: T.critical,
        }}>
          {error ?? stepError}
        </div>
      )}

      {/* ── Footer nav ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <ObcButton variant="flat" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          ← {step === 0 ? 'Cancel' : 'Back'}
        </ObcButton>
        {step < STEPS.length - 1 ? (
          <ObcButton variant="raised" disabled={!!stepError} onClick={() => setStep(step + 1)}>
            Next →
          </ObcButton>
        ) : (
          <ObcButton variant="raised" disabled={!!stepError || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : isEdit ? '💾 Save Changes' : '💾 Create Configuration'}
          </ObcButton>
        )}
      </div>
    </div>
  );
};

export default DataSourceWizard;
