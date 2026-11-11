/**
 * CHG-172 (owner review, the approved sample, badge 14): the editor's Advanced tab in titled parts, Topic Filters, Session,
 * Broker certificate (TLS), Timeout and Next steps after saving. Every field, default and check as before; the help is behind ?
 * and the warnings stay in view (session expiry, clean session, the CA file path, no CA loaded, Do not verify). Owner answer
 * 10b: the stale "later phase" texts went (the ingestion runtime runs today, and its subscriber connects with this timeout);
 * the emoji became an OpenBridge icon (Remove topic) or went (the TLS heading).
 */
import React, { useId, useRef } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiDelete } from '@oicl/openbridge-webcomponents-react/icons/icon-delete';
import { Toggletip } from '../../../ui/Toggletip';
import { CpmIconButton } from '../../Cpm/shared';
import { Field, Part } from '../../Cpm/registry/wizard/editorParts';
import type { ProfileInfo } from '../dataSourcesApi';
import { isTlsUrl, tlsUnverifiedWarning, type TlsMode, type WizardForm } from './wizardForm';

type Set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
const help = (label: string, content: React.ReactNode) => <Toggletip variant="how-to" label={label}>{content}</Toggletip>;
const TLS_MODES: Array<[TlsMode, string]> = [
  ['upload', 'Upload CA certificate (recommended)'],
  ['path', 'Use a CA file already on the server'],
  ['skip', 'Do not verify the broker certificate'],
];

export const AdvancedPane: React.FC<{
  form: WizardForm;
  set: Set;
  profile?: ProfileInfo;
  clientIdPlaceholder: string;
  caError: string | null;
  onTlsMode: (mode: TlsMode) => void;
  onCaFile: (file: File | undefined) => void;
  onRemoveCa: () => void;
}> = ({ form, set, profile, clientIdPlaceholder, caError, onTlsMode, onCaFile, onRemoveCa }) => {
  const id = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTls = isTlsUrl(form.connectionUrl);
  const noCa = tlsUnverifiedWarning(form);
  return (
    <>
      <Part title="Topic Filters *"
        help={help('Topic Filters', <p>Wildcards: <code>+</code> matches one level, <code>#</code> matches all remaining levels and must
          be last.{profile && <> Suggested for {profile.displayName}: <code>{profile.defaultTopics.join(', ')}</code> — enter the actual
          topic(s) your OT gateway publishes for this module.</>}</p>)}
        end={<ObcButton variant="flat" onClick={() => set('topics', [...form.topics, ''])}>Add topic</ObcButton>}>
        {form.topics.map((topic, i) => (
          <div key={i} className="cpm-admin-row">
            <input type="text" className="cpm-input cpm-mono" aria-label={`Topic filter ${i + 1}`} value={topic}
              onChange={e => set('topics', form.topics.map((t, j) => (j === i ? e.target.value : t)))} />
            <CpmIconButton label="Remove topic" disabled={form.topics.length === 1}
              onClick={() => set('topics', form.topics.filter((_, j) => j !== i))}><ObiDelete /></CpmIconButton>
          </div>
        ))}
      </Part>

      <Part title="Session">
        <div className="cpm-reg-form-grid cpm-reg-form-grid--two">
          <Field id={`${id}-q`} label="QoS" help={help('QoS', <p>QoS 1 is required for the broker to queue messages while ingestion is down. Duplicates are suppressed downstream.</p>)}>
            <select id={`${id}-q`} className="cpm-select" value={form.qos} onChange={e => set('qos', Number(e.target.value) as 0 | 1 | 2)}>
              <option value={0}>0 — at most once</option>
              <option value={1}>1 — at least once (recommended)</option>
              <option value={2}>2 — exactly once</option>
            </select>
          </Field>
          <Field id={`${id}-c`} label="Client ID"
            help={help('Client ID', <p>Leave blank to derive one from this config. It must be stable and unique — the broker keys its offline queue on it, and two clients sharing an ID evict each other repeatedly.</p>)}>
            <input id={`${id}-c`} type="text" className="cpm-input cpm-mono" value={form.clientId} placeholder={clientIdPlaceholder}
              onChange={e => set('clientId', e.target.value)} />
          </Field>
          <Field id={`${id}-s`} label="Session Expiry (seconds)"
            note={<span className="cpm-admin-caution">How long the broker holds queued messages after a disconnect. MQTT 5 defaults this to 0, which silently discards them — leave it well above your longest expected restart.</span>}>
            <input id={`${id}-s`} type="number" className="cpm-input" value={form.sessionExpirySeconds}
              onChange={e => set('sessionExpirySeconds', Number(e.target.value))} />
          </Field>
          <Field id={`${id}-k`} label="Keepalive (seconds)" help={help('Keepalive', <p>The broker declares the client dead after 1.5× this with no traffic.</p>)}>
            <input id={`${id}-k`} type="number" className="cpm-input" value={form.keepaliveSeconds}
              onChange={e => set('keepaliveSeconds', Number(e.target.value))} />
          </Field>
        </div>
        <label className="cpm-admin-check cpm-admin-check--top">
          <input type="checkbox" checked={form.cleanSession} onChange={e => set('cleanSession', e.target.checked)} />
          <span>
            <span>Clean session</span>
            <span className="cpm-event-row__sub">Leave OFF. When on, the broker forgets the subscription on disconnect and anything published while ingestion is restarting is lost permanently.</span>
          </span>
        </label>
      </Part>

      <Part title="Broker certificate (TLS)">
        {!isTls ? (
          <p className="cpm-copy">
            The broker URL is <code>mqtt://</code> (plaintext), so nothing here applies. Credentials are encrypted at rest but travel in
            the clear — use <code>mqtts://</code> outside a trusted network.
          </p>
        ) : (
          <div className="cpm-admin-stack">
            {TLS_MODES.map(([mode, text]) => (
              <label key={mode} className="cpm-admin-check">
                <input type="radio" name={`${id}-tls`} checked={form.tlsMode === mode} onChange={() => onTlsMode(mode)} />
                {text}
              </label>
            ))}
            {form.tlsMode === 'upload' && (
              <div className="cpm-admin-indent">
                {form.caCertPem ? (
                  <span className="cpm-admin-inline">
                    <span className="cpm-admin-good">✓ {form.caCertFileName || 'certificate loaded'}</span>
                    <ObcButton variant="flat" onClick={onRemoveCa}>Remove</ObcButton>
                  </span>
                ) : (
                  <input ref={fileInputRef} type="file" accept=".crt,.pem,.cer,.txt" aria-label="CA certificate file"
                    onChange={e => onCaFile(e.target.files?.[0])} />
                )}
                {caError && <p className="cpm-field__error">{caError}</p>}
                {noCa && <p className="cpm-field__error">{noCa}</p>}
              </div>
            )}
            {form.tlsMode === 'path' && (
              <div className="cpm-admin-indent">
                <input type="text" className="cpm-input cpm-mono" aria-label="CA file path on the server" value={form.caCertPath}
                  placeholder="/app/certs/mqtt-ca.crt" onChange={e => set('caCertPath', e.target.value)} />
                <p className="cpm-admin-caution">The path resolves on the SERVER (inside the ingestion-service container) — it must be readable by both the subscriber and the connection tester. Inline upload avoids this whole class of problem.</p>
              </div>
            )}
            {form.tlsMode === 'skip' && (
              <p className="cpm-admin-indent cpm-field__error">Traffic is encrypted but the broker is NOT authenticated — vulnerable to impersonation. Testing only.</p>
            )}
            <Field id={`${id}-sn`} label="TLS servername (optional)"
              help={help('TLS servername', <p>Only needed when reaching the broker by an address its certificate does not list — a bare &quot;Protocol error&quot; on connect is almost always this.</p>)}>
              <input id={`${id}-sn`} type="text" className="cpm-input cpm-mono" value={form.servername} placeholder="mosquitto"
                onChange={e => set('servername', e.target.value)} />
            </Field>
          </div>
        )}
      </Part>

      <Part title="Timeout">
        <div className="cpm-reg-form-grid">
          <Field id={`${id}-t`} label="Timeout (seconds)" help={help('Timeout', <p>Used by the connection test and the subscriber&apos;s connect attempt.</p>)}>
            <input id={`${id}-t`} type="number" className="cpm-input" value={form.timeoutSeconds}
              onChange={e => set('timeoutSeconds', Number(e.target.value))} />
          </Field>
        </div>
      </Part>

      <Part title="Next steps after saving">
        <p className="cpm-copy">1. Click <strong>Test</strong> to verify the broker accepts these credentials</p>
        <p className="cpm-copy">2. Every OT tag the gateway publishes must be mapped in the asset model (alias mapping) before its data can land — records for unknown tags are parked, not auto-created</p>
      </Part>
    </>
  );
};

export default AdvancedPane;
