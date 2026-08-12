'use client';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// H1: last-resort boundary — a shell crash renders a recover screen, not white.
import ErrorBoundary from './components/shared/ErrorBoundary';

// OpenBridge Design System - Global CSS (must be imported before any components)
import '@oicl/openbridge-webcomponents/dist/openbridge.css';

// Phase H — AMS design tokens (single source: alarm + trend colors, day/night palettes)
import './components/Designer/designTokens.css';

// Application-specific styles (extends OpenBridge tokens)
import './styles/app.css';

// HMI Dialog Design System — light-theme overrides for all dialogs, modals,
// detail panels, context menus, and forms
import './styles/hmi-dialogs.css';
import './styles/cpm.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary scope="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
