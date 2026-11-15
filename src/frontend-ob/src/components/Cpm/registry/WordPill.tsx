/**
 * CHG-201: one pill for the Loop Registry's words. A plain fact ("Connected", "Receiving data", "Monitoring on") is the pill
 * with no glyph and no colour; an item to look at is amber with "!"; a fact that needs nothing is muted with its glyph. Owner
 * Q3: no green for a normal state.
 */
import React from 'react';
import { TonePill } from '../shared';

export interface PillWord { label: string; tone: 'plain' | 'warn' | 'muted'; glyph?: string }

export const WordPill: React.FC<{ word: PillWord }> = ({ word }) => (word.tone === 'plain'
  ? <span className="cpm-pill">{word.label}</span>
  : <TonePill tone={word.tone} glyph={word.glyph}>{word.label}</TonePill>);

export default WordPill;
