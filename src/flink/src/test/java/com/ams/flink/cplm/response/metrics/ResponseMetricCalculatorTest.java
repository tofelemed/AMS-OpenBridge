package com.ams.flink.cplm.response.metrics;

import com.ams.flink.cplm.response.model.Quantity;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ResponseMetricCalculatorTest {
    private static ResponseMetricCalculator.Settings settings() {
        ResponseMetricCalculator.Settings s = new ResponseMetricCalculator.Settings();
        s.preSupportS = 10;
        s.tailDwellS = 30;
        s.stableBandEu = 0.5;
        s.absSettlingBandEu = 0.1;
        s.relSettlingBand = 0.02;
        s.noiseFloorEu = 0.05;
        s.crossingDwellS = 5;
        s.maxGapS = 60;
        s.minResponseEu = 0.5;
        s.targetBandEu = 0.5;
        return s;
    }

    @Test
    public void theSpecExampleProducesTheSpecNumbersWithUnits() {              // NR-001
        // -20 s of stable pre-support, then the §2.11 response observed to 250 s so the tail is settled
        int n = 2701;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = -20 + 0.1 * i;
            y[i] = t[i] <= 4 ? 100 : 100 + 15 * (1 - Math.exp(-(t[i] - 4) / 20));
            r[i] = t[i] < 0 ? 100 : 115;
            u[i] = t[i] < 0 ? 40 : 45;
            v[i] = true;
        }
        Map<String, Quantity> q = ResponseMetricCalculator.compute(new EventDataset(t, y, r, u, v, 0, 250), 100, 115, 5.0, settings());
        assertEquals(6.1072, q.get("t10").value, 0.06);
        assertEquals(50.0517, q.get("t90").value, 0.06);
        assertEquals(43.9445, q.get("rise_time_10_90").value, 0.12);
        assertEquals("s", q.get("rise_time_10_90").unit);
        assertEquals(115.0, q.get("endpoint_pv").value, 0.02);
        assertEquals(1.0, q.get("servo_gain").value, 0.02);
        assertEquals("dimensionless", q.get("servo_gain").unit);
        assertEquals(5.0, q.get("input_step").value, 1e-9);
        assertEquals("input_EU", q.get("input_step").unit);
        // the robust endpoint (tail median) sits a hair below the asymptote: that is not an overshoot
        assertEquals(0.0, q.get("overshoot").value, 1e-9);
        assertEquals(ResponseMetricCalculator.PCT_OF_RESPONSE, q.get("overshoot").unit);
        assertEquals(0.0, q.get("steady_error").value, 0.02);
        assertEquals(4 + 20 * Math.log(15.0 / 0.3), q.get("settle_response").value, 0.6);
        assertFalse(q.get("decay_ratio").available());
        assertEquals("NO_QUALIFIED_PEAK_PAIR", q.get("decay_ratio").reasonIfNull);
        assertTrue(q.get("iae").available());
        assertEquals("PV_EU*s", q.get("iae").unit);
        assertEquals("PV_EU*s^2", q.get("itae").unit);
        assertEquals(1.0, q.get("valid_coverage").value, 1e-12);
    }

    @Test
    public void everyQuantityIsPresentEvenWhenUnavailable() {
        double[] t = {0, 5, 10};
        double[] y = {1, 1, 1};
        double[] r = {1, 1, 1};
        double[] u = {0, 0, 0};
        boolean[] v = {true, true, true};
        Map<String, Quantity> q = ResponseMetricCalculator.compute(new EventDataset(t, y, r, u, v, 0, 10), 1, 1, null, settings());
        for (String id : ResponseMetricCalculator.QUANTITY_IDS) assertTrue(id, q.containsKey(id));
        assertEquals("NO_STEP_OR_UNKNOWN_INPUT", q.get("input_step").reasonIfNull);
        assertEquals("NO_MEANINGFUL_RESPONSE", q.get("overshoot").reasonIfNull);
        assertEquals("CENSORED_OR_NO_ENDPOINT", q.get("t10").reasonIfNull);
    }

    @Test
    public void aRealOvershootIsReportedWithItsPeak() {
        // underdamped second order zeta=0.3, wn=0.2 rad/s, step 0->1 at t0=0, sampled 0.5 s to 200 s
        double zeta = 0.3, wn = 0.2, wd = wn * Math.sqrt(1 - zeta * zeta);
        int n = 441;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = -20 + 0.5 * i;
            double tt = Math.max(0, t[i]);
            y[i] = t[i] < 0 ? 0 : 1 - Math.exp(-zeta * wn * tt) * (Math.cos(wd * tt) + zeta * wn / wd * Math.sin(wd * tt));
            r[i] = t[i] < 0 ? 0 : 1;
            v[i] = true;
        }
        ResponseMetricCalculator.Settings s = settings();
        s.minResponseEu = 0.1;
        s.stableBandEu = 0.05;
        s.absSettlingBandEu = 0.02;
        Map<String, Quantity> q = ResponseMetricCalculator.compute(new EventDataset(t, y, r, u, v, 0, 200), 0, 1, null, s);
        double expectedPct = 100 * Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));   // 37.2 %
        assertEquals(expectedPct, q.get("overshoot").value, 1.0);
        assertEquals(Math.PI / wd, q.get("peak_time").value, 0.6);
        assertTrue(q.get("decay_ratio").available());
        assertEquals(Math.exp(-2 * zeta * Math.PI / Math.sqrt(1 - zeta * zeta)), q.get("decay_ratio").value, 0.03);
    }
}
