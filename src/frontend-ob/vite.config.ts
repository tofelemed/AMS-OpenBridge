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
