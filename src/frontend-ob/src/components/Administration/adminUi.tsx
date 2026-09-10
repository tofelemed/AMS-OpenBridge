'use client';

// Card primitives shared by the Administration → Data Sources surfaces.
// Extracted from DataSourcesConfig so LoopIngestPanel can reuse them without
// importing from the page that renders it (which would be a circular import).
// Colours come from the shared OpenBridge token map (T), never raw hex.

import React from 'react';
import { T } from '../../styles/theme';

const MONO = "'Noto Sans Mono', monospace";

export const Pill: React.FC<{ text: string; color: string; mono?: boolean }> = ({ text, color, mono }) => (
  <span style={{
    fontSize: '11px', fontWeight: 700, color, border: `1px solid ${color}`,
    borderRadius: '999px', padding: '2px 10px',
    fontFamily: mono ? MONO : 'inherit',
  }}>
    {text}
  </span>
);

export const Fact: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({
  label, value, mono, color,
}) => (
  <div>
    <div style={{
      fontSize: '10.5px', fontWeight: 700, color: T.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px',
    }}>
      {label}
    </div>
    <div style={{
      fontSize: '13px', color: color ?? T.textPrimary, wordBreak: 'break-all',
      fontFamily: mono ? MONO : 'inherit',
    }}>
      {value}
    </div>
  </div>
);

export const monoFamily = MONO;
