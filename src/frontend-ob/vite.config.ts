import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Plan 04 item 7: dev proxies to the API GATEWAY (compose service, host
    // port 8081), not to individual services — dev/prod parity. The gateway
    // owns the whole route map (rewrites, edge auth, rate limits, caching);
    // this table no longer re-implements it per service.
    proxy: {
      '/api': {
        target:      'http://localhost:8081',
        changeOrigin: true,
      },
      '/hubs': {
        // SignalR (alarm realtime) — WebSocket upgrade through the gateway.
        target:      'http://localhost:8081',
        changeOrigin: true,
        ws:          true,
      },
      '/mqtt-ws': {
        // EMQX MQTT-over-WebSocket — the gateway authenticates the upgrade and
        // rewrites /mqtt-ws → /mqtt (no rewrite here).
        target:      'ws://localhost:8081',
        ws:          true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
