package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmNormalizedSample;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

/**
 * v2.5 Task 1G.2 (R19): the dataset hash names the exact support a result was computed on,
 * independent of arrival order, so a replay over the same samples can prove it saw the same data.
 */
public class DatasetHashTest {
    private static CplmNormalizedSample s(long ts, double pv, String quality) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC101"; x.eventTsMs = ts; x.pv = pv; x.sp = 50; x.op = 40; x.vp = null; x.mode = "AUT"; x.quality = quality;
        return x;
    }

    @Test
    public void sameSamplesInAnyOrderHashTheSame() {
        List<CplmNormalizedSample> a = new ArrayList<>();
        for (int i = 0; i < 50; i++) a.add(s(1000L * i, 50 + i * 0.1, "GOOD"));
        List<CplmNormalizedSample> b = new ArrayList<>(a);
        Collections.shuffle(b, new java.util.Random(7));
        assertEquals(DatasetHash.of(a), DatasetHash.of(b));
        assertEquals(64, DatasetHash.of(a).length());
    }

    @Test
    public void aChangedValueOrQualityChangesTheHash() {
        List<CplmNormalizedSample> a = new ArrayList<>();
        for (int i = 0; i < 50; i++) a.add(s(1000L * i, 50 + i * 0.1, "GOOD"));
        List<CplmNormalizedSample> b = new ArrayList<>(a);
        b.set(10, s(10_000L, 99.0, "GOOD"));
        List<CplmNormalizedSample> c = new ArrayList<>(a);
        c.set(10, s(10_000L, 51.0, "BAD"));
        assertNotEquals(DatasetHash.of(a), DatasetHash.of(b));
        assertNotEquals(DatasetHash.of(a), DatasetHash.of(c));
    }

    @Test
    public void emptySupportIsNamedNotHashed() {
        assertEquals(DatasetHash.EMPTY, DatasetHash.of(new ArrayList<>()));
        assertEquals(DatasetHash.EMPTY, DatasetHash.of(null));
    }
}
