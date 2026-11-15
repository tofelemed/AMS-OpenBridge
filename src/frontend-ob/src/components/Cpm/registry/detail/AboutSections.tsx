/**
 * CHG-201 (owner-approved mockup, 15 Nov 2026): the Loop detail page's fact cards, each fact once, in plain words.
 * Where it is: Plant, Area, Unit by the asset model's names (never the slugs), the control station when the description names
 * one, the zone times are shown in. How it is controlled: the loop type and the model dimensions in the editor's words
 * (loopWords), where they came from in one muted line. Analysis settings: the assessment settings ("Standard", else the name a
 * person gave them) with Gate Configuration ↗, step tests, how data arrives, monitoring. Changes: added and last changed in the
 * app's day style (owner Q5: no time format change), and a retired loop's open episode (UI-131); left out when there is none.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmEventFrame, CpmLoop } from '../../../../api/cpmApi';
import { dayStamp } from '../../../Administration/adminTime';
import { configHref } from '../../cpaHref';
import { codeLabel } from '../../vocabulary';
import { controlStation, type Place } from '../loopFacts';
import {
  acquisitionWord, classificationNote, criticalityWord, loopTypeWord, MODEL_FIELDS, modelWord, profileWord, type ModelDim,
} from '../loopWords';
import { Fact, Note, Section } from './Section';

const DASH = '—';

export const WhereSection: React.FC<{ loop: CpmLoop; place: Place }> = ({ loop, place }) => {
  const station = controlStation(loop);
  return (
    <Section title="Where it is">
      <Fact label="Plant">{place.plant ?? DASH}</Fact>
      <Fact label="Area">{place.area ?? DASH}</Fact>
      <Fact label="Unit">{place.unit ?? DASH}</Fact>
      {station && <Fact label="Control station">{station}</Fact>}
      <Fact label="Times shown in">{loop.timezone?.trim() || 'UTC'}</Fact>
    </Section>
  );
};

const DIMENSIONS: ModelDim[] = ['commandPath', 'topology', 'objectiveType', 'dynamicClass'];

export const ControlSection: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const m = loop.model;
  const type = loopTypeWord(loop.loopType);
  // The service is the loop type's own unless a person declared another.
  const service = m?.serviceFamily && m.classificationSource?.toUpperCase() === 'EXPLICIT' ? modelWord('serviceFamily', m.serviceFamily) : null;
  return (
    <Section title="How it is controlled">
      <Fact label="Loop type">{type}</Fact>
      {service && service !== type && <Fact label={MODEL_FIELDS.serviceFamily}>{service}</Fact>}
      {m && DIMENSIONS.map(d => <Fact key={d} label={MODEL_FIELDS[d]}>{modelWord(d, m[d])}</Fact>)}
      <Fact label="Criticality">{criticalityWord(loop.criticality)}</Fact>
      {m && <Note>{classificationNote(m.classificationSource)}</Note>}
    </Section>
  );
};

export const AnalysisSection: React.FC<{ loop: CpmLoop; canReadConfig: boolean }> = ({ loop, canReadConfig }) => (
  <Section title="Analysis settings">
    <Fact label="Assessment settings">
      {profileWord(loop.thresholdProfileId)}
      {canReadConfig && <>{' '}<Link className="cpm-link cpm-reg-kv__link" to={configHref({ loop: loop.loopId })}>Gate Configuration ↗</Link></>}
    </Fact>
    <Fact label="Step tests">{loop.stepTestApproved ? 'Allowed' : 'Not allowed'}</Fact>
    <Fact label="Data arrives">{acquisitionWord(loop.model?.acquisition?.mode)}</Fact>
    <Fact label="Monitoring">{loop.isActive && loop.monitoringEnabled ? 'On' : 'Off'}</Fact>
  </Section>
);

export const ChangesSection: React.FC<{ loop: CpmLoop; openEpisode?: Pick<CpmEventFrame, 'family' | 'opened_at'> | null }> = ({ loop, openEpisode }) => {
  if (!loop.createdAt && !loop.updatedAt && !openEpisode) return null;
  return (
    <Section title="Changes">
      {loop.createdAt && <Fact label="Added">{dayStamp(loop.createdAt)}</Fact>}
      {loop.updatedAt && <Fact label="Last changed">{dayStamp(loop.updatedAt)}</Fact>}
      {openEpisode && <Fact label="Open episode">{`${codeLabel(openEpisode.family)}, open since ${dayStamp(openEpisode.opened_at)}`}</Fact>}
    </Section>
  );
};
