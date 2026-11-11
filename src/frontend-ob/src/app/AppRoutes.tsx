/**
 * Every route inside the application shell, moved out of App.tsx. Each carries the permission its
 * APIs require. An address with a row in cpa/redirects.ts sits in LegacyRoute.
 */
import React from 'react';
import { ADMIN_PERMISSIONS, ADMINISTRATION_PERMISSIONS } from '../cpa/destinations';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LegacyRoute } from '../cpa/LegacyRoute';
import { CPA_SLICE_ONLY, HOME_PATH } from '../productSlice';
import { RequirePermission } from './guards';

const Dashboard        = React.lazy(() => import('../components/Dashboard/Dashboard'));
const AlarmConsole     = React.lazy(() => import('../components/AlarmConsole/AlarmConsole'));
const Analytics        = React.lazy(() => import('../components/Analytics/Analytics'));
const HistoricalViewer = React.lazy(() => import('../components/HistoricalViewer/HistoricalViewer'));
const IoTDBTrendViewer = React.lazy(() => import('../components/IoTDBTrend/IoTDBTrendViewer'));
const LiveEventsPage   = React.lazy(() => import('../components/LiveEvents/LiveEventsPage'));
const SoePanel         = React.lazy(() => import('../components/Soe/SoePanel'));
// CPLM Phase 7 — Loop Performance screens (built slice by slice; see
// docs/cplm-intake/phase7-frontend-checklist.md)
const CpmLoopRegistry  = React.lazy(() => import('../components/Cpm/LoopRegistry'));
const CpmEvents        = React.lazy(() => import('../components/Cpm/CpmEvents'));
const OverviewPage     = React.lazy(() => import('../pages/cpa/OverviewPage'));
const CpmPerformance   = React.lazy(() => import('../components/Cpm/CpmPerformance'));
const CpmKpiDrilldown  = React.lazy(() => import('../components/Cpm/CpmKpiDrilldown'));   // CHG-082
const CpmExplorer      = React.lazy(() => import('../components/Cpm/CpmExplorer'));
const CpmCalculations  = React.lazy(() => import('../components/Cpm/CpmCalculations'));
const CpmHistorical    = React.lazy(() => import('../components/Cpm/CpmHistorical'));
const CpmWindows       = React.lazy(() => import('../components/Cpm/CpmWindows'));
const CpmReplay        = React.lazy(() => import('../components/Cpm/CpmReplay'));
const ResponseWorkspace = React.lazy(() => import('../components/Cpm/response/ResponseWorkspace'));
const GateConfigurationWorkspace = React.lazy(() => import('../components/Cpm/config/GateConfigurationWorkspace'));
const CpmInvestigation = React.lazy(() => import('../components/Cpm/CpmInvestigation'));
const CpmPipeline      = React.lazy(() => import('../components/Cpm/CpmPipeline'));
const CpmGovernance    = React.lazy(() => import('../components/Cpm/CpmGovernance'));
const EdgeNodeMonitor  = React.lazy(() => import('../components/EdgeNodeMonitor/EdgeNodeMonitor'));
const Administration   = React.lazy(() => import('../components/Administration/Administration'));
const DisplayList      = React.lazy(() => import('../components/Designer/DisplayList'));
// Dedicated trend view (Phase J) — deep-linkable /trend?tags=a,b,c
const TrendPage        = React.lazy(() => import('../components/Designer/TrendPage'));
// Published-HMI launcher (Phase K) — the Operator/Viewer entry point into the runtime viewer.
const DisplayLauncher  = React.lazy(() => import('../components/Designer/DisplayLauncher'));
const GateEvidenceWorkspace = React.lazy(() => import('../components/Cpm/evidence/GateEvidenceWorkspace'));

// Contract evidence only. Vite inlines the flag, so a default build has no route and no chunk.
const ComponentGallery = import.meta.env.VITE_CPA_COMPONENT_GALLERY === '1'
  ? React.lazy(() => import('../pages/cpa/ComponentGallery'))
  : null;

export const AppRoutes: React.FC = () => (
  <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        {/* EVERY route carries the permission its APIs require, so a direct URL can never
            render a page the role's token would only get 401/403 from. The service is still
            the boundary that actually holds — this just stops us rendering a dead page. */}
        {/* Live Operations — hidden on the Marun CPA slice (D-SLICE). */}
        <Route path="/dashboard"    element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="alarm.view"><Dashboard /></RequirePermission>} />
        <Route path="/alarms"       element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="alarm.view"><AlarmConsole /></RequirePermission>} />
        <Route path="/live-events"  element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="alarm.view"><LiveEventsPage /></RequirePermission>} />
        <Route path="/soe"          element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="soe.view"><SoePanel /></RequirePermission>} />
        {/* Historical */}
        <Route path="/historical"   element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="alarm.view"><HistoricalViewer /></RequirePermission>} />
        {/* Legacy IoTDB explorer — moved off /trend, which is now the Phase J trend view */}
        <Route path="/iotdb-trend"  element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="historian.view"><IoTDBTrendViewer /></RequirePermission>} />
        {/* Analysis */}
        <Route path="/analytics"    element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="analytics.view"><Analytics /></RequirePermission>} />

        {/* ── Loop Performance (CPLM) ─────────────────── */}
        <Route path="/cpm"             element={<RequirePermission permission="analytics.view"><OverviewPage /></RequirePermission>} />
        <Route path="/cpm/performance" element={<RequirePermission permission="analytics.view"><CpmPerformance /></RequirePermission>} />
        <Route path="/cpm/kpi"         element={<RequirePermission permission="analytics.view"><LegacyRoute><CpmKpiDrilldown /></LegacyRoute></RequirePermission>} />
        <Route path="/cpm/explorer"     element={<RequirePermission permission="analytics.view"><CpmExplorer /></RequirePermission>} />
        <Route path="/cpm/calculations" element={<RequirePermission permission="analytics.view"><CpmCalculations /></RequirePermission>} />
        <Route path="/cpm/historical" element={<RequirePermission permission="analytics.view"><CpmHistorical /></RequirePermission>} />
        <Route path="/cpm/windows"   element={<RequirePermission permission="analytics.view"><CpmWindows /></RequirePermission>} />
        <Route path="/cpm/replay"    element={<RequirePermission permission="analytics.view"><CpmReplay /></RequirePermission>} />
        <Route path="/cpm/evidence"  element={<RequirePermission permission="analytics.view"><LegacyRoute><GateEvidenceWorkspace /></LegacyRoute></RequirePermission>} />
        {ComponentGallery && <Route path="/cpm/gallery" element={<RequirePermission permission="analytics.view"><ComponentGallery /></RequirePermission>} />}
        <Route path="/cpm/loop"      element={<LegacyRoute>{null}</LegacyRoute>} />
        <Route path="/cpm/setup"     element={<LegacyRoute>{null}</LegacyRoute>} />
        <Route path="/cpm/system"    element={<LegacyRoute>{null}</LegacyRoute>} />
        <Route path="/cpm/response"  element={<RequirePermission permission="analytics.view"><ResponseWorkspace /></RequirePermission>} />
        {/* v2.5 (3D.1): the governed gate configuration - reading needs cpm.config.read; every step beyond is its own permission on the server */}
        <Route path="/cpm/config"    element={<RequirePermission permission="cpm.config.read"><GateConfigurationWorkspace /></RequirePermission>} />
        <Route path="/cpm/investigation" element={<RequirePermission permission="analytics.view"><CpmInvestigation /></RequirePermission>} />
        {/* CHG-081: Pipeline is SuperAdmin only. Governance holds the one audit trail, so Audit log's rule opens it too; its other panels stay with system.manage. */}
        <Route path="/cpm/pipeline"  element={<RequirePermission permission="system.manage"><CpmPipeline /></RequirePermission>} />
        <Route path="/cpm/governance" element={<RequirePermission permission="system.manage" anyOf={['system.manage', ...ADMIN_PERMISSIONS]}><CpmGovernance /></RequirePermission>} />
        <Route path="/cpm/registry"  element={<RequirePermission permission="analytics.view"><CpmLoopRegistry /></RequirePermission>} />
        <Route path="/cpm/events"    element={<RequirePermission permission="analytics.view"><CpmEvents /></RequirePermission>} />
        {/* Published-HMI launcher — every role with display.view */}
        <Route path="/displays"       element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="display.view"><DisplayLauncher /></RequirePermission>} />
        {/* HMI Designer — authoring, Admin/Engineer only */}
        <Route path="/designer"       element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="display.edit"><DisplayList /></RequirePermission>} />
        {/* /designer/import and /designer/:id are both standalone routes declared above,
            outside this shell's nested <Routes> — see the top-level block for why. */}
        {/* Dedicated trend view (Phase J) — needs history + binding resolution */}
        <Route path="/trend"          element={<RequirePermission permission="historian.view"><TrendPage /></RequirePermission>} />
        {/* Infrastructure */}
        <Route path="/edge"       element={CPA_SLICE_ONLY ? <Navigate to={HOME_PATH} replace /> : <RequirePermission permission="historian.view"><EdgeNodeMonitor /></RequirePermission>} />
        {/* Administration — was reachable by ANY authenticated user via direct URL. Plain /admin picks the first section the role may open.
            CHG-172: asset.view opens it too (Plant model and Tag aliases); each tab keeps its own check inside. */}
        <Route path="/admin/*"    element={<RequirePermission permission="admin.users.edit" anyOf={[...ADMINISTRATION_PERMISSIONS]}><LegacyRoute><Administration /></LegacyRoute></RequirePermission>} />
        <Route path="*"           element={<Navigate to={HOME_PATH} replace />} />
  </Routes>
);
