// H2 — the single axios stack for authenticated REST.
//
// Before this, alarmApi/usersApi/rolesApi (and inline axios in Analytics,
// HistoricalViewer, AlarmFeedConfig) attached a static bearer and bypassed both
// halves of the session contract that apiFetch implements:
//   1. markApiActivity()  — so an operator acking alarms all shift looked "idle"
//      to the watchdog and was force-logged-out mid-shift;
//   2. the 401 → silent-refresh → replay-once path — so the first call after a
//      token expiry hard-failed instead of self-healing.
// Every axios caller now goes through this instance. Machine-initiated calls
// (login hydration, interval polls) pass `skipActivity: true` so parked tabs
// still idle out; user actions mark activity by default.
import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken } from './auth';
import { useAuthStore } from '../store/authStore';
import { markApiActivity } from '../auth/sessionClock';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** true = machine-initiated (hydration/poll): do not extend the idle clock. */
    skipActivity?: boolean;
    /** internal: set after the one silent-refresh replay to prevent loops. */
    _retried?: boolean;
  }
}

export const authedAxios = axios.create();

authedAxios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
    if (!config.skipActivity) markApiActivity();
  }
  return config;
});

authedAxios.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (AxiosRequestConfig & InternalAxiosRequestConfig) | undefined;
  if (error.response?.status === 401 && config && !config._retried) {
    const refreshed = await useAuthStore.getState().refresh();
    if (refreshed) {
      config._retried = true;
      // The request interceptor re-attaches the (new) token on replay.
      return authedAxios.request(config);
    }
  }
  throw error;
});
