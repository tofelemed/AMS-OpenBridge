package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmGateEngine;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.SynTic001ReferenceGenerator;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** CHG-062a: two ingestion sources on one feed repeat each timestamp; the period must not collapse to 0 s. */
public class DuplicateSamplesTest {
    private static List<CplmNormalizedSample> interleaved(List<CplmNormalizedSample> clean, int copies) {
        List<CplmNormalizedSample> out = new ArrayList<>();
        for (CplmNormalizedSample s : clean) for (int k = 0; k < copies; k++) out.add(s);
        return out;
    }

    @Test
    public void everySampleRepeatedSixTimesGivesTheCleanResult() {
        List<CplmNormalizedSample> clean = SynTic001ReferenceGenerator.generate();
        long start = SynTic001ReferenceGenerator.windowStartMs(), end = SynTic001ReferenceGenerator.windowEndMs();
        CplmLongDiagnosticsResult a = CplmGateEngine.computeLongDiagnostics(clean, start, end, "24h");
        CplmLongDiagnosticsResult b = CplmGateEngine.computeLongDiagnostics(interleaved(clean, 6), start, end, "24h");
        assertEquals(5.0, a.samplePeriodSec, 1e-9);
        assertEquals(a.samplePeriodSec, b.samplePeriodSec, 1e-9);
        assertEquals(a.sampleCount, b.sampleCount);   // duplicates are dropped, so the count is the distinct timestamps
        assertEquals(a.validatedPeriodS, b.validatedPeriodS, 1e-9);
        assertEquals(a.completedCycles, b.completedCycles);
        assertTrue("the clean series finds cycles", a.completedCycles > 0);
    }

    @Test
    public void zeroDiffsAreIgnoredByThePeriodInference() {
        List<CplmNormalizedSample> clean = SynTic001ReferenceGenerator.generate().subList(0, 50);
        assertEquals(5.0, SignalMath.inferSamplePeriodSec(interleaved(clean, 6)), 1e-9);
    }
}
