package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class ErrorIntegralsTest {
    @Test
    public void heldConstantErrorIntegratesExactly() {
        // e = 2 held for 100 s from t0 = 0 on a 5 s grid: IAE = 200, ISE = 400, ITAE = 0.5*2*100^2 = 10000
        int n = 21;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = 5.0 * i;
            y[i] = 10;
            r[i] = 12;
            v[i] = true;
        }
        ErrorIntegrals.Result x = ErrorIntegrals.over(new EventDataset(t, y, r, u, v, 0, 100));
        assertEquals(200.0, x.iae, 1e-9);
        assertEquals(400.0, x.ise, 1e-9);
        assertEquals(10000.0, x.itae, 1e-9);
        assertEquals(100.0, x.validDuration, 1e-9);
        assertEquals(1.0, x.coverage, 1e-12);
        assertEquals(0.0, x.excludedDuration, 1e-9);
    }

    @Test
    public void aBadQualityHoleIsExcludedNotBridged() {
        int n = 21;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = 5.0 * i;
            y[i] = 10;
            r[i] = 12;
            v[i] = !(t[i] >= 30 && t[i] < 60);   // 30 s hole
        }
        ErrorIntegrals.Result x = ErrorIntegrals.over(new EventDataset(t, y, r, u, v, 0, 100));
        assertEquals(140.0, x.iae, 1e-9);
        assertEquals(70.0, x.validDuration, 1e-9);
        assertEquals(30.0, x.excludedDuration, 1e-9);
        assertEquals(0.7, x.coverage, 1e-12);
        // exact ITAE over [0,30) and [60,100): 0.5*2*(30^2) + 0.5*2*(100^2-60^2) = 900 + 6400
        assertEquals(7300.0, x.itae, 1e-9);
    }

    @Test
    public void supportIsClippedToTheEventBounds() {
        double[] t = {-10, 0, 10, 20, 30};
        double[] y = {0, 0, 0, 0, 0};
        double[] r = {1, 1, 1, 1, 1};
        double[] u = new double[5];
        boolean[] v = {true, true, true, true, true};
        ErrorIntegrals.Result x = ErrorIntegrals.over(new EventDataset(t, y, r, u, v, 5, 25));
        assertEquals(20.0, x.iae, 1e-9);            // only [5,25) counts
        assertEquals(20.0, x.validDuration, 1e-9);
    }
}
