package com.ams.flink.cplm.response.evidence;

import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.response.estimation.EstimationResult;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ResponseEvidenceWriterTest {
    @Test
    public void everyRequiredArtifactKindIsWrittenWithUnitsAndMasks() {
        int n = 41;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = -20 + 5 * i;
            u[i] = t[i] < 0 ? 40 : 45;
            r[i] = t[i] < 0 ? 100 : 115;
            v[i] = i != 10;
        }
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3, 4, 20);
        ZohSimulator.Result fit = ZohSimulator.simulate(m, t, u, 40, 100, 0, 0, 60);
        for (int i = 0; i < n; i++) y[i] = fit.yHat[i] + 0.1;
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 180);
        ResponseEvent e = new ResponseEvent("evt", "FIC10302", EventType.INPUT_TEST, "OP_TO_PV", 0, 40, 45, Collections.singletonList(new double[] {0, 45}));
        Map<String, Quantity> times = new LinkedHashMap<>();
        times.put("t10", Quantity.of("t10", 6.1, "s", "m"));
        times.put("t90", Quantity.of("t90", 50.0, "s", "m"));
        EstimationResult.Candidate c = new EstimationResult.Candidate(m, 100, 0, 1.0, n, new HashMap<>(), false, false, false, 10, 2.5,
                new double[] {0, 5, 10}, new double[] {2, 1, 3});
        EstimationResult est = new EstimationResult(EstimationResult.State.ESTIMATED, "", Collections.singletonList(c));
        double[] res = new double[n];
        Arrays.fill(res, 0.1);
        List<EvidenceArtifact> a = ResponseEvidenceWriter.artifacts("run-1", e, d, fit, fit.yHat, fit.yHat, fit.yHat, 100, 115, times, res,
                new double[] {1, 0.1}, est, null, Arrays.asList("SOPDT: NO_IMPROVEMENT"));
        Set<String> kinds = new HashSet<>();
        for (EvidenceArtifact x : a) {
            kinds.add(x.kind);
            assertEquals("G12", x.gate);
            assertEquals("run-1", x.methodRunId);
            assertNotNull(x.xUnit);
            assertNotNull(x.yUnit);
        }
        for (String k : ResponseEvidenceWriter.REQUIRED_KINDS) assertTrue(k, kinds.contains(k));
        // every conditional input was supplied here except a frequency result, so all but bode must be present
        for (String k : ResponseEvidenceWriter.CONDITIONAL_KINDS) {
            if (k.equals("bode")) continue;
            assertTrue(k, kinds.contains(k));
        }
        EvidenceArtifact samples = a.stream().filter(x -> x.kind.equals("accepted_samples")).findFirst().get();
        assertNotNull(samples.mask);
        assertFalse(samples.mask[10]);
        assertEquals("PV_EU", samples.yUnit);
        assertEquals("s", samples.xUnit);
        EvidenceArtifact input = a.stream().filter(x -> x.kind.equals("input_reconstruction")).findFirst().get();
        assertEquals("input_EU", input.yUnit);
        EvidenceArtifact bode = a.stream().filter(x -> x.kind.equals("bode")).findFirst().orElse(null);
        assertNull("no frequency result -> no bode artifact (never a fabricated one)", bode);
        EvidenceArtifact band = a.stream().filter(x -> x.kind.equals("prediction_interval")).findFirst().get();
        assertEquals("PREDICTION_INTERVAL_OF_OUTPUT_NOT_PARAMETER_CONFIDENCE", band.provenance.get("band_meaning"));
        // 2E.5: the lower bound is an aligned COLUMN of the band artifact (a Java array in provenance was an object reference)
        assertTrue(band.columns.containsKey("lower"));
        assertEquals(band.x.length, band.columns.get("lower").length);
        assertEquals("PV_EU", band.columnUnits.get("lower"));
        assertEquals("1.5;2.5", ResponseEvidenceWriter.joined(new double[] {1.5, 2.5}));
    }
}
