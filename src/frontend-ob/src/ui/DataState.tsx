/**
 * SPEC §6.12, skill §9: every data state has a short title, its reason and one recovery action
 * (G06). An error never appears with empty text. A loading state keeps the page's context around it.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

export type DataStateKind =
  | 'loading' | 'empty' | 'filtered-empty' | 'partial' | 'stale' | 'bad-quality'
  | 'unavailable' | 'error' | 'restricted';

const TITLES: Record<DataStateKind, string> = {
  loading: 'Loading',
  empty: 'No records',
  'filtered-empty': 'No records match these filters',
  partial: 'Partial data',
  stale: 'Stale',
  'bad-quality': 'Bad quality',
  unavailable: 'Unavailable',
  error: 'Could not load this data',
  restricted: 'Not available for your role',
};

const reasonOf = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The service did not respond.';
};

const Skeleton: React.FC<{ label: string; rows: number }> = ({ label, rows }) => (
  <div className="ui-skeleton" role="status" data-testid="state-loading">
    <span className="ui-sr">{label}</span>
    {Array.from({ length: rows }, (_, i) => <span key={i} className="ui-skeleton__row" aria-hidden="true" />)}
  </div>
);

export const DataState: React.FC<{
  kind: DataStateKind;
  title?: string;
  reason?: string;
  /** For `error`: the failure. Its message becomes the reason. */
  error?: unknown;
  /** One recovery action, for example a link. */
  action?: React.ReactNode;
  onRetry?: () => void;
  onReset?: () => void;
  /** For `loading`: what is loading, and how many rows to sketch. */
  label?: string;
  rows?: number;
  /** For `stale`, `partial` and `bad-quality`: the retained content, kept visible under the notice. */
  children?: React.ReactNode;
}> = ({ kind, title, reason, error, action, onRetry, onReset, label, rows = 4, children }) => {
  if (kind === 'loading') return <Skeleton label={label ?? 'Loading'} rows={rows} />;

  const text = reason ?? (kind === 'error' ? reasonOf(error) : undefined);
  const recovery = action
    ?? (onRetry ? <ObcButton variant="normal" onClick={onRetry}>Retry</ObcButton> : undefined)
    ?? (onReset ? <ObcButton variant="normal" onClick={onReset}>Reset filters</ObcButton> : undefined);
  const notice = (
    <div className={`ui-state ui-state--${kind}`} role={kind === 'error' ? 'alert' : 'status'} data-testid={`state-${kind}`}>
      <h2 className="ui-state__title">{title ?? TITLES[kind]}</h2>
      {text && <p className="ui-state__reason">{text}</p>}
      {recovery && <div className="ui-state__action">{recovery}</div>}
    </div>
  );

  if (!children) return notice;
  return <div className="ui-state-wrap" data-state={kind}>{notice}{children}</div>;
};
