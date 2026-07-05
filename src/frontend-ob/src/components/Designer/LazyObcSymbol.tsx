import React, { useEffect, useState } from 'react';
import type { AutomationRenderContext, CatalogRenderContext } from './obcRenderShared';
import { isAutomationType } from './automationTypes';
import { isObcCatalogType } from './obcCatalogTypes';
import { isLazyObcType, loadRendererForType } from './lazyCategoryRegistry';

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
        };
        setContent((render as (c: CatalogRenderContext) => React.ReactNode)(ctx));
      }
    });

    return () => {
      cancelled = true;
    };
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
