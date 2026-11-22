package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.ResponseJobConfig;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-212 (plan 2c): CENTUM PID tuning to the engine's ideal-form controller. P is the proportional band in % of the PV
 * span, so Kc = (100 / P) x (OP span / PV span) in % output per PV unit; I and D are seconds, 0 = off.
 */
public class CentumTuningTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static ResponseJobConfig cfg(double pvSpan) {
        ResponseJobConfig c = new ResponseJobConfig();
        c.pvSpanEu = pvSpan;
        return c;
    }

    @Test
    public void proportionalBandBecomesGainInEngineeringUnits() {
        CentumTuning t = CentumTuning.of(new double[] {100, 40, 30, 0}, cfg(200));
        assertEquals("IDEAL", t.snapshot.form);
        assertTrue(t.snapshot.known());
        assertEquals((100.0 / 40) * (100.0 / 200), t.snapshot.kc, 1e-12);
        assertEquals(30.0, t.snapshot.ti, 0);
        assertNull("D = 0 is no derivative", t.snapshot.td);
        assertEquals(1.0, t.snapshot.scanS, 0);
        assertTrue(t.ref.startsWith("ctl:"));
        assertTrue(t.usable);
    }

    @Test
    public void integralTimeZeroIsNoIntegral() {
        CentumTuning t = CentumTuning.of(new double[] {0, 40, 0, 5}, cfg(100));
        assertNull(t.snapshot.ti);
        assertEquals(5.0, t.snapshot.td, 0);
    }

    @Test
    public void withoutAPvRangeTheTuningIsRecordedButNotUsed() {
        CentumTuning t = CentumTuning.of(new double[] {0, 40, 30, 0}, cfg(Double.NaN));
        assertFalse(t.snapshot.known());
        assertFalse(t.usable);
        ObjectNode b = t.body(M);
        assertEquals("PV_RANGE_NOT_SET", b.path("reason").asText());
        assertTrue(b.path("kc").isNull());
        assertEquals(40.0, b.path("raw_p").asDouble(), 0);
    }

    @Test
    public void noUsablePIsNoTuning() {
        assertNull(CentumTuning.of(null, cfg(100)));
        assertNull(CentumTuning.of(new double[] {0, 0, 30, 0}, cfg(100)));
        assertNull(CentumTuning.of(new double[] {0, -5, 30, 0}, cfg(100)));
        assertNull(CentumTuning.of(new double[] {0, Double.NaN, 30, 0}, cfg(100)));
    }

    @Test
    public void theRefNamesTheValuesNotTheTime() {
        String a = CentumTuning.of(new double[] {100, 40, 30, 0}, cfg(200)).ref;
        assertEquals("the same tuning seen later has the same ref", a, CentumTuning.of(new double[] {900, 40, 30, 0}, cfg(200)).ref);
        assertNotEquals(a, CentumTuning.of(new double[] {100, 40, 31, 0}, cfg(200)).ref);
        assertNotEquals("a PV range change changes the gain", a, CentumTuning.of(new double[] {100, 40, 30, 0}, cfg(400)).ref);
    }

    @Test
    public void theBodyCarriesTheAgreedFields() {
        ObjectNode b = CentumTuning.of(new double[] {1_789_600_000.0, 40, 30, Double.NaN}, cfg(200)).body(M);
        assertEquals("IDEAL", b.path("form").asText());
        assertEquals(1.25, b.path("kc").asDouble(), 1e-12);
        assertEquals(30.0, b.path("ti_s").asDouble(), 0);
        assertTrue(b.path("td_s").isNull());
        assertTrue("the plant does not publish the action", b.path("action").isNull());
        assertEquals(1.0, b.path("scan_s").asDouble(), 0);
        assertEquals(40.0, b.path("raw_p").asDouble(), 0);
        assertEquals(30.0, b.path("raw_i").asDouble(), 0);
        assertTrue(b.path("raw_d").isNull());
        assertEquals(200.0, b.path("pv_span_eu").asDouble(), 0);
        assertEquals(0.0, b.path("op_low_eu").asDouble(), 0);
        assertEquals(100.0, b.path("op_high_eu").asDouble(), 0);
        assertEquals("2026-09-16T23:06:40Z", b.path("effective_from").asText());
        assertEquals("DCS", b.path("source").asText());
        assertEquals(CentumTuning.ADAPTER, b.path("adapter_version").asText());
        assertTrue(b.path("usable").asBoolean());
        assertTrue(b.path("reason").isNull());
    }

    @Test
    public void theAdviceGainReadsBackAsAProportionalBand() {
        ResponseJobConfig c = cfg(200);
        assertEquals(40.0, CentumTuning.proportionalBand(1.25, c), 1e-9);
        assertEquals("the sign of a gain is not a band", 40.0, CentumTuning.proportionalBand(-1.25, c), 1e-9);
        assertNull(CentumTuning.proportionalBand(1.25, cfg(Double.NaN)));
    }
}
