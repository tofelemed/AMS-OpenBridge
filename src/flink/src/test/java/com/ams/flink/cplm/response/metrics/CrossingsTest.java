package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class CrossingsTest {
    static EventDataset fopdt(double dt, double end, double sign) {
        int n = (int) Math.round(end / dt) + 1;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = i * dt;
            y[i] = t[i] <= 4 ? 100 : 100 + sign * 15 * (1 - Math.exp(-(t[i] - 4) / 20));
            r[i] = 100 + sign * 15;
            u[i] = 45;
            v[i] = true;
        }
        return new EventDataset(t, y, r, u, v, 0.0, end);
    }

    @Test
    public void t10AndT90MatchTheSpecToTheGridResolution() {                 // NR-001, §2.11
        EventDataset d = fopdt(0.1, 120, +1);
        double[] p = Crossings.progress(d, 100.0, 115.0);
        assertEquals(6.1072, Crossings.firstSustained(d, p, 0.10, 5.0), 0.06);
        assertEquals(50.0517, Crossings.firstSustained(d, p, 0.90, 5.0), 0.06);
        assertEquals(4 + 20 * Math.log(2), Crossings.firstSustained(d, p, 0.50, 5.0), 0.06);
        assertEquals(4 + 20.0, Crossings.firstSustained(d, p, 1 - Math.exp(-1), 5.0), 0.06);   // t63
    }

    @Test
    public void negativeGainIsDirectionNormalised() {                          // NR-002
        EventDataset d = fopdt(0.1, 120, -1);
        double[] p = Crossings.progress(d, 100.0, 85.0);
        assertEquals(6.1072, Crossings.firstSustained(d, p, 0.10, 5.0), 0.06);
        assertEquals(50.0517, Crossings.firstSustained(d, p, 0.90, 5.0), 0.06);
    }

    @Test
    public void aCrossingThatDoesNotPersistIsNotACrossing() {
        double[] t = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        double[] y = {0, 0, 0.95, 0.2, 0.2, 0.2, 0.96, 0.97, 0.98, 0.99, 1.0};
        double[] r = new double[t.length];
        double[] u = new double[t.length];
        boolean[] v = new boolean[t.length];
        java.util.Arrays.fill(v, true);
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 10);
        double[] p = Crossings.progress(d, 0, 1);
        // the spike at t=2 does not hold for 3 s; the sustained 90 % crossing is between t=5 and t=6
        Double t90 = Crossings.firstSustained(d, p, 0.9, 3.0);
        assertNotNull(t90);
        assertTrue(t90 > 5.0 && t90 < 6.0);
        assertNull("no 10 s dwell available before the record ends", Crossings.firstSustained(d, p, 0.9, 10.0));
    }
}
