// CHG-172: the data-source editor's form, checks and request, moved out of DataSourceWizard.tsx unchanged: every default,
// check and message word for word, the stored profile_config carried across, a blank password kept on edit.
import { describe, expect, it } from 'vitest';
import type { DataSourceDto, ProfileInfo } from '../dataSourcesApi';
import { buildBody, formFrom, stepProblem, tlsUnverifiedWarning, type WizardForm } from './wizardForm';

const profiles: ProfileInfo[] = [
  { profileType: 'MQTT_LOOP_SAMPLES', displayName: 'Control-Loop Signals (CPA)', module: 'Loop Performance (CPM)', transport: 'MQTT',
    description: 'Per-parameter control-loop feed.', destination: 'traverse.cpa.loop.samples.v1', defaultTopics: ['OT/+/+/+/+/PIDParams/+'] },
  { profileType: 'MQTT_PRM', displayName: 'PRM (MQTT Gateway)', module: 'Device Diagnostics (PRM)', transport: 'MQTT',
    description: 'PRM upload.', destination: 'traverse.prm', defaultTopics: ['prm/#'] },
];
const existing = {
  configId: 'cfg-1', sourceType: 'MQTT', profileType: 'MQTT_LOOP_SAMPLES', name: 'OT Gateway (loop samples)', description: null,
  connectionUrl: 'mqtt://broker.example:1883', username: 'ingest_user', hasPassword: true, timeoutSeconds: 15, insecureSkipVerify: false,
  profileConfig: { mqtt: { topics: ['OT/a/#', 'OT/b/#'], qos: 1, keepalive_seconds: 60 }, loop_ingest: { mode_value_map: { 1: 'AUT' } } },
  isActive: true, effectiveClientId: 'ingestion-cfg-1', createdAt: '', createdBy: '', updatedAt: '', version: 3,
} as unknown as DataSourceDto;

const valid = (): WizardForm => ({ ...formFrom(profiles), name: 'Gateway', connectionUrl: 'mqtt://broker.example:1883', username: 'ingest_user', password: 'secret' });

describe('the defaults', () => {
  it('starts a new source on the first profile with its suggested topics and the safe session settings', () => {
    expect(formFrom(profiles)).toMatchObject({
      profileType: 'MQTT_LOOP_SAMPLES', topics: ['OT/+/+/+/+/PIDParams/+'], qos: 1, sessionExpirySeconds: 86400, keepaliveSeconds: 60,
      cleanSession: false, timeoutSeconds: 30, tlsMode: 'upload', password: '',
    });
  });

  it('starts an edit from the stored source', () => {
    expect(formFrom(profiles, existing)).toMatchObject({ name: 'OT Gateway (loop samples)', topics: ['OT/a/#', 'OT/b/#'], timeoutSeconds: 15, password: '' });
  });
});

describe('the checks, word for word', () => {
  const ctx = { profileKnown: true, isEdit: false, caError: null };
  it('names the first problem of each step', () => {
    const f = valid();
    expect(stepProblem(0, f, { ...ctx, profileKnown: false })).toBe('Choose a data source profile');
    expect(stepProblem(1, { ...f, name: '  ' }, ctx)).toBe('Name is required');
    expect(stepProblem(2, { ...f, connectionUrl: '' }, ctx)).toBe('Broker URL is required');
    expect(stepProblem(2, { ...f, connectionUrl: 'tcp://x:1' }, ctx)).toBe('URL must look like mqtt://host:1883 or mqtts://host:8883');
    expect(stepProblem(2, { ...f, username: '' }, ctx)).toBe('Username is required');
    expect(stepProblem(2, { ...f, password: '' }, ctx)).toBe('Password is required');
    expect(stepProblem(2, { ...f, password: '' }, { ...ctx, isEdit: true })).toBeNull();
    expect(stepProblem(3, { ...f, topics: [' '] }, ctx)).toBe('At least one topic filter is required');
    expect(stepProblem(3, { ...f, topics: ['a/#/b'] }, ctx)).toBe(`Invalid topic filter "a/#/b" — '#' must be the last level`);
    expect(stepProblem(3, { ...f, clientId: 'bad id' }, ctx)).toBe("Client ID may contain letters, digits, '_' and '-' (max 64 chars)");
    expect(stepProblem(3, { ...f, sessionExpirySeconds: -1 }, ctx)).toBe('Session expiry must be 0 or greater');
    expect(stepProblem(3, { ...f, keepaliveSeconds: 0 }, ctx)).toBe('Keepalive must be greater than 0');
    expect(stepProblem(3, { ...f, timeoutSeconds: 0 }, ctx)).toBe('Timeout must be greater than 0');
    expect(stepProblem(3, f, { ...ctx, caError: 'Not a PEM certificate (missing BEGIN CERTIFICATE)' })).toBe('Not a PEM certificate (missing BEGIN CERTIFICATE)');
    expect([0, 1, 2, 3].map(s => stepProblem(s, f, ctx))).toEqual([null, null, null, null]);
  });

  it('warns when TLS has no CA certificate loaded', () => {
    expect(tlsUnverifiedWarning(valid())).toBeNull();
    expect(tlsUnverifiedWarning({ ...valid(), connectionUrl: 'mqtts://broker.example:8883' })).toContain('No CA certificate loaded');
  });
});

describe('the request', () => {
  it('creates with the same body as before', () => {
    expect(buildBody(valid())).toEqual({
      sourceType: 'MQTT', profileType: 'MQTT_LOOP_SAMPLES', name: 'Gateway', description: undefined,
      connectionUrl: 'mqtt://broker.example:1883', username: 'ingest_user', timeoutSeconds: 30, insecureSkipVerify: false, password: 'secret',
      profileConfig: { mqtt: { topics: ['OT/+/+/+/+/PIDParams/+'], qos: 1, client_id: undefined, clean_session: false,
        session_expiry_seconds: 86400, keepalive_seconds: 60, tls: undefined } },
    });
  });

  it('carries every stored block across an edit and keeps a blank password out of the body', () => {
    const body = buildBody(formFrom(profiles, existing), existing);
    expect(body.profileConfig?.loop_ingest).toEqual({ mode_value_map: { 1: 'AUT' } });
    expect(body.profileConfig?.mqtt?.topics).toEqual(['OT/a/#', 'OT/b/#']);
    expect('password' in body).toBe(false);
  });

  it('sends the TLS block for mqtts and Do not verify as insecureSkipVerify', () => {
    const tls = { ...valid(), connectionUrl: 'mqtts://broker.example:8883', caCertPath: '/app/certs/ca.crt', tlsMode: 'path' as const, servername: 'mosquitto' };
    expect(buildBody(tls).profileConfig?.mqtt?.tls).toEqual({ ca_cert_pem: undefined, ca_cert_path: '/app/certs/ca.crt', servername: 'mosquitto' });
    const skip = buildBody({ ...tls, tlsMode: 'skip' });
    expect(skip.insecureSkipVerify).toBe(true);
    expect(skip.profileConfig?.mqtt?.tls).toBeUndefined();
  });
});
