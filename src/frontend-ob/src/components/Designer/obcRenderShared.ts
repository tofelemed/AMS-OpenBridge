import React from 'react';
import type { CanvasItem } from './types';
import type { AutomationProps } from './automationTypes';
import type { ObcProps } from './obcCatalogTypes';
import { getPercentage as pctValue } from './openBridgeTheme';

export interface AutomationRenderContext {
  item: CanvasItem;
  mode: 'design' | 'preview';
  isRunning: boolean;
  numericValue: number;
  liveValue: unknown;
  statusValue: unknown;
  displayValue: string;
}

export interface CatalogRenderContext {
  item: CanvasItem;
  mode: 'design' | 'preview';
  numericValue: number;
  displayValue: string;
  isRunning: boolean;
  statusState: 'active' | 'inactive' | 'caution' | 'warning' | 'alarm' | 'running';
}

export type ObcRenderContext = AutomationRenderContext | CatalogRenderContext;

export function wrapAutomation(content: React.ReactNode) {
  return React.createElement('div', { className: 'symbol symbol-automation' }, content);
}

export function wrapCatalog(content: React.ReactNode) {
  return React.createElement('div', { className: 'symbol symbol-obc' }, content);
}

export function obcEl(
  Component: React.ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
  children?: React.ReactNode
) {
  return React.createElement(Component, props, children);
}

export function automationProps(item: CanvasItem): AutomationProps {
  return item.automationProps ?? {};
}

export function catalogProps(item: CanvasItem): ObcProps {
  return item.obcProps ?? {};
}

export function isAutomationOn(ctx: AutomationRenderContext): boolean {
  if (ctx.mode === 'preview') return ctx.isRunning;
  return automationProps(ctx.item).on ?? false;
}

export function motorizedProps(ctx: AutomationRenderContext) {
  const p = automationProps(ctx.item);
  return {
    on: isAutomationOn(ctx),
    vertical: p.vertical ?? false,
    speedInPercent: p.speedInPercent ?? (ctx.mode === 'preview' ? pctValue(ctx.numericValue) : 100),
    tag: ctx.item.label || p.tag || '',
    showReadoutStack: p.showReadoutStack ?? true,
    labelDirection: p.labelDirection ?? 'up',
    variant: p.variant ?? 'regular',
  };
}

export function squaredProps(ctx: AutomationRenderContext) {
  const p = automationProps(ctx.item);
  return {
    on: isAutomationOn(ctx),
    tag: ctx.item.label || p.tag || '',
    showReadoutStack: p.showReadoutStack ?? false,
    variant: p.variant ?? 'square',
  };
}

export function valveProps(ctx: AutomationRenderContext) {
  const p = automationProps(ctx.item);
  const position = ctx.mode === 'preview' && typeof ctx.liveValue === 'number'
    ? ctx.liveValue
    : (p.value ?? 50);
  return {
    open: ctx.mode === 'preview' ? ctx.isRunning : (p.open ?? false),
    value: position,
    vertical: p.vertical ?? false,
    variant: p.variant ?? 'regular',
    tag: ctx.item.label || p.tag || '',
    showReadoutStack: p.showReadoutStack ?? true,
  };
}

export function lineProps(p: AutomationProps, item: CanvasItem) {
  return {
    medium: p.medium ?? 'water',
    lineType: p.lineType ?? 'fluid',
    length: p.length ?? item.size.width,
  };
}

export function resolveAutomationRenderType(type: string): string {
  const aliases: Record<string, string> = {
    'obc.auto.control-compact': 'obc.auto.automation-button',
    'obc.auto.automation-tank-compact': 'obc.auto.automation-tank',
    'obc.auto.readout-stack': 'obc.auto.readout-stack',
  };
  return aliases[type] ?? type;
}

export function instrumentValue(ctx: CatalogRenderContext) {
  const props = catalogProps(ctx.item);
  const v = ctx.mode === 'preview' ? ctx.numericValue : (props.value ?? 50);
  return {
    value: v,
    minValue: props.minValue ?? 0,
    maxValue: props.maxValue ?? 100,
  };
}

export function barProps(ctx: CatalogRenderContext) {
  const props = catalogProps(ctx.item);
  return {
    ...instrumentValue(ctx),
    hasScale: props.hasScale ?? true,
    showLabels: props.showLabels ?? true,
    height: ctx.item.size.height,
    state: 'active',
  };
}

export { pctValue };
