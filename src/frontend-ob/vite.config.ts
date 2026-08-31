import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  // Build identity for the login status strip — one place to read the real
  // version from, instead of a hand-maintained literal that drifts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
        //
        // H12: MUST be the FUNCTION form. The object form hoisted every listed
        // package into the ENTRY graph — index.html modulepreloaded vendor-aggrid
        // (1.25MB) + vendor-mqtt (482KB) so even /login downloaded ~2MB of JS.
        // The function form only names the chunk; whether it loads eagerly or
        // lazily follows the real import graph (ag-grid: two lazy routes;
        // mqtt: dynamic import inside mqttStore.connect()).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // Pin the shared foundations FIRST — without this, CJS interop let
          // Rollup swallow react into vendor-aggrid, which made the ENTRY
          // statically import the 1.25MB grid chunk just to get React.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]node_modules[\\/](echarts|zrender|echarts-for-react)[\\/]/.test(id)) return 'vendor-echarts';
          if (/[\\/]node_modules[\\/](ag-grid-community|ag-grid-react)[\\/]/.test(id)) return 'vendor-aggrid';
          if (/[\\/]node_modules[\\/](mqtt|sparkplug-payload)[\\/]/.test(id)) return 'vendor-mqtt';
          if (/[\\/]node_modules[\\/]d3(-[a-z0-9-]+)?[\\/]/.test(id)) return 'vendor-d3';
          return undefined;
        },
      },
    },
  },
});
