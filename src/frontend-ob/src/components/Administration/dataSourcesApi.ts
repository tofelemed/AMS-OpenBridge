// Typed API layer for /api/ingestion (ingestion-service, gateway-routed).
// Permissions: reads need ingestion.view, writes ingestion.manage (Admin-only).
import axios from 'axios';
import { authedAxios } from '../../api/http';

const BASE = '/api/ingestion';

/** profile_config.mqtt wire contract — snake_case keys, shared with the phase-2 subscriber. */
export interface MqttTlsConfig {
  ca_cert_pem?: string;
  ca_cert_path?: string;
  servername?: string;
}

export interface MqttConfig {
  topics?: string[];
  qos?: 0 | 1 | 2;
  client_id?: string;
  clean_session?: boolean;
  session_expiry_seconds?: number;
  keepalive_seconds?: number;
  tls?: MqttTlsConfig;
}

export interface ProfileConfig {
  mqtt?: MqttConfig;
}

export interface DataSourceDto {
  configId: string;
  sourceType: string;
  profileType?: string | null;
  name: string;
  description?: string | null;
  connectionUrl: string;
  username: string;
  hasPassword: boolean;
  timeoutSeconds: number;
  insecureSkipVerify: boolean;
  profileConfig: ProfileConfig;
  isActive: boolean;
  lastConnectionTest?: string | null;
  lastConnectionStatus?: 'SUCCESS' | 'FAILED' | 'PENDING' | null;
  lastConnectionError?: string | null;
  lastDataReceived?: string | null;
  effectiveClientId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string | null;
  version: number;
}

export interface ProfileInfo {
  profileType: string;
  displayName: string;
  /** Which consolidated-app module this profile's data feeds. */
  module: string;
  transport: string;
  description: string;
  /** Pipeline destination the parsed data lands on (informational until the phase-2 subscriber). */
  destination: string;
  /** Suggested MQTT topic filters pre-filled into the wizard for this module. */
  defaultTopics: string[];
}

export interface SaveDataSourceRequest {
  sourceType?: string;
  profileType?: string;
  name?: string;
  description?: string;
  connectionUrl?: string;
  username?: string;
  /** Create: required. Update: omit or "" keeps the stored password. */
  password?: string;
  timeoutSeconds?: number;
  insecureSkipVerify?: boolean;
  profileConfig?: ProfileConfig;
}

export interface TestResult {
  ok: boolean;
  error?: string | null;
  latencyMs: number;
  status: 'SUCCESS' | 'FAILED';
}

export const listDataSources = async (): Promise<DataSourceDto[]> =>
  (await authedAxios.get<DataSourceDto[]>(`${BASE}/data-sources`, { skipActivity: true })).data;

export const listProfiles = async (): Promise<ProfileInfo[]> =>
  (await authedAxios.get<ProfileInfo[]>(`${BASE}/profiles`, { skipActivity: true })).data;

export const createDataSource = async (body: SaveDataSourceRequest): Promise<DataSourceDto> =>
  (await authedAxios.post<DataSourceDto>(`${BASE}/data-sources`, body)).data;

export const updateDataSource = async (id: string, body: SaveDataSourceRequest): Promise<DataSourceDto> =>
  (await authedAxios.put<DataSourceDto>(`${BASE}/data-sources/${id}`, body)).data;

export const deleteDataSource = async (id: string): Promise<void> => {
  await authedAxios.delete(`${BASE}/data-sources/${id}`);
};

export const testDataSource = async (id: string): Promise<TestResult> =>
  (await authedAxios.post<TestResult>(`${BASE}/data-sources/${id}/test`)).data;

export const setDataSourceActive = async (id: string, active: boolean): Promise<DataSourceDto> =>
  (await authedAxios.post<DataSourceDto>(`${BASE}/data-sources/${id}/${active ? 'activate' : 'deactivate'}`)).data;

/** Server 400s carry { error, field } so the wizard can route focus to the owning step. */
export function extractApiError(err: unknown): { message: string; field?: string } {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; field?: string } | undefined;
    if (data?.error) return { message: data.error, field: data.field };
    return { message: err.message };
  }
  return { message: err instanceof Error ? err.message : 'Request failed' };
}

/** Mirror of the server-side topic-filter rule ('#' only as the whole last level, '+' a whole level). */
export function isValidTopicFilter(filter: string): boolean {
  if (!filter.trim()) return false;
  const levels = filter.split('/');
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (level === '#') {
      if (i !== levels.length - 1) return false;
    } else if (level.includes('#')) {
      return false;
    } else if (level.includes('+') && level !== '+') {
      return false;
    }
  }
  return true;
}

export const CONNECTION_URL_PATTERN = /^(mqtt|mqtts):\/\/[^\s/:]+(:\d{1,5})?$/;
