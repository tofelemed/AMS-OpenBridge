/**
 * CHG-085: KPI icons that are not in the obi-* icon set. The valve KPI uses OpenBridge's own automation valve symbol
 * (obc-valve-analog-two-way-icon), so the card shows a control valve rather than a generic tool.
 */
import React from 'react';
import { ObcValveAnalogTwoWayIcon } from '@oicl/openbridge-webcomponents-react/automation/valve-analoge-two-way-icon/valve-analog-two-way-icon';

/** A half-open control valve, drawn by OpenBridge (value = opening %). */
export const ValveIcon: React.FC = () => <ObcValveAnalogTwoWayIcon value={50} />;

export default ValveIcon;
