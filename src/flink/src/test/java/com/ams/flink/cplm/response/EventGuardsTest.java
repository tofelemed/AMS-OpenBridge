package com.ams.flink.cplm.response;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** CHG-207: the dwell rules of the limit and region guards. */
public class EventGuardsTest {
    @Test
    public void limitBandIsOnePercentOfTheSpanAtBothEnds() {
        EventGuards g = new EventGuards(new ResponseJobConfig());
        assertNull(g.onSample(0, 1.5, 50, true));
        assertNull(g.onSample(20, 1.5, 50, true));
        assertNull(g.onSample(30, 1.0, 50, true));
        assertEquals("ACTUATOR_CONSTRAINT", g.onSample(40, 1.0, 50, true));
        g.reset();
        assertNull(g.onSample(0, 98.9, 50, true));
        assertNull(g.onSample(20, 98.9, 50, true));
    }

    @Test
    public void aSampleInsideTheBandRestartsTheDwell() {
        EventGuards g = new EventGuards(new ResponseJobConfig());
        assertNull(g.onSample(0, 100, 50, true));
        assertNull(g.onSample(8, 100, 50, true));
        assertNull(g.onSample(9, 60, 50, true));
        assertNull(g.onSample(10, 100, 50, true));
        assertNull(g.onSample(19, 100, 50, true));
        assertEquals("ACTUATOR_CONSTRAINT", g.onSample(20, 100, 50, true));
    }

    @Test
    public void resetForgetsARunningDwell() {
        EventGuards g = new EventGuards(new ResponseJobConfig());
        g.onSample(0, 100, 50, true);
        g.reset();
        assertNull(g.onSample(10, 100, 50, true));
    }
}
