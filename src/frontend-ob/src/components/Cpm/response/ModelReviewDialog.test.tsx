// CHG-184 (owner review item 0): the model review dialog shows no model id and no id of the event the model was created from;
// the revision stays, because the decision is bound to it.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SystemModel } from '../../../api/cpm/response';
import { ModelReviewDialog } from './ModelReviewDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const model: SystemModel = {
  modelId: '3f2a9c1e-7b44-4d2e-9a10-5c6d7e8f9012', loopId: 'FIC10302', pathId: 'OP_TO_PV', family: 'FOPDT', parameters: null,
  estimator: 'OUTPUT_ERROR_LM', uncertaintyMethod: 'COVARIANCE', trainingSupport: null, validationSupport: null, modelState: 'CANDIDATE',
  approvedDomain: null, controllerSnapshotId: null, contextRevision: 1, createdFromEvent: 'evt-8c41d2', methodRunId: null, bundleHash: 'b',
  revision: 4, reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: '2026-09-16T12:00:00Z', supersededBy: null,
} as SystemModel;

describe('ModelReviewDialog', () => {
  it('names the model and its revision, never its id or the event id', () => {
    render(<ModelReviewDialog model={model} pending={false} error={null} onClose={() => {}} onSubmit={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Review system model' });
    expect(dialog.textContent).toContain('FOPDT · OP_TO_PV');
    expect(screen.getByText('revision').parentElement?.textContent).toBe('revision4');
    expect(dialog.textContent).not.toMatch(/3f2a9c1e|evt-8c41d2/);
    expect(screen.queryByText('model')).toBeNull();
    expect(screen.queryByText('created from event')).toBeNull();
  });
});
