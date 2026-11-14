// CHG-170 (owner answer 1): How to read, top right - a dialog in titled parts holding the page's ? texts, said once. The false
// "read-only" claim is corrected: the verification starts a recompute. Jargon ("an A8 recompute") in plain words. CHG-184 (owner
// review Q1): no engine state codes, no "Not exposed" part, no Kafka / Flink / Postgres / IoTDB / supervisor names.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import PipelineHowToRead from './PipelineHowToRead';

afterEach(cleanup);

describe('PipelineHowToRead', () => {
  it('is four titled parts', () => {
    render(<PipelineHowToRead open onClose={() => {}} freshMinutes={60} windowKind="12h" />);
    const dialog = screen.getByRole('dialog', { name: 'How to read' });
    expect([...dialog.querySelectorAll('h3')].map(h => h.textContent))
      .toEqual(['Job state', 'Numbers', 'Where a sample becomes a verdict', 'End-to-end verification']);
  });

  it('keys the job states as tone, glyph and word, with no engine codes', () => {
    render(<PipelineHowToRead open onClose={() => {}} freshMinutes={60} windowKind="12h" />);
    const part = screen.getByRole('region', { name: 'Job state' });
    expect([...part.querySelectorAll('.cpm-pill')].map(p => p.textContent)).toEqual(['✓Running', '◐Starting', '✕Missing', '✕Failed']);
    expect(within(part).getByText('The engine is bringing the job up.')).toBeTruthy();
    expect(part.textContent).not.toMatch(/INITIALIZING|RECONCILING|RUNNING:|Cancelling/);
  });

  it('says what a dash means and the verdict rule once, with the threshold it is given', () => {
    render(<PipelineHowToRead open onClose={() => {}} freshMinutes={60} windowKind="12h" />);
    const part = screen.getByRole('region', { name: 'Numbers' });
    expect(within(part).getByText('Not read: the engine did not answer, the job is not running, or it is not on the required list. Never an estimate, never 0.')).toBeTruthy();
    expect(within(part).getByText('The newest 12h result across the monitored loops, the Overview’s rule: ◐ Stale once it is older than 60 min.')).toBeTruthy();
  });

  it('names no infrastructure', () => {
    render(<PipelineHowToRead open onClose={() => {}} freshMinutes={60} windowKind="12h" />);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/Kafka|Flink|Postgres|IoTDB|supervisor|Watermark|Not exposed/);
  });

  it('corrects the read-only claim and drops the jargon', () => {
    render(<PipelineHowToRead open onClose={() => {}} freshMinutes={60} windowKind="12h" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('This page never starts or stops a job. Run end-to-end verification does write: it submits a recompute.');
    expect(dialog.textContent).not.toMatch(/read-only|A8/);
    expect(within(screen.getByRole('region', { name: 'End-to-end verification' }))
      .getByText('Submits a recompute on the chosen loop and waits for the batch verdict: historian read, normalise, gates, fused result stored. ✓ Verified only when the run wrote results.')).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    render(<PipelineHowToRead open={false} onClose={() => {}} freshMinutes={60} windowKind="12h" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
