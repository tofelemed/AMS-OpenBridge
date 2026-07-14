import { apiFetch } from './apiFetch';
export interface BffHealth {
  status: string;
  iotdb:  string;
  redis:  string;
  checks?: Record<string, { status: string; description?: string }>;
}

/** Fetch historian-bff /health — supports JSON and legacy plain-text responses. */
export async function fetchHistorianBffHealth(): Promise<BffHealth> {
  const res = await apiFetch('/api/hist/health');

  const contentType = res.headers.get('content-type') ?? '';
  let body: BffHealth;

  if (contentType.includes('application/json')) {
    body = await res.json() as BffHealth;
  } else {
    const text = (await res.text()).trim();
    if (text.startsWith('{')) {
      body = JSON.parse(text) as BffHealth;
    } else {
      const ok = text.toLowerCase() === 'healthy';
      body = {
        status: ok ? 'Healthy' : 'Degraded',
        iotdb:  ok ? 'Healthy' : 'Unknown',
        redis:  ok ? 'Healthy' : 'Unknown',
        checks: { legacy: { status: text, description: 'Plain-text health response — rebuild historian-bff for JSON' } },
      };
    }
  }

  if (!res.ok && res.status !== 503) {
    throw new Error(`Historian BFF health check failed: HTTP ${res.status}`);
  }

  return body;
}
