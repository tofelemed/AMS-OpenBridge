'use client';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
    <App />
  </React.StrictMode>
);
