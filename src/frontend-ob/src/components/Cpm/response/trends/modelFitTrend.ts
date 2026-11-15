/**
 * CHG-197 trend 8: measured PV against the model fit on this event (training), the holdout prediction and the prediction band,
 * the band named with its meaning. The engine runs the holdout prediction on the PREVIOUS event's samples
 * (ResponseEvaluator: priorHoldout.t), so it is drawn only where it falls inside this event's window; the live engine writes no
 * prediction band yet (no noise model), and a band it writes later is drawn with its meaning.
 */
import { bandMeaningText, prov } from '../responseSupport';
import { insideWindow, pvSeries, stepMark, timeSeries, TREND_HEIGHT, type TrendSpec } from './trendSupport';
import type { ResponseFacts } from './responseFacts';

export function modelFitTrend(f: ResponseFacts): TrendSpec | null {
  if (f.censored || !f.fit || f.fit.n === 0) return null;
  const series = [pvSeries(f), timeSeries(f.fit, 'y_fit', 'Model fit (training)', f.pvUnit, 'overlay', { dashDot: true })];
  const predicted = insideWindow(f.predict, f);
  if (predicted && f.predict) series.push(timeSeries(f.predict, 'y_predict', 'Holdout prediction', f.pvUnit, 'vp', { dashed: true }));
  const band = insideWindow(f.band, f) ? f.band : undefined;
  if (band) {
    const meaning = bandMeaningText(prov(band, 'band_meaning'));
    series.push(timeSeries(band, 'pi_upper', 'Prediction band, upper', f.pvUnit, 'vp', { bandMeaning: meaning }));
    if (band.columns.lower) series.push(timeSeries(band, 'pi_lower', 'Prediction band, lower', f.pvUnit, 'vp', { bandMeaning: meaning }, 'lower'));
  }
  return {
    id: 'model-fit', title: 'Model fit', unit: f.pvUnit, height: TREND_HEIGHT, marks: [stepMark(f)], series,
    help: [
      'Model fit (training): the fitted model driven by this event\'s input, against the measured PV.',
      predicted ? 'Holdout prediction: the model run free on input it was not fitted to.' : 'The holdout check runs the model on the previous event, on that event\'s times, so it is not drawn here; its verdict is on Fit quality.',
      ...(band ? ['The band is a prediction interval of the output, not a confidence interval of the parameters.'] : []),
    ],
  };
}
