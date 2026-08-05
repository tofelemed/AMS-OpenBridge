import React, { useEffect, useRef, useState } from 'react';
import type { AutomationRenderContext, CatalogRenderContext } from './obcRenderShared';
import { isAutomationType } from './automationTypes';
import { isObcCatalogType } from './obcCatalogTypes';
import { isLazyObcType, loadRendererForType } from './lazyCategoryRegistry';

const TREND_CAP = 60;

interface LazyObcSymbolProps {
  item: AutomationRenderContext['item'];
  mode: 'design' | 'preview';
  isRunning: boolean;
  numericValue: number;
  liveValue: unknown;
  statusValue: unknown;
  displayValue: string;
  statusState: CatalogRenderContext['statusState'];
}

export const LazyObcSymbol: React.FC<LazyObcSymbolProps> = ({
  item,
  mode,
  isRunning,
  numericValue,
  liveValue,
  statusValue,
  displayValue,
  statusState,
}) => {
  const [content, setContent] = useState<React.ReactNode>(
    <div className="symbol symbol-loading">
      <div className="symbol-loading__spinner" />
    </div>
  );

  // Per-item ring buffer of recent live values — feeds graph-mini / gauge-trend a real trend series
  // (the effect re-runs on every numericValue change, so each new sample is appended here).
  const trendRef = useRef<number[]>([]);
  if (mode === 'preview' && Number.isFinite(numericValue)) {
    const buf = trendRef.current;
    if (buf.length === 0 || buf[buf.length - 1] !== numericValue || buf.length < 2) {
      buf.push(numericValue);
      if (buf.length > TREND_CAP) buf.splice(0, buf.length - TREND_CAP);
    }
  } else if (mode !== 'preview') {
    trendRef.current = [];
  }

  useEffect(() => {
    if (!isLazyObcType(item.type)) return;

    let cancelled = false;

    void loadRendererForType(item.type).then(render => {
      if (cancelled || !render) return;

      if (isAutomationType(item.type)) {
        const ctx: AutomationRenderContext = {
          item,
          mode,
          isRunning,
          numericValue,
          liveValue,
          statusValue,
          displayValue,
        };
        setContent((render as (c: AutomationRenderContext) => React.ReactNode)(ctx));
      } else if (isObcCatalogType(item.type)) {
        const ctx: CatalogRenderContext = {
          item,
          mode,
          numericValue,
          displayValue,
          isRunning,
          statusState,
          trendSeries: trendRef.current.slice(),
        };
        setContent((render as (c: CatalogRenderContext) => React.ReactNode)(ctx));
      }
    });

    return () => {
      cancelled = true;
    };
  // item identity is intentionally excluded: the effect keys on item.id to avoid re-import churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    item.type,
    item.id,
    mode,
    isRunning,
    numericValue,
    liveValue,
    statusValue,
    displayValue,
    statusState,
    item.automationProps,
    item.obcProps,
    item.label,
    item.size.width,
    item.size.height,
  ]);

  return <>{content}</>;
};

export default LazyObcSymbol;
