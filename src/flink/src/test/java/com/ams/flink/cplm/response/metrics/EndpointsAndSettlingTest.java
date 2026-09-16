package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class EndpointsAndSettlingTest {
    static EventDataset fopdt(double end) { return CrossingsTest.fopdt(0.5, end, +1); }

    @Test
    public void endpointComesFromAStableTailNeverTheLastSample() {            // NR-008
        EventDataset full = fopdt(160);
        Endpoints.Estimate e = Endpoints.endpoint(full, 30, 0.5, 5);
        assertNotNull(e.value);
        assertEquals(115.0, e.value, 0.2);
        EventDataset truncated = fopdt(40);                                    // still rising at 40 s
        Endpoints.Estimate cut = Endpoints.endpoint(truncated, 30, 0.5, 5);
        assertNull(cut.value);
        assertEquals("NO_STABLE_ENDPOINT", cut.reason);
    }

    @Test
    public void responseSettlingIsObservedThroughTheRecordAndRightCensored() { // NR-008
        EventDataset full = fopdt(160);
        double band = Settling.responseBand(0.1, 0.02, 15.0, 0.05);            // = max(0.1, 0.3, 0.05) = 0.3
        Double ts = Settling.responseSettle(full, 115.0, band, 30, 60);
        assertNotNull(ts);
        assertEquals(4 + 20 * Math.log(15.0 / 0.3), ts, 0.6);                  // ~82.2 s, the 2 % point
        assertNull(Settling.responseSettle(fopdt(40), 115.0, band, 30, 60));
    }

    @Test
    public void aBiasedResponseSettlesToItsEndpointButNotToTheTarget() {      // NR-009
        int n = 401;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = 0.5 * i;
            y[i] = t[i] <= 4 ? 100 : 100 + 13 * (1 - Math.exp(-(t[i] - 4) / 20));
            r[i] = 115;
            v[i] = true;
        }
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 200);
        Endpoints.Estimate e = Endpoints.endpoint(d, 30, 0.5, 5);
        assertEquals(113.0, e.value, 0.2);
        assertNotNull(Settling.responseSettle(d, e.value, 0.3, 30, 60));
        assertNull("the approved target band (115 +/- 0.5) is never entered", Settling.targetSettle(d, 115.0, 0.5, 30, 60));
        assertEquals(2.0, 115.0 - e.value, 0.2);                               // steady_error retained
    }

    @Test
    public void baselineNeedsStablePreSupport() {
        EventDataset d = fopdt(160);
        Endpoints.Estimate b = Endpoints.baseline(new EventDataset(d.t, d.y, d.r, d.u, d.valid, 60.0, 160.0), 60, 0.5, 5);
        assertNull("the 60 s before t0=60 are not stable (the response is rising)", b.value);
        Endpoints.Estimate ok = Endpoints.baseline(new EventDataset(d.t, d.y, d.r, d.u, d.valid, 4.0, 160.0), 4, 0.5, 5);
        assertEquals(100.0, ok.value, 1e-9);
    }
}
