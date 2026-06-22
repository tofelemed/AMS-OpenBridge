import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Listen on all network interfaces for container compatibility
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/hubs': {
        target: 'http://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/external-api': {
        target: 'http://192.168.1.51:8010/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/external-api/, ''),
        secure: false,
      },
    },
  },
});
