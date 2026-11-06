#!/usr/bin/env node
// lint:theme (CPA-UI-PRM-004 §5.1). Live files only, TypeScript AST, tests excluded. Exit 1 on any active-gate match.
// A gate's scope widens as phases land: see ACTIVE below. Run from src/frontend-ob.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildReachable } from '../../../../docs/theme/tools/lib/import-graph.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(app, 'src');
const ts = createRequire(path.join(app, 'package.json'))('typescript');
const rel = f => path.relative(src, f).replaceAll('\\', '/');

// Phase of the current build. Raise it as gates activate.
const PHASE = Number(process.env.THEME_PHASE ?? 3);
const NEW_CODE = /^(ui|pages\/cpa|help|charts|theme|cpa)\//;
// The legacy files whose OpenBridge controls were replaced in Phase 3 (PRM-004 Phase 3 step 2): T9 holds them there.
const T9_REPLACED_FILES = new Set([
  'components/Administration/RolesConfig.tsx',
  'components/Cpm/AttentionList.tsx',
  'components/Cpm/CalcDrawer.tsx',
  'components/Cpm/CollapsibleSection.tsx',
  'components/Cpm/CpmEvents.tsx',
  'components/Cpm/CpmPerformance.tsx',
  'components/Cpm/GateMatrix.tsx',
  'components/Cpm/config/EditorView.tsx',
  'components/Cpm/config/GateConfigurationWorkspace.tsx',
  'components/Cpm/events/ShelvePanel.tsx',
  'components/Cpm/explorer/LoopTree.tsx',
  'components/Cpm/explorer/LoopWorkspace.tsx',
  'components/Cpm/explorer/summary/LoopSummaryCard.tsx',
  'components/Cpm/explorer/summary/SummaryCalculations.tsx',
  'components/Cpm/explorer/summary/WindowKindToggle.tsx',
  'components/Cpm/investigation/CaseTriage.tsx',
  'components/Cpm/response/ModelReviewDialog.tsx',
  'components/Cpm/trend/SignalTrend.tsx',
  'components/Cpm/trend/TimeRangeBar.tsx',
]);
const ACTIVE = {
  T1: r => (PHASE >= 8 ? true : NEW_CODE.test(r)),
  T2: r => (PHASE >= 8 ? true : NEW_CODE.test(r)),
  T3: r => (PHASE >= 8 ? true : NEW_CODE.test(r)),
  T4: () => true,
  T5: () => PHASE >= 3,
  T6: () => true,
  T7: () => PHASE < 8,
  T8: r => PHASE >= 3 && /^(ui|pages\/cpa)\//.test(r),
  T9: r => (PHASE >= 8 ? true : PHASE >= 3 && (/^(ui|pages\/cpa)\//.test(r) || T9_REPLACED_FILES.has(r))),
  T10: r => (PHASE >= 8 ? !r.startsWith('ui/trend/') : PHASE >= 3 && /^(ui|pages\/cpa)\//.test(r) && !r.startsWith('ui/trend/')),
  T11: r => (PHASE >= 8 ? true : PHASE >= 2 && /^(ui|pages\/cpa)\//.test(r)),
  T13: r => /^(ui|pages\/cpa|cpa)\//.test(r),
};

const ALLOW = {
  T1: [/^styles\/traverse-tokens\.css$/, /^styles\/openbridge-bridge\.css$/, /^styles\/signal-colours\.css$/, /^styles\/state-colours\.css$/],
  T2: [/^styles\/traverse-tokens\.css$/],
  T4: [/^styles\/traverse-tokens\.css$/],
  T5: [
    /^styles\/openbridge-bridge\.css$/, /^charts\/chartTheme\.ts$/, /^ui\/StatusBadge/, /^styles\/tones\.css$/,
    // Legacy modules: reachable by import, off in the slice, not edited (D14). Retired in Phase 8.
    /^components\/(AlarmConsole|LiveEvents|EdgeNodeMonitor|Designer)\//, /^app\/LegacyShell\.tsx$/, /^components\/shared\/AlarmStateIcon\.tsx$/,
  ],
  T6: [/^theme\//, /^charts\/chartTheme\.ts$/, /^styles\/openbridge-bridge\.css$/, /^styles\/traverse-tokens\.css$/],
  T7: [/^theme\//],
  T11: [/^cpa\//, /cpaHref/],
};
const allowed = (gate, r) => (ALLOW[gate] ?? []).some(re => re.test(r));

// Same live set as the analyses: the slice's routes, with legacy pages excluded.
const LAZY_LIVE = /Cpm\/|Administration\/Administration|Login\/Login|Designer\/TrendPage|pages\/cpa\/|ui\//;
const live = buildReachable([path.join(src, 'main.tsx')], LAZY_LIVE);
const HIDDEN = /Administration\/(AlarmFeedConfig|AlarmRulesConfig|NotificationsConfig)/;
const files = [...live].filter(f => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && !HIDDEN.test(rel(f)));

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/;
const FALLBACK = /var\(\s*--[a-z0-9-]+\s*,\s*(?:#|rgb|hsl|oklch|[a-z]+\b)/i;
const SEMANTIC = /--alert-[a-z-]+|--ams-pen-\d+|--ams-crit\b|--cpm-tone-[a-z]+/;
const THEME_ATTR = /\bdata-obc-theme\b|\bdata-theme\b|['"`]ams-theme['"`]/;
const RETIRED = /^bright$/;
const REPLACED = new Set(['ObcToggleButtonGroup', 'ObcToggleButtonOption', 'ObcTextInputField', 'ObcTabRow', 'ObcFilterChip', 'ObcAccordionItem', 'ObcCheckbox', 'ObcDropdownButton', 'ObcPagination', 'ObcInputChip']);
const CPM_PATH = /^\/cpm(\/|$|\?)/;

const hits = [];
const hit = (gate, f, line, text) => {
  const r = rel(f);
  if (ACTIVE[gate]?.(r) && !allowed(gate, r)) hits.push(`${gate} ${r}:${line} ${String(text).slice(0, 70)}`);
};

function scanCss(f) {
  const lines = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((l, i) => {
    if (/--traverse-[a-z0-9-]+\s*:/.test(l)) hit('T4', f, i + 1, l.trim());
    if (FALLBACK.test(l)) hit('T2', f, i + 1, l.trim());
    if (LITERAL.test(l)) hit('T1', f, i + 1, l.trim());
    if (SEMANTIC.test(l)) hit('T5', f, i + 1, l.trim());
    if (/data-obc-theme/.test(l)) hit('T6', f, i + 1, l.trim());
  });
}

function scanTs(f) {
  const text = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const inNode = n => (ts.isImportDeclaration(n) ? false : true);
  const visit = n => {
    if (!inNode(n)) return;
    if (ts.isStringLiteralLike(n)) {
      const attr = n.parent && ts.isJsxAttribute(n.parent) ? n.parent.name.getText(sf) : '';
      if (!/^(href|id|to|data-testid|aria-)/.test(attr)) {
        if (LITERAL.test(n.text)) hit('T1', f, lineOf(n), n.text);
        if (FALLBACK.test(n.text)) hit('T2', f, lineOf(n), n.text);
        if (SEMANTIC.test(n.text)) hit('T5', f, lineOf(n), n.text);
      }
      if (THEME_ATTR.test(`'${n.text}'`)) hit('T6', f, lineOf(n), n.text);
      if (RETIRED.test(n.text)) hit('T7', f, lineOf(n), n.text);
      if (CPM_PATH.test(n.text) && (attr === 'to' || attr === 'href')) hit('T11', f, lineOf(n), n.text);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'navigate' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && CPM_PATH.test(n.arguments[0].text)) {
      hit('T11', f, lineOf(n), n.arguments[0].text);
    }
    if (ts.isPropertyAssignment(n) && n.parent?.parent && ts.isJsxExpression(n.parent.parent) && ts.isJsxAttribute(n.parent.parent.parent) && n.parent.parent.parent.name.getText(sf) === 'style') {
      if (/^(color|background|backgroundColor|borderColor|fill|stroke)$/.test(n.name.getText(sf)) && LITERAL.test(n.initializer.getText(sf))) hit('T3', f, lineOf(n), n.getText(sf));
    }
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) {
      const tag = n.tagName.getText(sf);
      if (REPLACED.has(tag)) hit('T9', f, lineOf(n), tag);
      if (tag === 'ReactECharts') hit('T10', f, lineOf(n), tag);
      // HTML elements and OpenBridge hosts. A React component's `title` prop is its own API, not a tooltip.
      if (/^([a-z]|Obc)/.test(tag) && n.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(sf) === 'title')) hit('T8', f, lineOf(n), tag);
    }
    if (ts.isPropertyAccessExpression(n) && n.getText(sf) === 'echarts.init') hit('T10', f, lineOf(n), 'echarts.init');
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const m of text.matchAll(/from\s+['"]echarts-for-react['"]/g)) hit('T10', f, text.slice(0, m.index).split('\n').length, 'echarts-for-react');
}

for (const f of files) (f.endsWith('.css') ? scanCss : scanTs)(f);

// T13: signal colours and gate marks have one home each (UI-038, UI-039). New code only, as old pages
// keep their own until Phases 5 and 6 replace them.
const SERIES = /chart-series-\d/;
const GATE_GLYPH = /['"`>](◐|◯|⬤|△|▲|◇|⊘|⊖)['"`<]/;
for (const f of files) {
  const r = rel(f);
  if (!ACTIVE.T13(r) || r.includes('.test.')) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (SERIES.test(l) && !/^ui\/trend\/trendOption\.test/.test(r)) hit('T13', f, i + 1, l.trim());
    if (GATE_GLYPH.test(l)) hit('T13', f, i + 1, l.trim());
  });
}
const active = Object.keys(ACTIVE).filter(g => ['T1', 'T2', 'T3', 'T4', 'T6', 'T7', 'T13'].includes(g) || PHASE >= 3 || (g === 'T11' && PHASE >= 2));
console.log(`lint:theme phase ${PHASE}: ${files.length} live files, gates ${active.join(' ')}, matches ${hits.length}`);
if (hits.length) {
  console.log(hits.slice(0, process.env.THEME_ALL ? hits.length : 60).join('\n'));
  process.exit(1);
}
