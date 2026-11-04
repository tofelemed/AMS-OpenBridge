#!/usr/bin/env node
// PRM-004 §5.2: serves the production build (src/frontend-ob/dist) for evidence, exactly as
// `vite preview` does, on http://localhost:4173. Evidence tooling only; nothing here ships.
//
// Why not plain `vite preview`: the lab auth service allows only the origins :3000 and :5174
// (CORS_ORIGIN) and answers 500 for any other. :3000 is the deployed image and :5174 is another
// checkout's dev server, so neither can serve this build. The check applies to browsers only: a
// request with no Origin passes it, and the password is still required. This proxy therefore
// drops the Origin header. See decision UI-013 in docs/theme/redesign/decision-ui.md.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../src/frontend-ob');
const { preview } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);

const gateway = 'http://localhost:8081';
const dropOrigin = proxy => {
  proxy.on('proxyReq', req => req.removeHeader('origin'));
  proxy.on('proxyReqWs', req => req.removeHeader('origin'));
};
const route = ws => ({ target: gateway, changeOrigin: true, ws, configure: dropOrigin });

const server = await preview({
  root,
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': route(false), '/hubs': route(true), '/mqtt-ws': route(true) },
  },
});
server.printUrls();
