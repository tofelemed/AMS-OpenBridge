/**
 * api/cpm — the per-area CPM API modules introduced in v2.5. Existing endpoints stay in
 * ../cpmApi.ts; import new areas from here.
 */
export * from './capabilities';
export * from './gates';
export * from './kpis';
export * from './verdict';
export * from './health';
export * from './catalogue';
export { CPM_BASE } from './base';
