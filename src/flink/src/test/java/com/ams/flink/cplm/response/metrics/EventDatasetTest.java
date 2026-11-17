package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** CHG-205: the even-grid copy of an event for methods that need one (PV linear, reference and input held). */
public class EventDatasetTest {
    private static EventDataset of(double[] t, double[] y, double[] u, boolean[] valid) {
        double[] r = new double[t.length];
        return new EventDataset(t, y, r, u, valid, t[0], t[t.length - 1]);
    }

    @Test
    public void resampleUniformInterpolatesPvAndHoldsInputs() {
        double[] t = {0, 4, 10, 15};
        EventDataset d = of(t, new double[]{0, 4, 10, 15}, new double[]{1, 1, 2, 2}, new boolean[]{true, true, true, true});
        EventDataset g = d.resampledUniform(5);
        assertArrayEquals(new double[]{0, 5, 10, 15}, g.t, 1e-9);
        assertArrayEquals(new double[]{0, 5, 10, 15}, g.y, 1e-9);
        assertArrayEquals(new double[]{1, 1, 2, 2}, g.u, 1e-9);
        assertEquals(d.t0, g.t0, 0);
        assertEquals(d.tEnd, g.tEnd, 0);
        assertTrue(g.isUniform(1e-6));
        assertFalse(d.isUniform(1e-6));
    }

    @Test
    public void aGridSampleIsValidOnlyWhenBothNeighboursAre() {
        EventDataset d = of(new double[]{0, 4, 10, 15}, new double[]{0, 4, 10, 15}, new double[4], new boolean[]{true, false, true, true});
        EventDataset g = d.resampledUniform(5);
        assertTrue(g.valid[0]);
        assertFalse(g.valid[1]);                                                // between the valid 0 and the invalid 4
        assertTrue(g.valid[2]);
        assertTrue(g.valid[3]);
    }

    @Test
    public void medianDtOfJitteredGrid() {
        double[] t = {0, 4, 10, 15, 20, 24};                                    // steps 4, 6, 5, 5, 4
        EventDataset d = of(t, new double[6], new double[6], new boolean[6]);
        assertEquals(5.0, d.medianDt(), 1e-12);
    }
}
