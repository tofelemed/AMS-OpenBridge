/**
 * The application menu. Moved out of App.tsx (2026-10-05) when the Loop
 * Performance group was regrouped by user task — see ./cpmTasks.ts.
 *
 * `permission` must match the route guard for the same path (see the Routes block
 * in App.tsx) — a nav entry that is visible but redirects on click is worse than
 * no entry at all.
 */
import type React from 'react';
import { ObiDashboard } from '@oicl/openbridge-webcomponents-react/icons/icon-dashboard';
import { ObiAlarm } from '@oicl/openbridge-webcomponents-react/icons/icon-alarm';
import { ObiMonitoring } from '@oicl/openbridge-webcomponents-react/icons/icon-monitoring';
import { ObiTime } from '@oicl/openbridge-webcomponents-react/icons/icon-time';
import { ObiHistoryGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-history-google';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import { ObiChart } from '@oicl/openbridge-webcomponents-react/icons/icon-chart';
import { ObiEditGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-edit-google';
import { ObiUser } from '@oicl/openbridge-webcomponents-react/icons/icon-user';
import { ObiNotification } from '@oicl/openbridge-webcomponents-react/icons/icon-notification';
import { ObiListAltCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { ObiSettingsDefaultIec } from '@oicl/openbridge-webcomponents-react/icons/icon-settings-default-iec';
import { ObiPlaceholder } from '@oicl/openbridge-webcomponents-react/icons/icon-placeholder';
import { CPM_PAGES, type CpmPagePath } from './cpmTasks';

export interface NavItem {
  path: string;
  label: string;
  Icon: React.ComponentType;
  group: string;
  /** Sub-heading inside a group (Loop Performance: the user task). */
  subgroup?: string;
  /** Tooltip: what the page answers. */
  hint?: string;
  badge?: string;
  permission: string;
  anyOf?: string[];
}

const LOOP = 'Loop Performance';

/** A Loop Performance entry: its task sub-heading and tooltip come from CPM_PAGES. */
const cpm = (path: CpmPagePath, label: string, Icon: React.ComponentType, permission = 'analytics.view'): NavItem => ({
  path, label, Icon, group: LOOP, subgroup: CPM_PAGES[path].task, hint: CPM_PAGES[path].purpose, permission,
});

export const navItems: NavItem[] = [
  // ── Operations ────────────────────────────────────────────
  // Grouped by TASK, not by data source: "Historical (PostgreSQL + IoTDB)" and
  // "Analysis" described where bytes come from, which is not a question anyone
  // opens a nav with. Alarm History and Analytics answer the same question the
  // live views do — "what is happening on my plant" — so they live here.
  { path: '/dashboard',    label: 'Dashboard',          Icon: ObiDashboard, group: 'Operations', permission: 'alarm.view' },
  { path: '/alarms',       label: 'Active Alarms',       Icon: ObiAlarm, group: 'Operations',  badge: 'alarms', permission: 'alarm.view' },
  { path: '/live-events',  label: 'Live Events',         Icon: ObiMonitoring, group: 'Operations', permission: 'alarm.view' },
  { path: '/soe',          label: 'Sequence of Events',  Icon: ObiTime,  group: 'Operations', permission: 'soe.view' },
  { path: '/historical',   label: 'Alarm History',       Icon: ObiHistoryGoogle, group: 'Operations', permission: 'alarm.view' },
  { path: '/analytics',    label: 'Analytics',           Icon: ObiChart, group: 'Operations', permission: 'analytics.view' },
  // ── Loop Performance — ordered by the user's task (SME review 2026-10-05):
  // find the problem → check the loop → understand the cause → set up.
  cpm('/cpm',               'Overview',           ObiDashboard),
  cpm('/cpm/performance',   'Performance',        ObiChart),
  cpm('/cpm/events',        'Loop Events',        ObiNotification),
  cpm('/cpm/explorer',      'Loop Explorer',      ObiDatabase),
  cpm('/cpm/historical',    'Historical',         ObiHistoryGoogle),
  cpm('/cpm/investigation', 'Investigation',      ObiEditGoogle),
  cpm('/cpm/evidence',      'Evidence Workbench', ObiListAltCheckGoogle),
  cpm('/cpm/replay',        'Evidence Replay',    ObiTrend),
  cpm('/cpm/windows',       'Window Inspector',   ObiTime),
  cpm('/cpm/calculations',  'Calculations',       ObiListAltCheckGoogle),
  cpm('/cpm/response',      'System Response',    ObiTrend),
  cpm('/cpm/registry',      'Loop Registry',      ObiWrench),
  cpm('/cpm/config',        'Gate Configuration', ObiSettingsDefaultIec, 'cpm.config.read'),
  // ── Engineering (authoring + the tag-level trend they author against) ──
  { path: '/displays',   label: 'HMI Displays',        Icon: ObiMonitoring, group: 'Engineering', permission: 'display.view' },
  { path: '/designer',   label: 'HMI Designer',        Icon: ObiEditGoogle, group: 'Engineering', permission: 'display.edit' },
  { path: '/trend',      label: 'Trend',               Icon: ObiTrend, group: 'Engineering', permission: 'historian.view' },
  // ── System (platform runtime, deep tooling, admin and change control) ──
  // SystemMonitor was removed in Phase 7 S6: its job table and latency metrics were
  // fabricated and its data endpoint never existed. /cpm/pipeline is the real one.
  // Pipeline Health reports EVERY required Flink job by role (alarm / cplm /
  // platform), so it is platform runtime rather than loop analytics; Governance
  // audits HMI displays as well as CPM, so it is change control for the whole
  // product. Routes stay under /cpm/* — the command palette and existing deep
  // links point there, and a nav regrouping must not break bookmarks.
  { path: '/cpm/pipeline', label: 'Pipeline Health',     Icon: ObiMonitoring, group: 'System', permission: 'analytics.view' },
  { path: '/edge',       label: 'Edge Node Monitor',   Icon: ObiPlaceholder,  group: 'System', permission: 'historian.view' },
  { path: '/iotdb-trend', label: 'IoTDB Trend Viewer',  Icon: ObiDatabase, group: 'System', permission: 'historian.view' },
  // Administration is ONE entry — the hub's own 7-tab bar handles the sections;
  // a bare /admin lands on the first tab the user can see via the hub's index
  // redirect. Visible to anyone holding ANY admin permission — matches the
  // /admin/* route's anyOf guard, so an auditor or rbac-manager still sees it.
  { path: '/admin',      label: 'Administration',      Icon: ObiUser, group: 'System', permission: 'admin.users.edit', anyOf: ['admin.users.edit', 'admin.audit.view', 'rbac.manage'] },
  { path: '/cpm/governance', label: 'Governance',      Icon: ObiListAltCheckGoogle, group: 'System', permission: 'analytics.view' },
];
