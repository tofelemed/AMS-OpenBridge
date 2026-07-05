import React from 'react';
import type { CatalogRenderContext } from '../obcRenderShared';
import {
  catalogProps,
  wrapCatalog,
  obcEl,
  instrumentValue,
  barProps,
  pctValue,
} from '../obcRenderShared';
import { getObcComponentKey } from '../obcCatalogTypes';

// UI components
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcIconButton } from '@oicl/openbridge-webcomponents-react/components/icon-button/icon-button';
import { ObcCheckButton } from '@oicl/openbridge-webcomponents-react/components/check-button/check-button';
import { ObcCommandButton } from '@oicl/openbridge-webcomponents-react/components/command-button/command-button';
import { ObcRichButton } from '@oicl/openbridge-webcomponents-react/components/rich-button/rich-button';
import { ObcToggleSwitch } from '@oicl/openbridge-webcomponents-react/components/toggle-switch/toggle-switch';
import { ObcStartStopSwitch } from '@oicl/openbridge-webcomponents-react/components/start-stop-switch/start-stop-switch';
import { ObcSlider } from '@oicl/openbridge-webcomponents-react/components/slider/slider';
import { ObcSliderDouble } from '@oicl/openbridge-webcomponents-react/components/slider-double/slider-double';
import { ObcNumberInputField } from '@oicl/openbridge-webcomponents-react/components/number-input-field/number-input-field';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import { ObcTextareaField } from '@oicl/openbridge-webcomponents-react/components/textarea-field/textarea-field';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { ObcSplitButton } from '@oicl/openbridge-webcomponents-react/components/split-button/split-button';
import { ObcMenuButton } from '@oicl/openbridge-webcomponents-react/components/menu-button/menu-button';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { ObcElevatedCard } from '@oicl/openbridge-webcomponents-react/components/elevated-card/elevated-card';
import { ObcTabbedCard } from '@oicl/openbridge-webcomponents-react/components/tabbed-card/tabbed-card';
import { ObcAccordionCard } from '@oicl/openbridge-webcomponents-react/components/accordion-card/accordion-card';
import { ObcDivider } from '@oicl/openbridge-webcomponents-react/components/divider/divider';
import { ObcNavigationItem } from '@oicl/openbridge-webcomponents-react/components/navigation-item/navigation-item';
import { ObcBreadcrumb } from '@oicl/openbridge-webcomponents-react/components/breadcrumb/breadcrumb';
import { ObcTable } from '@oicl/openbridge-webcomponents-react/components/table/table';
import { ObcPagination } from '@oicl/openbridge-webcomponents-react/components/pagination/pagination';
import { ObcModalWindow } from '@oicl/openbridge-webcomponents-react/components/modal-window/modal-window';
import { ObcTooltip } from '@oicl/openbridge-webcomponents-react/components/tooltip/tooltip';
import { ObcAlertButton } from '@oicl/openbridge-webcomponents-react/components/alert-button/alert-button';
import { ObcFormContainer } from '@oicl/openbridge-webcomponents-react/components/form-container/form-container';
import { ObcRadio } from '@oicl/openbridge-webcomponents-react/components/radio/radio';
import { ObcCheckbox } from '@oicl/openbridge-webcomponents-react/components/checkbox/checkbox';
import { ObcTag } from '@oicl/openbridge-webcomponents-react/components/tag/tag';
import { ObcFilterChip } from '@oicl/openbridge-webcomponents-react/components/filter-chip/filter-chip';
import { ObcProgressButton } from '@oicl/openbridge-webcomponents-react/components/progress-button/progress-button';
import { ObcClock } from '@oicl/openbridge-webcomponents-react/components/clock/clock';
import { ObcBadge } from '@oicl/openbridge-webcomponents-react/components/badge/badge';
import { ObcNotificationButton } from '@oicl/openbridge-webcomponents-react/components/notification-button/notification-button';
import { ObcKeyboardNumeric } from '@oicl/openbridge-webcomponents-react/components/keyboard-numeric/keyboard-numeric';
import { ObcStepperBox } from '@oicl/openbridge-webcomponents-react/components/stepper-box/stepper-box';
import { ObcTitleContainer } from '@oicl/openbridge-webcomponents-react/components/title-container/title-container';
import { ObcEventList } from '@oicl/openbridge-webcomponents-react/components/event-list/event-list';
import { ObcAdviceButton } from '@oicl/openbridge-webcomponents-react/components/advice-button/advice-button';
import { ObcSystemButton } from '@oicl/openbridge-webcomponents-react/components/system-button/system-button';
import { ObcVendorButton } from '@oicl/openbridge-webcomponents-react/components/vendor-button/vendor-button';
import { ObcProgressBar } from '@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar';
import { ObcProgressIndicatorDots } from '@oicl/openbridge-webcomponents-react/components/progress-indicator-dots/progress-indicator-dots';
import { ObcStatusIndicator } from '@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator';
import { ObcBatteryIcon } from '@oicl/openbridge-webcomponents-react/components/battery-icon/battery-icon';
import { ObcAlertIcon } from '@oicl/openbridge-webcomponents-react/components/alert-icon/alert-icon';
import { ObcAlertFrame } from '@oicl/openbridge-webcomponents-react/components/alert-frame/alert-frame';

// Building blocks
import { ObcBarVertical } from '@oicl/openbridge-webcomponents-react/building-blocks/bar-vertical/bar-vertical';
import { ObcBarHorizontal } from '@oicl/openbridge-webcomponents-react/building-blocks/bar-horizontal/bar-horizontal';
import { ObcCircularProgress } from '@oicl/openbridge-webcomponents-react/building-blocks/circular-progress/circular-progress';
import { ObcInstrumentRadial } from '@oicl/openbridge-webcomponents-react/building-blocks/instrument-radial/instrument-radial';
import { ObcAlertList } from '@oicl/openbridge-webcomponents-react/building-blocks/alert-list/alert-list';

// Navigation instruments
import { ObcGaugeRadial } from '@oicl/openbridge-webcomponents-react/navigation-instruments/gauge-radial/gauge-radial';
import { ObcGaugeVertical } from '@oicl/openbridge-webcomponents-react/navigation-instruments/gauge-vertical/gauge-vertical';
import { ObcGaugeHorizontal } from '@oicl/openbridge-webcomponents-react/navigation-instruments/gauge-horizontal/gauge-horizontal';
import { ObcGaugeTrend } from '@oicl/openbridge-webcomponents-react/navigation-instruments/gauge-trend/gauge-trend';
import { ObcGraphMini } from '@oicl/openbridge-webcomponents-react/navigation-instruments/graph-mini/graph-mini';
import { ObcThruster } from '@oicl/openbridge-webcomponents-react/navigation-instruments/thruster/thruster';
import { ObcAzimuthThruster } from '@oicl/openbridge-webcomponents-react/navigation-instruments/azimuth-thruster/azimuth-thruster';
import { ObcMainEngine } from '@oicl/openbridge-webcomponents-react/navigation-instruments/main-engine/main-engine';
import { ObcCompass } from '@oicl/openbridge-webcomponents-react/navigation-instruments/compass/compass';
import { ObcCompassFlat } from '@oicl/openbridge-webcomponents-react/navigation-instruments/compass-flat/compass-flat';
import { ObcCompassIndicator } from '@oicl/openbridge-webcomponents-react/navigation-instruments/compass-indicator/compass-indicator';
import { ObcSpeedGauge } from '@oicl/openbridge-webcomponents-react/navigation-instruments/speed-gauge/speed-gauge';
import { ObcSpeedIndicator } from '@oicl/openbridge-webcomponents-react/navigation-instruments/speed-indicator/speed-indicator';
import { ObcSpeedArrows } from '@oicl/openbridge-webcomponents-react/navigation-instruments/speed-arrows/speed-arrows';
import { ObcRudder } from '@oicl/openbridge-webcomponents-react/navigation-instruments/rudder/rudder';
import { ObcRotIndicator } from '@oicl/openbridge-webcomponents-react/navigation-instruments/rot-indicator/rot-indicator';
import { ObcHeading } from '@oicl/openbridge-webcomponents-react/navigation-instruments/heading/heading';
import { ObcWind } from '@oicl/openbridge-webcomponents-react/navigation-instruments/wind/wind';
import { ObcWindIndicator } from '@oicl/openbridge-webcomponents-react/navigation-instruments/wind-indicator/wind-indicator';
import { ObcPitch } from '@oicl/openbridge-webcomponents-react/navigation-instruments/pitch/pitch';
import { ObcRoll } from '@oicl/openbridge-webcomponents-react/navigation-instruments/roll/roll';
import { ObcPitchRoll } from '@oicl/openbridge-webcomponents-react/navigation-instruments/pitch-roll/pitch-roll';
import { ObcDepthActual } from '@oicl/openbridge-webcomponents-react/navigation-instruments/depth-actual/depth-actual';
import { ObcHeave } from '@oicl/openbridge-webcomponents-react/navigation-instruments/heave/heave';
import { ObcRateOfTurn } from '@oicl/openbridge-webcomponents-react/navigation-instruments/rate-of-turn/rate-of-turn';
import { ObcInstrumentField } from '@oicl/openbridge-webcomponents-react/navigation-instruments/instrument-field/instrument-field';
import { ObcBearingIndicator } from '@oicl/openbridge-webcomponents-react/navigation-instruments/bearing-indicator/bearing-indicator';
import { ObcWatch } from '@oicl/openbridge-webcomponents-react/navigation-instruments/watch/watch';
import { ObcWatchFlat } from '@oicl/openbridge-webcomponents-react/navigation-instruments/watch-flat/watch-flat';
import { ObcVelocityProjectionPlot } from '@oicl/openbridge-webcomponents-react/navigation-instruments/velocity-projection-plot/velocity-projection-plot';
import { ObcBadgeCommand } from '@oicl/openbridge-webcomponents-react/navigation-instruments/badge-command/badge-command';

// AR
import { ObcPoiVessel } from '@oicl/openbridge-webcomponents-react/ar/poi-vessel/poi-vessel';
import { ObcPoiAton } from '@oicl/openbridge-webcomponents-react/ar/poi-aton/poi-aton';
import { ObcPoiData } from '@oicl/openbridge-webcomponents-react/ar/poi-data/poi-data';
import { ObcPoiCard } from '@oicl/openbridge-webcomponents-react/ar/poi-card/poi-card';
import { ObcPoiCardHeader } from '@oicl/openbridge-webcomponents-react/ar/poi-card-header/poi-card-header';
import { ObcPoiController } from '@oicl/openbridge-webcomponents-react/ar/poi-controller/poi-controller';
import { ObcPoiGroup } from '@oicl/openbridge-webcomponents-react/ar/poi-group/poi-group';
import { ObcPoiLayer } from '@oicl/openbridge-webcomponents-react/ar/poi-layer/poi-layer';
import { ObcPoiLayerStack } from '@oicl/openbridge-webcomponents-react/ar/poi-layer-stack/poi-layer-stack';
import { ObcPoiButtonVessel } from '@oicl/openbridge-webcomponents-react/ar/poi-button-vessel/poi-button-vessel';
import { ObcPoiButtonAton } from '@oicl/openbridge-webcomponents-react/ar/poi-button-aton/poi-button-aton';
import { ObcPoiButtonData } from '@oicl/openbridge-webcomponents-react/ar/poi-button-data/poi-button-data';
import { ObcPoiObjectVessel } from '@oicl/openbridge-webcomponents-react/ar/poi-object-vessel/poi-object-vessel';
import { ObcPoiObjectAton } from '@oicl/openbridge-webcomponents-react/ar/poi-object-aton/poi-object-aton';
import { ObcPoiObjectData } from '@oicl/openbridge-webcomponents-react/ar/poi-object-data/poi-object-data';
import { ObcChartObjectVesselButton } from '@oicl/openbridge-webcomponents-react/ar/chart-object-vessel-button/chart-object-vessel-button';

function p(item: CatalogRenderContext['item']) {
  return catalogProps(item);
}

function wrap(content: React.ReactNode) {
  return wrapCatalog(content);
}

const DEMO_TREND_DATA = [
  { label: 'T-4', value: 3.2 },
  { label: 'T-3', value: 3.8 },
  { label: 'T-2', value: 4.1 },
  { label: 'T-1', value: 4.5 },
  { label: 'Now', value: 4.8 },
];

const DEMO_GRAPH_DATA: [number[], number[]] = [
  [0, 1, 2, 3, 4, 5],
  [12, 18, 15, 22, 19, 25],
];

export function renderSymbol(ctx: CatalogRenderContext): React.ReactNode {
  const { item, mode, statusState } = ctx;
  const props = p(item);
  const key = getObcComponentKey(item.type);
  const label = item.label || 'Label';
  const val = mode === 'preview' ? ctx.numericValue : (props.value ?? 50);

  switch (key) {
    // ── UI ──────────────────────────────────────────────────────────────────
    case 'ui.button':
      return wrap(obcEl(ObcButton, { variant: 'normal' }, label || 'Button'));
    case 'ui.icon-button':
      return wrap(obcEl(ObcIconButton, { variant: 'flat' }));
    case 'ui.check-button':
      return wrap(obcEl(ObcCheckButton, { checked: props.checked ?? ctx.isRunning }, label || 'Option'));
    case 'ui.command-button':
      return wrap(obcEl(ObcCommandButton, {}, label || 'Command'));
    case 'ui.rich-button':
      return wrap(obcEl(ObcRichButton, {}, label || 'Action'));
    case 'ui.toggle-switch':
      return wrap(obcEl(ObcToggleSwitch, { checked: props.checked ?? ctx.isRunning }));
    case 'ui.start-stop-switch':
      return wrap(obcEl(ObcStartStopSwitch, { running: ctx.isRunning }));
    case 'ui.slider':
      return wrap(obcEl(ObcSlider, { value: val, min: props.minValue ?? 0, max: props.maxValue ?? 100 }));
    case 'ui.slider-double':
      return wrap(obcEl(ObcSliderDouble, { value: val, min: props.minValue ?? 0, max: props.maxValue ?? 100 }));
    case 'ui.number-input':
      return wrap(obcEl(ObcNumberInputField, { value: val }));
    case 'ui.text-input':
      return wrap(obcEl(ObcTextInputField, { value: label, placeholder: props.placeholder ?? 'Enter text' }));
    case 'ui.textarea':
      return wrap(obcEl(ObcTextareaField, { value: label, placeholder: props.placeholder ?? 'Enter text' }));
    case 'ui.dropdown-button':
      return wrap(obcEl(ObcDropdownButton, {}, label || 'Select'));
    case 'ui.split-button':
      return wrap(obcEl(ObcSplitButton, {}, label || 'Action'));
    case 'ui.menu-button':
      return wrap(obcEl(ObcMenuButton, {}, label || 'Menu'));
    case 'ui.card':
      return wrap(obcEl(ObcCard, {}, label || 'Card content'));
    case 'ui.elevated-card':
      return wrap(obcEl(ObcElevatedCard, {}, label || 'Elevated card'));
    case 'ui.tabbed-card':
      return wrap(obcEl(ObcTabbedCard, {}, label || 'Tabbed card'));
    case 'ui.accordion-card':
      return wrap(obcEl(ObcAccordionCard, { title: label || 'Section' }));
    case 'ui.divider':
      return wrap(obcEl(ObcDivider, {}));
    case 'ui.navigation-item':
      return wrap(obcEl(ObcNavigationItem, {}, label || 'Navigation'));
    case 'ui.breadcrumb':
      return wrap(obcEl(ObcBreadcrumb, { items: [{ label: 'Home' }, { label: label || 'Page' }] }));
    case 'ui.table':
      return wrap(obcEl(ObcTable, {}));
    case 'ui.pagination':
      return wrap(obcEl(ObcPagination, { totalPages: 5, currentPage: 2 }));
    case 'ui.modal-window':
      return wrap(obcEl(ObcModalWindow, { open: true }, label || 'Modal content'));
    case 'ui.tooltip':
      return wrap(obcEl(ObcTooltip, {}, label || 'Tooltip'));
    case 'ui.alert-button':
      return wrap(obcEl(ObcAlertButton, { 'alert-type': props.alertType ?? 'caution', count: props.count ?? 3 }));
    case 'ui.form-container':
      return wrap(obcEl(ObcFormContainer, {}, label || 'Form'));
    case 'ui.radio':
      return wrap(obcEl(ObcRadio, { checked: props.checked ?? false }, label || 'Option'));
    case 'ui.checkbox':
      return wrap(obcEl(ObcCheckbox, { checked: props.checked ?? ctx.isRunning }, label || 'Option'));
    case 'ui.tag':
      return wrap(obcEl(ObcTag, {}, label || 'Tag'));
    case 'ui.filter-chip':
      return wrap(obcEl(ObcFilterChip, {}, label || 'Filter'));
    case 'ui.progress-button':
      return wrap(obcEl(ObcProgressButton, { value: pctValue(val) }, label || 'Loading'));
    case 'ui.clock':
      return wrap(obcEl(ObcClock, {}));
    case 'ui.badge':
      return wrap(obcEl(ObcBadge, {}, label || 'Badge'));
    case 'ui.notification-button':
      return wrap(obcEl(ObcNotificationButton, { count: props.count ?? 2 }));
    case 'ui.keyboard-numeric':
      return wrap(obcEl(ObcKeyboardNumeric, {}));
    case 'ui.stepper-box':
      return wrap(obcEl(ObcStepperBox, { value: val, min: props.minValue ?? 0, max: props.maxValue ?? 100 }));
    case 'ui.title-container':
      return wrap(obcEl(ObcTitleContainer, {}, label || 'Title'));
    case 'ui.event-list':
      return wrap(obcEl(ObcEventList, {}));
    case 'ui.advice-button':
      return wrap(obcEl(ObcAdviceButton, {}));
    case 'ui.system-button':
      return wrap(obcEl(ObcSystemButton, {}, label || 'System'));
    case 'ui.vendor-button':
      return wrap(obcEl(ObcVendorButton, {}, label || 'Vendor'));

    // ── Bars & Graphs ───────────────────────────────────────────────────────
    case 'graph.bar-vertical':
    case 'bb.bar-vertical':
      return wrap(obcEl(ObcBarVertical, barProps(ctx)));
    case 'graph.bar-horizontal':
    case 'bb.bar-horizontal':
      return wrap(obcEl(ObcBarHorizontal, { ...barProps(ctx), width: item.size.width }));
    case 'graph.progress-bar':
      return wrap(obcEl(ObcProgressBar, { value: pctValue(val) }));
    case 'graph.circular-progress':
    case 'bb.circular-progress':
      return wrap(obcEl(ObcCircularProgress, { value: pctValue(val), mode: props.progressMode ?? 'determinate' }));
    case 'graph.graph-mini':
      return wrap(obcEl(ObcGraphMini, { data: DEMO_GRAPH_DATA, minY: props.minValue ?? 0, maxY: props.maxValue ?? 100 }));
    case 'graph.gauge-trend':
      return wrap(obcEl(ObcGaugeTrend, { data: DEMO_TREND_DATA, ...instrumentValue(ctx), state: 'active' }));

    // ── Instruments ─────────────────────────────────────────────────────────
    case 'inst.gauge-radial':
      return wrap(obcEl(ObcGaugeRadial, { ...instrumentValue(ctx), type: props.gaugeType ?? 'needle', state: 'active' }));
    case 'inst.gauge-vertical':
      return wrap(obcEl(ObcGaugeVertical, { ...instrumentValue(ctx), state: 'active' }));
    case 'inst.gauge-horizontal':
      return wrap(obcEl(ObcGaugeHorizontal, { ...instrumentValue(ctx), state: 'active' }));
    case 'inst.instrument-radial':
    case 'bb.instrument-radial':
      return wrap(obcEl(ObcInstrumentRadial, { ...instrumentValue(ctx), type: props.gaugeType ?? 'needle', state: 'active' }));
    case 'inst.thruster':
      return wrap(obcEl(ObcThruster, { ...instrumentValue(ctx), state: 'active' }));
    case 'inst.azimuth-thruster':
      return wrap(obcEl(ObcAzimuthThruster, { ...instrumentValue(ctx), state: 'active' }));
    case 'inst.main-engine':
      return wrap(obcEl(ObcMainEngine, { ...instrumentValue(ctx), state: ctx.isRunning ? 'active' : 'inactive' }));
    case 'inst.compass':
      return wrap(obcEl(ObcCompass, { heading: val, state: 'active' }));
    case 'inst.compass-flat':
      return wrap(obcEl(ObcCompassFlat, { heading: val, state: 'active' }));
    case 'inst.compass-indicator':
      return wrap(obcEl(ObcCompassIndicator, { heading: val, state: 'active' }));
    case 'inst.speed-gauge':
      return wrap(obcEl(ObcSpeedGauge, { ...instrumentValue(ctx), state: 'active' }));
    case 'inst.speed-indicator':
      return wrap(obcEl(ObcSpeedIndicator, { speed: val, state: 'active' }));
    case 'inst.speed-arrows':
      return wrap(obcEl(ObcSpeedArrows, { speed: val, state: 'active' }));
    case 'inst.rudder':
      return wrap(obcEl(ObcRudder, { angle: val, state: 'active' }));
    case 'inst.rot-indicator':
      return wrap(obcEl(ObcRotIndicator, { rate: val, state: 'active' }));
    case 'inst.heading':
      return wrap(obcEl(ObcHeading, { heading: val, state: 'active' }));
    case 'inst.wind':
      return wrap(obcEl(ObcWind, { speed: val, direction: 45, state: 'active' }));
    case 'inst.wind-indicator':
      return wrap(obcEl(ObcWindIndicator, { speed: val, direction: 45, state: 'active' }));
    case 'inst.pitch':
      return wrap(obcEl(ObcPitch, { angle: val, state: 'active' }));
    case 'inst.roll':
      return wrap(obcEl(ObcRoll, { angle: val, state: 'active' }));
    case 'inst.pitch-roll':
      return wrap(obcEl(ObcPitchRoll, { pitch: val, roll: (props.maxValue ?? 10) / 2, state: 'active' }));
    case 'inst.depth-actual':
      return wrap(obcEl(ObcDepthActual, { ...instrumentValue(ctx), state: 'active' }));
    case 'inst.heave':
      return wrap(obcEl(ObcHeave, { value: val, state: 'active' }));
    case 'inst.rate-of-turn':
      return wrap(obcEl(ObcRateOfTurn, { rate: val, state: 'active' }));
    case 'inst.instrument-field':
      return wrap(obcEl(ObcInstrumentField, { value: val, unit: item.formatting?.unit ?? '', state: 'active' }));
    case 'inst.bearing-indicator':
      return wrap(obcEl(ObcBearingIndicator, { bearing: val, state: 'active' }));
    case 'inst.watch':
      return wrap(obcEl(ObcWatch, { state: 'active' }));
    case 'inst.watch-flat':
      return wrap(obcEl(ObcWatchFlat, { state: 'active' }));
    case 'inst.velocity-projection-plot':
      return wrap(obcEl(ObcVelocityProjectionPlot, { state: 'active' }));

    // ── Indicators ──────────────────────────────────────────────────────────
    case 'ind.status-indicator':
      return wrap(obcEl(ObcStatusIndicator, { status: props.status ?? statusState }, label || 'Status'));
    case 'ind.battery-icon':
      return wrap(obcEl(ObcBatteryIcon, {
        level: mode === 'preview' ? pctValue(val) : (props.level ?? 75),
        charging: props.charging ?? false,
        horizontal: props.horizontal ?? true,
      }));
    case 'ind.progress-dots':
      return wrap(obcEl(ObcProgressIndicatorDots, { value: props.value ?? 2, max: 5 }));
    case 'ind.alert-icon':
      return wrap(obcEl(ObcAlertIcon, { 'alert-type': props.alertType ?? 'caution' }));
    case 'ind.alert-frame':
      return wrap(obcEl(ObcAlertFrame, { 'alert-type': props.alertType ?? 'caution' }, label || 'Alert'));
    case 'ind.badge-command':
      return wrap(obcEl(ObcBadgeCommand, {}));

    // ── AR ──────────────────────────────────────────────────────────────────
    case 'ar.poi-vessel':
      return wrap(obcEl(ObcPoiVessel, { vesselType: 'generic', vesselState: ctx.isRunning ? 'active' : null }));
    case 'ar.poi-aton':
      return wrap(obcEl(ObcPoiAton, {}));
    case 'ar.poi-data':
      return wrap(obcEl(ObcPoiData, {}));
    case 'ar.poi-card':
      return wrap(obcEl(ObcPoiCard, {}, label || 'POI Card'));
    case 'ar.poi-card-header':
      return wrap(obcEl(ObcPoiCardHeader, {}, label || 'POI Header'));
    case 'ar.poi-controller':
      return wrap(obcEl(ObcPoiController, {}));
    case 'ar.poi-group':
      return wrap(obcEl(ObcPoiGroup, {}));
    case 'ar.poi-layer':
      return wrap(obcEl(ObcPoiLayer, {}, label || 'Layer'));
    case 'ar.poi-layer-stack':
      return wrap(obcEl(ObcPoiLayerStack, {}));
    case 'ar.poi-button-vessel':
      return wrap(obcEl(ObcPoiButtonVessel, {}));
    case 'ar.poi-button-aton':
      return wrap(obcEl(ObcPoiButtonAton, {}));
    case 'ar.poi-button-data':
      return wrap(obcEl(ObcPoiButtonData, {}));
    case 'ar.poi-object-vessel':
      return wrap(obcEl(ObcPoiObjectVessel, {}));
    case 'ar.poi-object-aton':
      return wrap(obcEl(ObcPoiObjectAton, {}));
    case 'ar.poi-object-data':
      return wrap(obcEl(ObcPoiObjectData, {}));
    case 'ar.chart-object-vessel-button':
      return wrap(obcEl(ObcChartObjectVesselButton, {}));

    // ── Building blocks ─────────────────────────────────────────────────────
    case 'bb.alert-list':
      return wrap(obcEl(ObcAlertList, {}));

    default:
      return (
        <div className="symbol symbol-unknown">
          <div className="symbol-unknown__type">{item.type}</div>
        </div>
      );
  }
}
