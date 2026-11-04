/**
 * The one chart theme builder (CD12). Canvas cannot read CSS variables, so tokens are resolved to
 * literals here, and every chart rebuilds when the theme changes.
 *
 * Trend line colours are the owner's core design, from `--signal-*` in styles/signal-colours.css
 * (UI-050). Grid, axes and tooltips follow the theme. SP is dashed and labelled. Further pens repeat
 * with a dash pattern.
 */
import { useSyncExternalStore } from 'react';
import { readTheme, type Theme } from '../theme/theme';

const probe = (() => {
  let el: HTMLSpanElement | null = null;
  return () => {
    if (!el) {
      el = document.createElement('span');
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    return el;
  };
})();

/** Resolves any CSS colour, a literal or a var(), to a literal for the canvas. */
export function resolveColorLiteral(css: string): string {
  const el = probe();
  el.style.color = ''; // an invalid value is ignored and would leave the previous colour in place
  el.style.color = css;
  return getComputedStyle(el).color || css;
}

/** Resolves a Traverse token ("chart-series-1", "--traverse-chart-series-1" or a var()) to a literal. */
export function resolveTraverse(token: string): string {
  return resolveColorLiteral(token.startsWith('var(') ? token : `var(${token.startsWith('--') ? token : `--traverse-${token}`})`);
}

export interface ChartPalette {
  theme: Theme;
  pv: string;
  sp: string;
  op: string;
  vp: string;
  pens: string[];
  grid: string;
  axis: string;
  tick: string;
  cursor: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipFg: string;
  surface: string;
  raised: string;
  text: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  unknown: string;
}

export function chartPalette(): ChartPalette {
  const signal = (name: string) => resolveTraverse(`--signal-${name}`);
  return {
    theme: readTheme(),
    pv: signal('pv'),
    sp: signal('sp'),
    op: signal('op'),
    vp: signal('vp'),
    pens: ['pen-1', 'pv', 'op', 'vp', 'overlay', 'pen-6'].map(signal),
    grid: resolveTraverse('chart-grid'),
    axis: resolveTraverse('chart-axis'),
    tick: resolveTraverse('chart-tick'),
    cursor: resolveTraverse('chart-cursor'),
    tooltipBg: resolveTraverse('chart-tooltip-bg'),
    tooltipBorder: resolveTraverse('chart-tooltip-border'),
    tooltipFg: resolveTraverse('chart-tooltip-fg'),
    surface: resolveTraverse('surface-panel'),
    raised: resolveTraverse('surface-raised'),
    text: resolveTraverse('text-primary'),
    danger: resolveTraverse('status-danger-fg'),
    warning: resolveTraverse('status-warning-fg'),
    success: resolveTraverse('status-success-fg'),
    info: resolveTraverse('status-info-fg'),
    unknown: resolveTraverse('status-unknown-fg'),
  };
}

/** Line style for a pen index: colours repeat after the palette ends, with a dash pattern. */
export function penStyle(palette: ChartPalette, index: number): { color: string; type: 'solid' | 'dotted' } {
  return { color: palette.pens[index % palette.pens.length], type: index < palette.pens.length ? 'solid' : 'dotted' };
}

/** Lane fills for a tone (good, warn, bad, muted). A canvas lane and a DOM pill read the same status role. */
export const toneColors = (p: ChartPalette) => ({ good: p.success, warn: p.warning, bad: p.danger, muted: p.unknown });

/** Tooltip chrome. Without it ECharts draws a white box in Night (CD14). */
export const tooltipChrome = (p: ChartPalette) => ({
  backgroundColor: p.tooltipBg,
  borderColor: p.tooltipBorder,
  textStyle: { color: p.tooltipFg },
});

/** Text on a status-filled lane segment (`action.on`, verified on every `status.*.fg` in both themes). */
export const onStatusInk = () => resolveTraverse('action-on');

/** The UI font for canvas text, which cannot inherit it. */
export const chartFontFamily = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--traverse-font-sans').trim() || 'sans-serif';

/** Chrome for one axis: line, ticks, labels, grid lines and the hover pointer. */
export const axisChrome = (p: ChartPalette) => ({
  axisLine: { lineStyle: { color: p.axis } },
  axisTick: { lineStyle: { color: p.axis } },
  axisLabel: { color: p.tick },
  splitLine: { lineStyle: { color: p.grid } },
  nameTextStyle: { color: p.tick },
  axisPointer: { lineStyle: { color: p.axis }, label: { backgroundColor: p.tooltipBg, color: p.tooltipFg, borderColor: p.tooltipBorder, borderWidth: 1 } },
});

/** Chrome for a slider dataZoom. The default filler and handles ignore the theme. */
export const zoomChrome = (p: ChartPalette) => ({
  borderColor: p.grid,
  backgroundColor: p.raised,
  fillerColor: p.cursor,
  textStyle: { color: p.tick },
  brushStyle: { color: p.cursor },
  handleStyle: { color: p.surface, borderColor: p.axis },
  moveHandleStyle: { color: p.axis },
  dataBackground: { lineStyle: { color: p.axis }, areaStyle: { color: p.grid } },
  selectedDataBackground: { lineStyle: { color: p.pv }, areaStyle: { color: p.grid } },
  emphasis: { handleStyle: { borderColor: p.text }, moveHandleStyle: { color: p.text } },
});

/** Top-level option for a chart with no legend. ECharts draws a legend whenever the key exists. */
export const plainOption = (p: ChartPalette) => ({
  backgroundColor: 'transparent',
  textStyle: { color: p.tick },
  tooltip: tooltipChrome(p),
});

/** Top-level option for a chart with a legend. */
export const baseOption = (p: ChartPalette) => ({
  ...plainOption(p),
  legend: { textStyle: { color: p.tick }, inactiveColor: p.axis },
});

const subscribe = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

/** The active theme. Put it in a chart's useMemo dependencies so a switch rebuilds the option. */
export function useChartTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => 'day' as Theme);
}
