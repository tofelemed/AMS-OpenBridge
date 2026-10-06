/**
 * SME review #13 (CHG-050): keep the conclusion in view while the evidence below it is read. Once the
 * conclusion card (the element with `targetId`) has scrolled up out of view, a one-line strip sticks
 * under the loop context bar: "Verdict · Oscillation confirmed · … · Back to conclusion ↑".
 *
 * The strip takes NO layout height (a zero-height sticky host with the strip positioned inside it), so
 * showing / hiding it never moves the page under the reader's eyes. It is a direct child of .cpm-screen
 * so it sticks for the whole page, right under the context bar (`--cpm-context-h`).
 */
import React, { useEffect, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { TonePill, type CpmTone } from './shared';

export const ConclusionStrip: React.FC<{
  targetId: string;
  label: string;
  tone: CpmTone;
  text: string;
  detail?: string;
  /** True once the conclusion card is rendered (data loaded); the observer starts then. */
  active: boolean;
}> = ({ targetId, label, tone, text, detail, active }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = active ? document.getElementById(targetId) : null;
    if (!el || typeof IntersectionObserver === 'undefined') { setShow(false); return; }
    // The page scrolls inside .page-content, under the sticky context bar: observe against that scroller
    // with the bar's height cut off the top, and show the strip only once the card has gone UP past it
    // (not while it is still below, waiting to be reached).
    const root = el.closest('.page-content');
    const barH = (document.querySelector('[data-testid="loop-context"]') as HTMLElement | null)?.offsetHeight ?? 0;
    const io = new IntersectionObserver(([entry]) => {
      setShow(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0) + 1);
    }, { root, rootMargin: `-${barH}px 0px 0px 0px`, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId, active]);

  return (
    <div className="cpm-conclusion-strip" aria-hidden={!show}>
      <div className={`cpm-conclusion-strip__inner${show ? ' cpm-conclusion-strip__inner--shown' : ''}`} role="status">
        <span className="cpm-eyebrow">{label}</span>
        <TonePill tone={tone}>{text}</TonePill>
        {detail && <span className="cpm-conclusion-strip__detail">{detail}</span>}
        <ObcButton variant="flat"
          onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          Back to conclusion ↑
        </ObcButton>
      </div>
    </div>
  );
};

export default ConclusionStrip;
