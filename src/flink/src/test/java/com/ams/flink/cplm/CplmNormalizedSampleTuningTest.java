package com.ams.flink.cplm;

import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.java.typeutils.PojoTypeInfo;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-212 (System Response plan 2b): the loop's P / I / D arrive on traverse.cpa.loop.samples.v1 as the extra numeric
 * fields p, i, d (ingestion LoopIngestConfig.DefaultParamRoles). The sample reads them; anything not a finite number is
 * absent, never 0.
 */
public class CplmNormalizedSampleTuningTest {

    private static final String BASE = "{\"loop_id\":\"PIC1\",\"event_ts_ms\":1000,\"pv\":50,\"sp\":50,\"op\":40,\"mode\":\"AUT\",\"quality\":\"GOOD\"";

    @Test
    public void readsPIAndD() {
        CplmNormalizedSample s = CplmNormalizedSample.fromJson(BASE + ",\"p\":40,\"i\":30,\"d\":0}");
        assertTrue(s.isValid);
        assertEquals(40.0, s.p, 0);
        assertEquals(30.0, s.i, 0);
        assertEquals(0.0, s.d, 0);
    }

    @Test
    public void absentOrNonNumericTuningIsNullNeverZero() {
        CplmNormalizedSample none = CplmNormalizedSample.fromJson(BASE + "}");
        assertTrue(none.isValid);
        assertNull(none.p);
        assertNull(none.i);
        assertNull(none.d);
        CplmNormalizedSample bad = CplmNormalizedSample.fromJson(BASE + ",\"p\":\"abc\",\"i\":null,\"d\":\"NaN\"}");
        assertTrue("a bad tuning field never invalidates the sample", bad.isValid);
        assertNull(bad.p);
        assertNull(bad.i);
        assertNull(bad.d);
    }

    @Test
    public void aPeerCopyKeepsTheTuning() {
        CplmNormalizedSample s = CplmNormalizedSample.fromJson(BASE + ",\"p\":40,\"i\":30}");
        CplmNormalizedSample c = s.peerCopy("PIC2");
        assertEquals(40.0, c.p, 0);
        assertEquals(30.0, c.i, 0);
        assertNull(c.d);
    }

    /** The Long Diagnostics job keeps samples in keyed state through the POJO serializer, which restores added nullable fields. */
    @Test
    public void staysAFlinkPojoSoStateRestoresAfterTheNewFields() {
        assertTrue(TypeInformation.of(CplmNormalizedSample.class) instanceof PojoTypeInfo);
    }
}
