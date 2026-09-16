/**
 * v2.5 Task 2E.4: the gate views, one per gate, registered here. A gate without a view falls back to
 * the generic artifact renderer (every retained artifact drawn as the series it is).
 */
import type React from 'react';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { G0DataQualification, G1ModeAuthority, G2SpEvents, G2rOperatingRegion, G3ObjectiveError, G4ControlActivity } from './ShortViews';
import { G5Oscillation, G6Spectrum, G7WaveformFits, G8LagStructure, G9CycleGeometry, G10Actuator, G11Measurement } from './LongViews';
import { G12Response, G14Confirmation, G15Decision } from './FusionViews';
import { G13Interaction } from './G13Interaction';

export const GATE_VIEWS: Record<string, React.FC<GateViewProps> | undefined> = {
  G0: G0DataQualification, G1: G1ModeAuthority, G2: G2SpEvents, G2r: G2rOperatingRegion, G3: G3ObjectiveError, G4: G4ControlActivity,
  G5: G5Oscillation, G6: G6Spectrum, G7: G7WaveformFits, G8: G8LagStructure, G9: G9CycleGeometry, G10: G10Actuator, G11: G11Measurement,
  G12: G12Response, G13: G13Interaction, G14: G14Confirmation, G15: G15Decision,
};
