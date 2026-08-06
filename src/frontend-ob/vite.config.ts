import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api/hist': {
        // Phase 5: Historian BFF — proxied in dev so /api/hist/* hits localhost:8090
        target:      'http://localhost:8090',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api\/hist/, ''),
      },
      '/api/displays': {
        target:      'http://localhost:5003',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api/, ''),
      },
      '/api/bindings': {
        target:      'http://localhost:5002',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api\/bindings/, ''),
      },
      '/api/assets': {
        // Asset Model service (UNS catalog) — powers the designer's AssetBrowser/TagPicker.
        target:      'http://localhost:5001',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api\/assets/, '/assets'),
      },
      '/api/templates': {
        // Template service — was missing, so TemplatePalette's calls fell through to the /api catch-all.
        // Callers use `${'/api/templates'}/templates`, so strip the prefix entirely: → /templates.
        target:      'http://localhost:5004',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api\/templates/, ''),
      },
      '/api/auth': {
        // Auth service (login, refresh, RBAC) — serves /api/auth/* directly, no rewrite.
        target:      'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/audit': {
        // Audit service (immutable hash-chained trail) — /api/audit/* → /api/v1/audit/*.
        // Cannot ride the /api/v1 catch-all: that one goes to ams-api.
        target:      'http://localhost:8095',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api\/audit/, '/api/v1/audit'),
      },
      '/api/v1/cpm': {
        // CPLM extraction Phase 5 — loop-performance API is its own service now.
        target:      'http://localhost:5006',
        changeOrigin: true,
      },
      '/api/v1': {
        // AMS .NET API (alarms REST) — runs in Docker on host port 8000.
        target:      'http://localhost:8000',
        changeOrigin: true,
      },
      '/hubs': {
        // AMS SignalR hubs (alarm realtime) → ams-api:8000, WebSocket upgrade.
        target:      'http://localhost:8000',
        changeOrigin: true,
        ws:          true,
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/alarmHub': {
        target: 'http://localhost:5000',
        ws: true,
      },
      '/mqtt-ws': {
        // Phase 5: EMQX WebSocket — proxied for dev; prod uses direct VITE_MQTT_WS_URL
        target:      'ws://localhost:8083',
        ws:          true,
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/mqtt-ws/, '/mqtt'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
