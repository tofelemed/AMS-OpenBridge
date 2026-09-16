/**
 * v2.5 Task 2E.4: the gate views, one per gate, registered here. A gate without a view falls back to
 * the generic artifact renderer (every retained artifact drawn as the series it is).
 */
import type React from 'react';
import type { GateViewProps } from '../EvidenceArtifactRenderer';

export const GATE_VIEWS: Record<string, React.FC<GateViewProps> | undefined> = {};
