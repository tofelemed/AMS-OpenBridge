/**
 * SPEC §6.2 and §3: breadcrumb, title, one identity or scope line, page controls and the page's one
 * primary action. There is no purpose sentence: that lives in the sidebar item and the ? help.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cpaHref } from '../components/Cpm/cpaHref';

export const ContextHeader: React.FC<{
  title: string;
  /** Crumbs between CPA and the title. */
  trail?: Array<{ label: string; to: string }>;
  /** One line: the loop's identity or the scope. */
  identity?: React.ReactNode;
  controls?: React.ReactNode;
  primaryAction?: React.ReactNode;
}> = ({ title, trail = [], identity, controls, primaryAction }) => {
  const { search } = useLocation();
  return (
    <header className="ui-context">
      <nav aria-label="Breadcrumb">
        <ol className="ui-context__crumbs">
          <li><Link to={cpaHref('/cpm', search)}>CPA</Link></li>
          {trail.map(c => <li key={c.to}><Link to={c.to}>{c.label}</Link></li>)}
          <li aria-current="page">{title}</li>
        </ol>
      </nav>
      <div className="ui-context__row">
        <div className="ui-context__heading">
          <h1 className="ui-context__title">{title}</h1>
          {identity && <div className="ui-context__identity">{identity}</div>}
        </div>
        {(controls || primaryAction) && (
          <div className="ui-context__controls">
            {controls}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
};
