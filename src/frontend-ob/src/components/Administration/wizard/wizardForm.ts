/**
 * The data-source editor's form: its fields and defaults, the checks of each tab and the request it sends. Moved out of
 * DataSourceWizard.tsx in CHG-172 without a change: every default, check and message is word for word, the stored
 * profile_config is carried across a save, and on edit a blank password keeps the stored one.
 */
import {
  CONNECTION_URL_PATTERN, isValidTopicFilter, type DataSourceDto, type ProfileInfo, type SaveDataSourceRequest,
} from '../dataSourcesApi';

export type TlsMode = 'upload' | 'path' | 'skip';

export interface WizardForm {
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

/** The editor's tabs (they were the steps of a full-page wizard). */
export const WIZARD_TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'name', label: 'Name' },
  { value: 'connection', label: 'Connection' },
  { value: 'advanced', label: 'Advanced' },
] as const;
export type WizardTab = (typeof WIZARD_TABS)[number]['value'];

export function formFrom(profiles: ProfileInfo[], existing?: DataSourceDto): WizardForm {
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

export const isTlsUrl = (url: string) => /^(mqtts|ssl):\/\//.test(url.trim());
export const cleanTopicsOf = (form: WizardForm) => form.topics.map(t => t.trim()).filter(t => t.length > 0);

/** The first problem on one tab (0 Profile, 1 Name, 2 Connection, 3 Advanced), or null. */
export function stepProblem(step: number, form: WizardForm, ctx: { profileKnown: boolean; isEdit: boolean; caError: string | null }): string | null {
  switch (step) {
    case 0:
      return ctx.profileKnown ? null : 'Choose a data source profile';
    case 1:
      return form.name.trim() ? null : 'Name is required';
    case 2: {
      if (!form.connectionUrl.trim()) return 'Broker URL is required';
      if (!CONNECTION_URL_PATTERN.test(form.connectionUrl.trim())) return 'URL must look like mqtt://host:1883 or mqtts://host:8883';
      if (!form.username.trim()) return 'Username is required';
      if (!ctx.isEdit && !form.password) return 'Password is required';
      return null;
    }
    case 3: {
      const topics = cleanTopicsOf(form);
      if (topics.length === 0) return 'At least one topic filter is required';
      const bad = topics.find(t => !isValidTopicFilter(t));
      if (bad) return `Invalid topic filter "${bad}" — '#' must be the last level`;
      if (form.clientId.trim() && !/^[A-Za-z0-9_-]{1,64}$/.test(form.clientId.trim())) return "Client ID may contain letters, digits, '_' and '-' (max 64 chars)";
      if (form.sessionExpirySeconds < 0) return 'Session expiry must be 0 or greater';
      if (form.keepaliveSeconds <= 0) return 'Keepalive must be greater than 0';
      if (form.timeoutSeconds <= 0) return 'Timeout must be greater than 0';
      if (ctx.caError) return ctx.caError;
      return null;
    }
    default:
      return null;
  }
}

export function tlsUnverifiedWarning(form: WizardForm): string | null {
  return isTlsUrl(form.connectionUrl) && form.tlsMode === 'upload' && !form.caCertPem
    ? 'No CA certificate loaded — the test will fail with "self-signed certificate in certificate chain" unless the broker’s certificate chains to a system root. Provide a CA or choose "Do not verify".'
    : null;
}

export function buildBody(form: WizardForm, existing?: DataSourceDto): SaveDataSourceRequest {
  const isTls = isTlsUrl(form.connectionUrl);
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
      // Carry every stored block across: PUT replaces profile_config wholesale, so a key absent here is DELETED. This editor
      // renders only `mqtt`, and rebuilding the object from scratch silently wiped `loop_ingest` (mode_value_map, param_roles,
      // grid_seconds, topic_template) on any save.
      ...(existing?.profileConfig ?? {}),
      mqtt: {
        topics: cleanTopicsOf(form),
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
  return body;
}
