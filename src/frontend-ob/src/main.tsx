'use client';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// H1: last-resort boundary — a shell crash renders a recover screen, not white.
import ErrorBoundary from './components/shared/ErrorBoundary';

// Self-hosted Noto Sans / Noto Sans Mono — vendored so nothing hits the Google
// Fonts CDN at runtime (dead on an air-gapped plant). Must load before OpenBridge
// CSS so its 'Noto Sans' references resolve to the bundled woff2.
import './styles/fonts.css';

// OpenBridge Design System - Global CSS (must be imported before any components)
import '@oicl/openbridge-webcomponents/dist/openbridge.css';

// Traverse tokens, then the bridge that assigns OpenBridge variables from them (CD1, CD5).
import './styles/traverse-tokens.css';
import './styles/openbridge-bridge.css';
import './styles/tones.css';
import './styles/signal-colours.css';
import './styles/state-colours.css';

// Compatibility aliases for names the older stylesheets use.
import './components/Designer/designTokens.css';

// Application-specific styles (extends OpenBridge tokens)
import './styles/app.css';

// HMI Dialog Design System — light-theme overrides for all dialogs, modals,
// detail panels, context menus, and forms
import './styles/hmi-dialogs.css';
import './styles/cpm.css';
import './ui/ui.css';
import './ui/components.css';
import './styles/cpm-evidence.css';
import './styles/cpm-blocks.css';
import './styles/cpm-administration.css';
import './styles/cpm-trend.css';
import './styles/cpm-config.css';
import './styles/cpm-registry.css';
import './styles/cpm-response.css';
import './styles/cpm-master-detail.css';
import './styles/cpm-calculations.css';
import './styles/cpm-replay.css';
import './styles/cpm-workbench.css';
import './styles/cpm-investigation.css';
import './styles/cpm-historical.css';
import './styles/cpm-explorer-tabs.css';
import './styles/cpm-explorer.css';
import './styles/cpm-episodes.css';
import './styles/cpm-overview.css';
import './styles/cpm-performance.css';
import './styles/cpm-pipeline.css';
import './styles/cpm-perf-list.css';
import './styles/cpm-context.css';
import './styles/cpm-loop-summary.css';
import './styles/cpm-responsive.css';
import './styles/cpm-evidence-layout.css';
import './styles/cpm-tables.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary scope="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
