/** The head of a Gate Configuration sub-page: back link, title, lead, pills, actions. No eyebrow. */
import React from 'react';
import { Link } from 'react-router-dom';

export const SubPageHead: React.FC<{
  backHref: string; backLabel: string; title: string; lead?: string | null; pills?: React.ReactNode; actions?: React.ReactNode;
}> = ({ backHref, backLabel, title, lead, pills, actions }) => (
  <div className="cpm-reg-detail-head">
    <Link className="cpm-reg-back" to={backHref}><span aria-hidden>{'‹ '}</span>{backLabel}</Link>
    <header className="cpm-workspace-header">
      <div className="cpm-reg-detail-head__id">
        <h1 className="cpm-title">{title}</h1>
        {lead && <p className="cpm-reg-detail-head__lead">{lead}</p>}
        {pills && <div className="cpm-reg-detail-head__pills">{pills}</div>}
      </div>
      {actions && <div className="cpm-workspace-header__actions cpm-reg-detail-head__actions">{actions}</div>}
    </header>
  </div>
);

export default SubPageHead;
