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
    rollupOptions: {
      output: {
        // FE-07: the heavy vendors used to chunk only along route-lazy boundaries, so
        // whichever page loaded first paid for echarts/ag-grid/mqtt in its own chunk
        // and re-downloads were possible across entries. Named vendor chunks are
        // shared, cached once, and keep page chunks small.
        manualChunks: {
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-aggrid':  ['ag-grid-community', 'ag-grid-react'],
          'vendor-mqtt':    ['mqtt', 'sparkplug-payload'],
          'vendor-d3':      ['d3'],
        },
      },
    },
  },
});
