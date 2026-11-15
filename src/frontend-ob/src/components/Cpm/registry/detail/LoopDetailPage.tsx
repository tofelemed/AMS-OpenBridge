'use client';

/**
 * CHG-201 (owner-approved mockup docs/theme/redesign/samples/loop-detail-proposal.html, 15 Nov 2026): one loop's own page,
 * /cpm/registry/:loopId, a sub-page of Loop Registry (the sidebar keeps Loop Registry selected). It replaced the side panel
 * (CHG-168 LoopPanel); its facts are here in the owner's words: "everything according to the user's perspective, not the
 * developer's". The head (DetailHeader), then the cards, two columns from 1280 px: Where it is · How it is controlled ·
 * Signals (full width) · Ready for analysis · Analysis settings · Linked loops · Changes.
 *
 * It reads its loop (GET /loops/{id}), its readiness once and the plant names (the cached whole-tree read); a retired loop's open
 * episode is read once (UI-131). A loop that does not exist says so with "‹ All loops". The list's address rides in this page's
 * query, so "‹ All loops" and a linked loop's page keep it.
 */
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../../api/apiFetch';
import type { LoopRetireResult } from '../../../../api/cpm/loopRetire';
import { useCpmEvents, useCpmLoop, useCpmReadiness } from '../../../../hooks/useCpm';
import { useAuthStore } from '../../../../store/authStore';
import AddLoopWizard from '../../AddLoopWizard';
import { byNow, receiptDone, useReceiptUser, type Receipt } from '../../ActionReceipt';
import { EmptyState, QueryError } from '../../shared';
import { usePlantLocations } from '../../plantLocation';
import { placeOf } from '../loopFacts';
import { loopReadiness } from '../readinessRules';
import { listPageHref, loopPageHref } from '../registryUrl';
import { RetireLoopDialog } from '../RetireLoopDialog';
import { AnalysisSection, ChangesSection, ControlSection, WhereSection } from './AboutSections';
import { BackToList, DetailHeader } from './DetailHeader';
import { LinksSection, ReadySection } from './ReadyAndLinks';
import { SignalsSection } from './SignalsSection';

/** One instance per loop: a linked loop's page starts with no retire answer, dialog or receipt left from the last loop. */
export const LoopDetailPage: React.FC = () => {
  const { loopId = '' } = useParams();
  return <LoopDetail key={loopId} loopId={loopId} />;
};

const LoopDetail: React.FC<{ loopId: string }> = ({ loopId }) => {
  const [params] = useSearchParams();
  const listHref = listPageHref(params);
  const query = useCpmLoop(loopId);
  const stored = query.data;
  // After Retire or Restore the page follows the answer at once, until the loop read agrees with it.
  const [asked, setAsked] = useState<boolean | null>(null);
  useEffect(() => { if (asked !== null && stored?.isActive === asked) setAsked(null); }, [asked, stored?.isActive]);
  const loop = stored && asked !== null ? { ...stored, isActive: asked } : stored;
  const readiness = useCpmReadiness(stored?.loopId);
  const locations = usePlantLocations().data;
  const retired = !!loop && !loop.isActive;
  // A retired loop's open episode is read once: nothing new opens on it (0 = no polling).
  const episodes = useCpmEvents({ loopId: loop?.loopId, openOnly: true, includeShelved: true, limit: 1, sort: 'recent' }, 0, retired);
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const user = useReceiptUser();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'retire' | 'restore' | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  if (!loop) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="cpm-screen cpm-registry cpm-reg-detail-page">
        <BackToList href={listHref} />
        {notFound && <EmptyState level={2} title={`No loop ${loopId}`} copy="It was renamed, removed or never added." />}
        {!notFound && query.isError && <QueryError title="This loop could not be read" error={query.error} retry={() => void query.refetch?.()} />}
        {!query.isError && <EmptyState level={2} title="Loading loop…" />}
      </div>
    );
  }

  const done = (r: LoopRetireResult) => {
    setDialog(null);
    if (r.changed) setAsked(!r.retired);
    setReceipt(receiptDone(r.changed
      ? `${r.retired ? 'Retired' : 'Restored'} ${r.loopId} ${byNow(user)}.`
      : (r.note ?? `${r.loopId} was already ${r.retired ? 'retired' : 'active'}; nothing changed.`), loop.loopId));
  };
  const ready = loopReadiness(loop, readiness.data);
  const hrefFor = (id: string) => loopPageHref(id, params);

  return (
    <div className="cpm-screen cpm-registry cpm-reg-detail-page">
      <DetailHeader loop={loop} listHref={listHref} missing={ready.missing} canManage={canManage}
        receipt={receipt} onReceipt={setReceipt} onEdit={() => setEditing(true)} onRetire={setDialog} />
      <div className="cpm-reg-detail">
        <WhereSection loop={loop} place={placeOf(locations, loop)} />
        <ControlSection loop={loop} />
        <SignalsSection loop={loop} readiness={readiness} />
        <ReadySection readiness={ready} />
        <AnalysisSection loop={loop} canReadConfig={canReadConfig} />
        <LinksSection loop={loop} hrefFor={hrefFor} />
        <ChangesSection loop={loop} openEpisode={retired ? episodes.data?.events?.[0] : null} />
      </div>
      {editing && <AddLoopWizard existing={[]} editLoop={loop} onClose={() => setEditing(false)} />}
      {dialog && <RetireLoopDialog loop={loop} mode={dialog} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
};

export default LoopDetailPage;
