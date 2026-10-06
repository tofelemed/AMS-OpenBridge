/**
 * SME review #14 (CHG-051): an engine code shown as its engineering label, with the raw code on hover so
 * an engineer can still look it up or search for it. The one way a page prints a code.
 */
import React from 'react';
import { codeLabel, diagnosisLabel } from './vocabulary';

export const CodeLabel: React.FC<{ code: string | null | undefined; kind?: 'diagnosis'; className?: string }> = ({ code, kind, className }) => {
  if (!code) return <span className={className}>—</span>;
  const text = kind === 'diagnosis' ? diagnosisLabel(code) : codeLabel(code);
  return <span className={className} title={text === code ? undefined : code}>{text}</span>;
};

export default CodeLabel;
