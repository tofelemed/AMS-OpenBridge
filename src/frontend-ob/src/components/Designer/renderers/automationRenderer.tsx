import React from 'react';
import type { AutomationRenderContext } from '../obcRenderShared';
import {
  automationProps,
  motorizedProps,
  squaredProps,
  valveProps,
  lineProps,
  wrapAutomation,
  obcEl,
  resolveAutomationRenderType,
  pctValue,
} from '../obcRenderShared';
// Automation devices
import { ObcAnalogValve } from '@oicl/openbridge-webcomponents-react/automation/analog-valve/analog-valve';
import { ObcAutomationButton } from '@oicl/openbridge-webcomponents-react/automation/automation-button/automation-button';
import { ObcBipolarTransistor } from '@oicl/openbridge-webcomponents-react/automation/bipolar-transistor/bipolar-transistor';
import { ObcCapacitor } from '@oicl/openbridge-webcomponents-react/automation/capacitor/capacitor';
import { ObcConverter } from '@oicl/openbridge-webcomponents-react/automation/converter/converter';
import { ObcDamper } from '@oicl/openbridge-webcomponents-react/automation/damper/damper';
import { ObcDigitalValve } from '@oicl/openbridge-webcomponents-react/automation/digital-valve/digital-valve';
import { ObcDiodes } from '@oicl/openbridge-webcomponents-react/automation/diodes/diodes';
import { ObcFan } from '@oicl/openbridge-webcomponents-react/automation/fan/fan';
import { ObcFilter } from '@oicl/openbridge-webcomponents-react/automation/filter/filter';
import { ObcGround } from '@oicl/openbridge-webcomponents-react/automation/ground/ground';
import { ObcLogic } from '@oicl/openbridge-webcomponents-react/automation/logic/logic';
import { ObcMosfet } from '@oicl/openbridge-webcomponents-react/automation/mosfet/mosfet';
import { ObcMotor } from '@oicl/openbridge-webcomponents-react/automation/motor/motor';
import { ObcPump } from '@oicl/openbridge-webcomponents-react/automation/pump/pump';
import { ObcResistor } from '@oicl/openbridge-webcomponents-react/automation/resistor/resistor';
import { ObcRouter } from '@oicl/openbridge-webcomponents-react/automation/router/router';
import { ObcSource } from '@oicl/openbridge-webcomponents-react/automation/source/source';
import { ObcSwitch } from '@oicl/openbridge-webcomponents-react/automation/switch/switch';
import { ObcTransformer } from '@oicl/openbridge-webcomponents-react/automation/transformer/transformer';

// Config / readouts / tanks
import { ObcAutomationBadge } from '@oicl/openbridge-webcomponents-react/automation/automation-badge/automation-badge';
import { ObcAutomationReadout } from '@oicl/openbridge-webcomponents-react/automation/automation-readout/automation-readout';
import { ObcAutomationTank } from '@oicl/openbridge-webcomponents-react/automation/automation-tank/automation-tank';

// Lines
import { ObcHorizontalLine } from '@oicl/openbridge-webcomponents-react/automation/horizontal-line/horizontal-line';
import { ObcVerticalLine } from '@oicl/openbridge-webcomponents-react/automation/vertical-line/vertical-line';
import { ObcCornerLine } from '@oicl/openbridge-webcomponents-react/automation/corner-line/corner-line';
import { ObcThreeWayLine } from '@oicl/openbridge-webcomponents-react/automation/three-way-line/three-way-line';
import { ObcDirectionLine } from '@oicl/openbridge-webcomponents-react/automation/direction-line/direction-line';
import { ObcEndPointLine } from '@oicl/openbridge-webcomponents-react/automation/end-point-line/end-point-line';
import { ObcLineCross } from '@oicl/openbridge-webcomponents-react/automation/line-cross/line-cross';
import { ObcLineOverlap } from '@oicl/openbridge-webcomponents-react/automation/line-overlap/line-overlap';

// Valve icons
import { ObcValveAnalogThreeWayIcon } from '@oicl/openbridge-webcomponents-react/automation/valve-analog-three-way-icon/valve-analog-three-way-icon';
import { ObcValveAnalogTwoWayIcon } from '@oicl/openbridge-webcomponents-react/automation/valve-analoge-two-way-icon/valve-analog-two-way-icon';

// Sequence
import { ObcSequenceStep } from '@oicl/openbridge-webcomponents-react/components/sequence-step/sequence-step';
import { ObcSequenceConnector } from '@oicl/openbridge-webcomponents-react/components/sequence-connector/sequence-connector';
import { ObcSequenceItem } from '@oicl/openbridge-webcomponents-react/components/sequence-item/sequence-item';
import { ObcSequenceToolbar } from '@oicl/openbridge-webcomponents-react/components/sequence-toolbar/sequence-toolbar';
import { ObcSequenceCard } from '@oicl/openbridge-webcomponents-react/components/sequence-card/sequence-card';
import { ObcAutomationButtonReadoutStack } from '@oicl/openbridge-webcomponents-react/components/automation-button-readout-stack/automation-button-readout-stack';

function props(item: AutomationRenderContext['item']) {
  return automationProps(item);
}

function wrap(content: React.ReactNode) {
  return wrapAutomation(content);
}

export function renderSymbol(ctx: AutomationRenderContext): React.ReactNode {  const { item, mode, numericValue, displayValue } = ctx;
  const p = props(item);
  const renderType = resolveAutomationRenderType(item.type);

  switch (renderType) {
    // ── Devices: motorized ──────────────────────────────────────────────────
    case 'obc.auto.pump':
      return wrap(obcEl(ObcPump, motorizedProps(ctx)));
    case 'obc.auto.motor':
      return wrap(obcEl(ObcMotor, motorizedProps(ctx)));
    case 'obc.auto.fan':
      return wrap(obcEl(ObcFan, motorizedProps(ctx)));

    // ── Devices: valves ─────────────────────────────────────────────────────
    case 'obc.auto.analog-valve':
      return wrap(obcEl(ObcAnalogValve, valveProps(ctx)));
    case 'obc.auto.digital-valve':
      return wrap(obcEl(ObcDigitalValve, valveProps(ctx)));

    // ── Devices: squared (on/off) ───────────────────────────────────────────
    case 'obc.auto.damper':
      return wrap(obcEl(ObcDamper, squaredProps(ctx)));
    case 'obc.auto.bipolar-transistor':
      return wrap(obcEl(ObcBipolarTransistor, squaredProps(ctx)));
    case 'obc.auto.capacitor':
      return wrap(obcEl(ObcCapacitor, squaredProps(ctx)));
    case 'obc.auto.converter':
      return wrap(obcEl(ObcConverter, squaredProps(ctx)));
    case 'obc.auto.diodes':
      return wrap(obcEl(ObcDiodes, squaredProps(ctx)));
    case 'obc.auto.filter':
      return wrap(obcEl(ObcFilter, squaredProps(ctx)));
    case 'obc.auto.logic':
      return wrap(obcEl(ObcLogic, squaredProps(ctx)));
    case 'obc.auto.mosfet':
      return wrap(obcEl(ObcMosfet, squaredProps(ctx)));
    case 'obc.auto.resistor':
      return wrap(obcEl(ObcResistor, { ...squaredProps(ctx), alternativeIcon: p.alternativeIcon ?? 'resistor1' }));
    case 'obc.auto.router':
      return wrap(obcEl(ObcRouter, squaredProps(ctx)));
    case 'obc.auto.source':
      return wrap(obcEl(ObcSource, squaredProps(ctx)));
    case 'obc.auto.switch':
      return wrap(obcEl(ObcSwitch, squaredProps(ctx)));
    case 'obc.auto.transformer':
      return wrap(obcEl(ObcTransformer, squaredProps(ctx)));

    case 'obc.auto.ground':
      return wrap(obcEl(ObcGround, {}));

    // ── Control / button ────────────────────────────────────────────────────
    case 'obc.auto.automation-button':
      return wrap(
        obcEl(ObcAutomationButton, {
          variant: item.type === 'obc.auto.control-compact' ? 'flat' : (p.variant ?? 'regular'),
          state: p.state ?? 'closed',
          static: p.static ?? false,
          showReadoutStack: p.showReadoutStack ?? true,
          readoutPosition: p.buttonReadoutPosition ?? 'bottom',
          direction: p.buttonDirection ?? 'forward',
          alert: p.alert ?? false,
          tag: ctx.item.label ? { value: 0 } : null,
        })
      );

    // ── Config ──────────────────────────────────────────────────────────────
    case 'obc.auto.automation-badge':
      return wrap(
        obcEl(ObcAutomationBadge, { mode: p.badgeMode ?? 'regular', type: p.badgeType ?? 'auto' })
      );

    case 'obc.auto.readout-stack':
      return wrap(
        obcEl(ObcAutomationButtonReadoutStack, {
          size: 'regular',
          hasIdTag: !!item.label,
          readouts: [
            {
              type: 'value',
              value: mode === 'preview' ? numericValue : 0,
              nDigits: p.numberOfDigits ?? 3,
              unit: item.formatting?.unit ?? '',
              direction: 'up',
              icon: 'none',
            },
          ],
          tag: item.label ? { value: 0 } : null,
        })
      );

    case 'obc.auto.automation-input-modal':
      return wrap(
        <div className="symbol-automation__placeholder">
          {obcEl(ObcAutomationReadout, {
            value: mode === 'preview' ? numericValue : 0,
            unit: item.formatting?.unit ?? '',
            numberOfDigits: p.numberOfDigits ?? 3,
            position: p.readoutPosition ?? 'right',
          })}
        </div>
      );

    // ── Readouts ────────────────────────────────────────────────────────────
    case 'obc.auto.automation-readout':
      return wrap(
        obcEl(ObcAutomationReadout, {
          value: mode === 'preview' ? numericValue : (p.value ?? 0),
          unit: item.formatting?.unit ?? '',
          numberOfDigits: p.numberOfDigits ?? 3,
          position: p.readoutPosition ?? 'right',
          lineType: p.lineType ?? 'fluid',
        })
      );

    // ── Tanks ───────────────────────────────────────────────────────────────
    case 'obc.auto.automation-tank':
      return wrap(
        obcEl(ObcAutomationTank, {
          medium: p.medium ?? 'water',
          value: mode === 'preview' ? pctValue(numericValue) : (p.value ?? 65),
          max: p.max ?? 100,
          trend: p.trend ?? 'stable',
          variant: item.type === 'obc.auto.automation-tank-compact' ? 'compact' : (p.tankVariant ?? 'vertical'),
          tag: item.label || p.tag || 'TK-101',
        })
      );

    // ── Lines ───────────────────────────────────────────────────────────────
    case 'obc.auto.horizontal-line':
      return wrap(
        obcEl(ObcHorizontalLine, { ...lineProps(p, item), length: p.length ?? item.size.width })
      );
    case 'obc.auto.vertical-line':
      return wrap(
        obcEl(ObcVerticalLine, {
          medium: p.medium ?? 'water',
          lineType: p.lineType ?? 'fluid',
          length: p.length ?? item.size.height,
        })
      );
    case 'obc.auto.corner-line':
      return wrap(
        obcEl(ObcCornerLine, {
          medium: p.medium ?? 'water',
          lineType: p.lineType ?? 'fluid',
          direction: p.direction ?? 'top-right',
        })
      );
    case 'obc.auto.three-way-line':
      return wrap(
        obcEl(ObcThreeWayLine, {
          medium: p.medium ?? 'water',
          lineType: p.lineType ?? 'fluid',
          direction: p.direction ?? 'top',
        })
      );
    case 'obc.auto.direction-line':
      return wrap(obcEl(ObcDirectionLine, { medium: p.medium ?? 'water', lineType: p.lineType ?? 'fluid' }));
    case 'obc.auto.end-point-line':
      return wrap(obcEl(ObcEndPointLine, { medium: p.medium ?? 'water', lineType: p.lineType ?? 'fluid' }));
    case 'obc.auto.line-cross':
      return wrap(obcEl(ObcLineCross, { medium: p.medium ?? 'water', lineType: p.lineType ?? 'fluid' }));
    case 'obc.auto.line-overlap':
      return wrap(obcEl(ObcLineOverlap, { medium: p.medium ?? 'water', lineType: p.lineType ?? 'fluid' }));

    // ── Valve icons ─────────────────────────────────────────────────────────
    case 'obc.auto.valve-three-way-icon':
      return wrap(
        obcEl(ObcValveAnalogThreeWayIcon, {
          value: mode === 'preview' ? numericValue : (p.value ?? 50),
          value2: p.value2 ?? 50,
          closed: p.closed ?? false,
          horisontal: p.horizontal ?? false,
        })
      );
    case 'obc.auto.valve-two-way-icon':
      return wrap(
        obcEl(ObcValveAnalogTwoWayIcon, {
          value: mode === 'preview' ? numericValue : (p.value ?? 50),
          closed: p.closed ?? false,
          vertical: p.vertical ?? false,
        })
      );

    // ── Sequence ────────────────────────────────────────────────────────────
    case 'obc.auto.sequence-step':
      return wrap(
        obcEl(
          ObcSequenceStep,
          {
            type: p.sequenceType ?? 'medium',
            value: p.sequenceValue ?? 'regular',
            orientation: p.sequenceOrientation ?? 'horizontal',
            styleType: p.sequenceStyle ?? 'regular',
            hasIcon: true,
          },
          p.stepLabel ?? '1'
        )
      );

    case 'obc.auto.sequence-connector':
      return wrap(
        obcEl(ObcSequenceConnector, {
          type: p.sequenceType ?? 'medium',
          state: p.connectorState ?? 'completed',
          direction: p.sequenceOrientation ?? 'horizontal',
          loadingBarPercent: p.loadingBarPercent ?? 50,
        })
      );

    case 'obc.auto.sequence-item':
      return wrap(
        obcEl(ObcSequenceItem, {
          title: item.label || p.title || 'Step',
          subtitle: p.subtitle ?? 'Description',
          stepValue: p.sequenceValue ?? 'active',
          stepLabel: p.stepLabel ?? '1',
          orientation: p.sequenceOrientation ?? 'horizontal',
        })
      );

    case 'obc.auto.sequence-toolbar':
      return wrap(
        obcEl(
          ObcSequenceToolbar,
          { type: p.toolbarType ?? 'sequential', hasAdd: p.hasAdd ?? false },
          <>
            {obcEl(ObcSequenceStep, { type: 'medium', value: 'completed' }, '1')}
            {obcEl(ObcSequenceStep, { type: 'medium', value: 'active' }, '2')}
            {obcEl(ObcSequenceStep, { type: 'medium', value: 'not-started' }, '3')}
          </>
        )
      );

    case 'obc.auto.sequence-card':
      return wrap(
        obcEl(
          ObcSequenceCard,
          {
            cardTitle: item.label || p.cardTitle || 'Event',
            subtitle: p.subtitle ?? 'Details',
            progressValue: p.sequenceValue ?? 'active',
            hasContent: true,
            state: 'active',
          },
          displayValue !== '--' ? displayValue : 'Sequence event content'
        )
      );

    default:
      return (
        <div className="symbol symbol-unknown">
          <div className="symbol-unknown__type">{item.type}</div>
        </div>
      );
  }
}
