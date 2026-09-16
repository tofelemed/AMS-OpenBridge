package com.ams.flink.cplm.response;

import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class G12ResultTest {
    /** The catalogue as shipped in the spec workbook (copied to the test classpath from docs/next-release/spec). */
    private static List<String> catalogueIds() throws Exception {
        List<String> ids = new ArrayList<>();
        InputStream in = G12ResultTest.class.getResourceAsStream("/spec/xlsx_Response_quantities.tsv");
        assertNotNull("spec/xlsx_Response_quantities.tsv must be on the test classpath", in);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            boolean header = false;
            while ((line = r.readLine()) != null) {
                if (line.startsWith("Quantity\t")) {
                    header = true;
                    continue;
                }
                if (!header || line.trim().isEmpty()) continue;
                ids.add(line.split("\t")[0].trim());
            }
        }
        return ids;
    }

    @Test
    public void everyCatalogueQuantityIsPresentExactlyOnce() throws Exception {
        List<String> ids = catalogueIds();
        assertEquals(52, ids.size());
        assertEquals(new HashSet<>(ids).size(), ids.size());
        G12Result g = G12Result.empty("FIC10302", "OP_TO_PV");
        for (String id : ids) assertTrue(id, g.metrics.containsKey(id));
        assertEquals(ids.size(), g.metrics.size());
        for (Quantity q : g.metrics.values()) assertFalse(q.quantityId, q.reasonIfNull.isEmpty());
        assertEquals(new HashSet<>(ids), new HashSet<>(G12Result.QUANTITY_IDS));
    }

    @Test
    public void integratingModelsReportNoStaticGainAndGainsAlwaysCarryUnitAndPath() {
        G12Result g = G12Result.empty("LIC10501", "OP_TO_PV");
        ProcessModel m = ProcessModel.ipdt("OP_TO_PV", 0.000166667, 12.0);
        for (Quantity q : m.parameters().values()) g.put(q);
        assertFalse(g.metrics.get("process_gain").available());
        assertEquals("INTEGRATING_OR_NOT_IDENTIFIABLE", g.metrics.get("process_gain").reasonIfNull);
        assertTrue(g.metrics.get("integrating_gain").available());
        String json = g.toJson();
        G12Result back = G12Result.fromJson(json);
        assertEquals("PV_EU/(input_EU*s)", back.metrics.get("integrating_gain").unit);
        assertEquals("OP_TO_PV", back.pathId);
        assertTrue(json.contains("\"path_id\":\"OP_TO_PV\""));
        assertEquals(G12Result.METHOD_ID, back.methodId());
        assertEquals("EVIDENCE_SCORE_UNCALIBRATED", back.scoreSemantics());
        assertEquals(0.000166667, back.metrics.get("integrating_gain").value, 1e-12);
    }

    @Test
    public void subgatesAToHExistAndStartNotEvaluated() {
        G12Result g = G12Result.empty("L", "OP_TO_PV");
        for (String s : new String[] {"A", "B", "C", "D", "E", "F", "G", "H"}) assertEquals("NOT_EVALUATED", g.subgates.get(s).state);
        assertEquals("WAITING", g.evaluationState);
        Set<String> keys = g.subgates.keySet();
        assertEquals(8, keys.size());
    }
}
