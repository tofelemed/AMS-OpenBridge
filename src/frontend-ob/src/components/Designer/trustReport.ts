/**
 * CHG-176: an inner chart or table of a Designer symbol (bar chart, table, trend ...) resolves its own bindings, so it
 * reports the least trusted of them to the symbol around it, whose NE107 badge then shows it (SymbolRenderer provides
 * the context). Nothing is reported while every binding comes from the asset model, so normal operation renders
 * nothing extra. Outside a symbol (the CPA Trend page, the ad-hoc trend dialog) there is no listener.
 */
import React from 'react';
import type { BindingTrust } from '../../utils/bindingTrust';

export const TrustReportContext = React.createContext<((trust: BindingTrust) => void) | null>(null);

export function useReportTrust(trust: BindingTrust): void {
  const report = React.useContext(TrustReportContext);
  React.useEffect(() => {
    if (!report || trust === 'asset-model') return undefined;
    report(trust);
    return () => report('asset-model');
  }, [report, trust]);
}
